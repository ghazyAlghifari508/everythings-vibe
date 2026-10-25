import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { codebaseGenerationOperations, projects } from "@/db/schema";
import type {
	DurableExecutionOptions,
	DurableGenerationClaim,
	DurableGenerationSource,
	WorkspaceGenerationExecutor,
} from "../types/durable-generation";
import type {
	WorkspaceGenerationOperation,
	WorkspaceGenerationRequest,
} from "../types/workspace-generation";
import {
	verifyClaimLeaseFence,
	withProjectGenerationLock,
} from "./durable-generation-fence";
import { computeGenerationIdentityHash } from "./durable-generation-hash";
import {
	completeGenerationOperation,
	DEFAULT_EXECUTION_TIMEOUT_MS,
	DEFAULT_HEARTBEAT_MS,
	DEFAULT_LEASE_MS,
	DEFAULT_MAX_ATTEMPTS,
	failGenerationOperation,
	renewGenerationClaim,
	toWorkspaceGenerationOperation,
} from "./durable-generation-ops";
import { assertProjectTenantAccess } from "./durable-generation-tenant";
import { readWorkspaceGenerationArtifact } from "./workspace-generation-artifact.server";

export * from "./durable-generation-fence";
export * from "./durable-generation-hash";
export * from "./durable-generation-ops";
export * from "./durable-generation-recovery";
export * from "./durable-generation-tenant";

export class DurableGenerationError extends Error {
	constructor(
		message: string,
		readonly code: string,
		readonly status = 409,
	) {
		super(message);
	}
}

function identity(
	userId: string,
	request: WorkspaceGenerationRequest,
	source?: DurableGenerationSource,
) {
	return computeGenerationIdentityHash({
		userId,
		projectId: request.projectId,
		stage: request.stage,
		inputRevision: source?.inputRevision,
		input: request.input,
	});
}

export async function getExistingGenerationOperation(
	userId: string,
	request: WorkspaceGenerationRequest,
	source?: DurableGenerationSource,
): Promise<WorkspaceGenerationOperation | null> {
	await assertProjectTenantAccess(userId, request.projectId);
	const [row] = await db
		.select()
		.from(codebaseGenerationOperations)
		.where(
			and(
				eq(codebaseGenerationOperations.userId, userId),
				eq(codebaseGenerationOperations.projectId, request.projectId),
				eq(
					codebaseGenerationOperations.identityHash,
					identity(userId, request, source),
				),
			),
		)
		.limit(1);
	return row ? toWorkspaceGenerationOperation(row) : null;
}

export async function getOrCreateGenerationOperation(
	userId: string,
	request: WorkspaceGenerationRequest,
	source?: DurableGenerationSource,
): Promise<WorkspaceGenerationOperation> {
	await assertProjectTenantAccess(userId, request.projectId);
	const identityHash = identity(userId, request, source);
	return db.transaction(async (tx) => {
		// Serializes submissions across tabs and stages, not the long model execution.
		const [project] = await tx
			.select({ id: projects.id })
			.from(projects)
			.where(
				and(
					eq(projects.id, request.projectId),
					eq(projects.userId, userId),
					isNull(projects.deletedAt),
				),
			)
			.for("update")
			.limit(1);
		if (!project)
			throw new DurableGenerationError(
				"Project tidak ditemukan.",
				"PROJECT_NOT_FOUND",
				404,
			);
		const ownedIdentity = and(
			eq(codebaseGenerationOperations.userId, userId),
			eq(codebaseGenerationOperations.projectId, request.projectId),
			eq(codebaseGenerationOperations.identityHash, identityHash),
		);
		const [existing] = await tx
			.select()
			.from(codebaseGenerationOperations)
			.where(ownedIdentity)
			.limit(1);
		if (
			existing &&
			(existing.status === "completed" ||
				existing.status === "queued" ||
				existing.status === "running" ||
				!request.retry)
		)
			return toWorkspaceGenerationOperation(existing);
		const [active] = await tx
			.select({ id: codebaseGenerationOperations.id })
			.from(codebaseGenerationOperations)
			.where(
				and(
					eq(codebaseGenerationOperations.userId, userId),
					eq(codebaseGenerationOperations.projectId, request.projectId),
					inArray(codebaseGenerationOperations.status, ["queued", "running"]),
				),
			)
			.limit(1);
		if (active)
			throw new DurableGenerationError(
				"Generasi sebelumnya masih diproses. Tunggu hingga selesai.",
				"GENERATION_CONFLICT",
			);
		if (existing) {
			if (existing.attempt >= existing.maxAttempts)
				throw new DurableGenerationError(
					"Batas percobaan tercapai. Hubungi dukungan.",
					"ATTEMPTS_EXHAUSTED",
				);
			if (
				existing.errorCode === "CREDIT_QUARANTINED" ||
				existing.errorCode === "CREDIT_ALREADY_SETTLED"
			)
				throw new DurableGenerationError(
					"Hasil dan kredit perlu diperiksa sebelum mencoba kembali.",
					"ACCOUNTING_RECONCILIATION_REQUIRED",
				);
			const [retried] = await tx
				.update(codebaseGenerationOperations)
				.set({
					status: "queued",
					error: null,
					errorCode: null,
					jobToken: null,
					leaseExpiresAt: null,
					startedAt: null,
					finishedAt: null,
					updatedAt: new Date(),
				})
				.where(
					and(
						ownedIdentity,
						eq(codebaseGenerationOperations.id, existing.id),
						eq(codebaseGenerationOperations.status, existing.status),
						eq(codebaseGenerationOperations.attempt, existing.attempt),
					),
				)
				.returning();
			if (!retried)
				throw new DurableGenerationError(
					"Status generasi telah berubah. Muat ulang workspace.",
					"GENERATION_CONFLICT",
				);
			return toWorkspaceGenerationOperation(retried);
		}
		const artifact = await readWorkspaceGenerationArtifact(
			userId,
			request.projectId,
			request.stage,
		);
		const [prior] = await tx
			.select({ id: codebaseGenerationOperations.id })
			.from(codebaseGenerationOperations)
			.where(
				and(
					eq(codebaseGenerationOperations.userId, userId),
					eq(codebaseGenerationOperations.projectId, request.projectId),
					eq(codebaseGenerationOperations.stage, request.stage),
				),
			)
			.limit(1);
		// Adopt legacy persisted outputs once; changed revisions with an operation history must generate a new version.
		const adopted =
			!prior && artifact && request.stage !== "questions" ? artifact : null;
		if (prior && artifact && request.stage === "feature")
			throw new DurableGenerationError(
				"Spesifikasi fitur sudah tersimpan. Buat planning baru untuk mengubah konteksnya.",
				"FEATURE_INPUT_LOCKED",
			);
		const now = new Date();
		const [created] = await tx
			.insert(codebaseGenerationOperations)
			.values({
				userId,
				projectId: request.projectId,
				stage: request.stage,
				status: adopted ? "completed" : "queued",
				identityHash,
				input: request.input,
				source: source ?? null,
				baselineArtifactId: artifact?.artifactId ?? null,
				artifactId: adopted?.artifactId ?? null,
				result: adopted?.result ?? null,
				attempt: 0,
				maxAttempts: DEFAULT_MAX_ATTEMPTS,
				createdAt: now,
				updatedAt: now,
				finishedAt: adopted ? now : null,
			})
			.returning();
		if (!created)
			throw new Error("Generation operation could not be persisted");
		return toWorkspaceGenerationOperation(created);
	});
}

export async function listGenerationOperations(
	userId: string,
	projectId: string,
): Promise<WorkspaceGenerationOperation[]> {
	await assertProjectTenantAccess(userId, projectId);
	const rows = await db
		.select()
		.from(codebaseGenerationOperations)
		.where(
			and(
				eq(codebaseGenerationOperations.userId, userId),
				eq(codebaseGenerationOperations.projectId, projectId),
			),
		)
		.orderBy(desc(codebaseGenerationOperations.createdAt));
	const latest = new Map<string, WorkspaceGenerationOperation>();
	for (const row of rows)
		if (!latest.has(row.stage))
			latest.set(row.stage, toWorkspaceGenerationOperation(row));
	return [...latest.values()];
}

export async function getGenerationOperation(
	userId: string,
	operationId: string,
): Promise<WorkspaceGenerationOperation | null> {
	const [row] = await db
		.select()
		.from(codebaseGenerationOperations)
		.where(
			and(
				eq(codebaseGenerationOperations.id, operationId),
				eq(codebaseGenerationOperations.userId, userId),
			),
		)
		.limit(1);
	if (!row) return null;
	await assertProjectTenantAccess(userId, row.projectId);
	return toWorkspaceGenerationOperation(row);
}

export async function executeGenerationOperationBounded(
	claim: DurableGenerationClaim,
	executor: WorkspaceGenerationExecutor,
	options: DurableExecutionOptions = {},
): Promise<WorkspaceGenerationOperation> {
	const controller = new AbortController();
	const signal = AbortSignal.any([
		claim.signal,
		controller.signal,
		AbortSignal.timeout(options.timeoutMs ?? DEFAULT_EXECUTION_TIMEOUT_MS),
	]);
	let heartbeatRunning = false;
	const timer = setInterval(() => {
		if (heartbeatRunning || signal.aborted) return;
		heartbeatRunning = true;
		void renewGenerationClaim(claim, {
			leaseMs: options.leaseMs ?? DEFAULT_LEASE_MS,
		})
			.then((renewed) => {
				if (!renewed) controller.abort(new Error("Generation lease lost"));
			})
			.catch((error: unknown) => controller.abort(error))
			.finally(() => {
				heartbeatRunning = false;
			});
	}, options.heartbeatMs ?? DEFAULT_HEARTBEAT_MS);
	try {
		const execution = await withProjectGenerationLock(
			claim.projectId,
			async (lockSignal) => {
				const executionSignal = AbortSignal.any([signal, lockSignal]);
				executionSignal.throwIfAborted();
				if (!(await verifyClaimLeaseFence(claim.operationId, claim.token)))
					throw new Error("Generation lease expired before execution");
				const result = await executor({ ...claim, signal: executionSignal });
				executionSignal.throwIfAborted();
				const persisted = await readWorkspaceGenerationArtifact(
					claim.userId,
					claim.projectId,
					claim.stage,
				);
				if (
					!result.artifactId ||
					!persisted ||
					result.artifactId !== persisted.artifactId
				)
					throw new Error(
						"Generation result has no matching persisted artifact",
					);
				if (!(await completeGenerationOperation(claim, result)))
					throw new Error("Generation completion fence rejected");
			},
		);
		if (!execution.acquired)
			throw new Error("Another generation worker still owns the project");
	} catch (error) {
		const code =
			error instanceof Error &&
			"code" in error &&
			typeof error.code === "string"
				? error.code
				: "EXECUTION_ERROR";
		console.error(
			"Durable generation execution failed:",
			claim.operationId,
			error,
		);
		await failGenerationOperation(claim, {
			message:
				"Generasi terhenti. Hasil yang tersimpan tetap tersedia; coba kembali setelah status diperiksa.",
			code,
		});
	} finally {
		clearInterval(timer);
	}
	const operation = await getGenerationOperation(
		claim.userId,
		claim.operationId,
	);
	if (!operation) throw new Error("Generation operation could not be resolved");
	return operation;
}
