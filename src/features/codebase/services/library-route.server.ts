// Browser boundary for `/api/codebases`: list the caller's repositories with
// their latest snapshot, and create a codebase plus its first short-lived sync
// session.
//
// Server-import exception: top-level `@/db`, schema, and `.server` imports are
// correct here — server handlers only, no client component. Never import this
// module from client code.
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { codebaseSnapshots, codebases } from "@/db/schema";
import { CODEBASE_LIBRARY_BULK_DELETE_LIMIT_ERROR } from "@/features/codebase/types/codebase-constants";
import { requireUser } from "@/lib/session";
import {
	checkPreSyncCredit,
	getAnalysisCreditPreflight,
} from "./analysis-credit-preflight.server";
import {
	type CodebaseNameSource,
	normalizeRepositoryName,
	PROVISIONAL_CODEBASE_NAME,
	parseCodebaseBulkDelete,
} from "./library";
import { deleteOwnedCodebases } from "./library-delete.server";
import { buildSyncCommand, type SyncPromptPayload } from "./sync";
import { hashSyncToken } from "./sync.server";
import {
	type PreparedSyncSession,
	prepareSyncSession,
} from "./sync-session-prepare.server";

/**
 * Decide a codebase's display name and where that name came from.
 *
 * Provenance matters because the CLI later reports the repository folder name
 * at sync handshake. An explicit name or rename is user-owned; a `message`
 * describes feature intent and must never become repository identity.
 */
export function validateCodebaseNameInput(
	body: unknown,
):
	| { ok: true; name: string; nameSource: CodebaseNameSource }
	| { ok: false; error: string } {
	const rawName =
		typeof body === "object" &&
		body !== null &&
		"name" in body &&
		typeof body.name === "string"
			? body.name.trim()
			: "";
	if (!rawName) {
		return { ok: true, name: PROVISIONAL_CODEBASE_NAME, nameSource: "auto" };
	}
	const normalizedName = normalizeRepositoryName(rawName);
	if (!normalizedName) {
		return {
			ok: false,
			error: "Nama codebase tidak valid",
		};
	}
	return { ok: true, name: normalizedName, nameSource: "user" };
}

// Browser list: codebases owned by the caller with their latest snapshot. No
// project join — ownership flows via codebases.userId.
export async function handleCodebaseList({
	request,
}: {
	request: Request;
}): Promise<Response> {
	let user: { id: string };
	try {
		user = await requireUser(request.headers);
	} catch {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	if (new URL(request.url).searchParams.get("preflight") === "analysis") {
		return Response.json(await getAnalysisCreditPreflight(user.id));
	}
	const rows = await db
		.select({
			id: codebases.id,
			name: codebases.name,
			createdAt: codebases.createdAt,
		})
		.from(codebases)
		.where(eq(codebases.userId, user.id))
		.orderBy(desc(codebases.updatedAt));

	const ids = rows.map((row) => row.id);
	const snapshotRows =
		ids.length === 0
			? []
			: await db
					.select({
						id: codebaseSnapshots.id,
						codebaseId: codebaseSnapshots.codebaseId,
						createdAt: codebaseSnapshots.createdAt,
						commitSha: codebaseSnapshots.commitSha,
						fileCount: codebaseSnapshots.fileCount,
					})
					.from(codebaseSnapshots)
					.innerJoin(codebases, eq(codebaseSnapshots.codebaseId, codebases.id))
					.where(
						and(
							inArray(codebaseSnapshots.codebaseId, ids),
							eq(codebases.userId, user.id),
						),
					)
					.orderBy(desc(codebaseSnapshots.createdAt));

	const latestByCodebase = new Map<
		string,
		{
			id: string;
			createdAt: string | null;
			commitSha: string | null;
			fileCount: number;
		}
	>();
	for (const snapshot of snapshotRows) {
		if (!snapshot.codebaseId) continue;
		if (latestByCodebase.has(snapshot.codebaseId)) continue;
		latestByCodebase.set(snapshot.codebaseId, {
			id: snapshot.id,
			createdAt: snapshot.createdAt?.toISOString() ?? null,
			commitSha: snapshot.commitSha,
			fileCount: snapshot.fileCount,
		});
	}

	return Response.json({
		codebases: rows.map((row) => ({
			id: row.id,
			name: row.name,
			createdAt: row.createdAt?.toISOString() ?? null,
			latestSnapshot: latestByCodebase.get(row.id) ?? null,
		})),
	});
}

// Browser batch delete: the ids are validated here and then deleted inside a
// single ownership-scoped transaction, so the browser never receives a
// per-row outcome it would have to stitch together.
export async function handleCodebaseBulkDelete({
	request,
}: {
	request: Request;
}): Promise<Response> {
	let user: { id: string };
	try {
		user = await requireUser(request.headers);
	} catch {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const body: unknown = await request.json().catch(() => null);
	let ids: string[];
	try {
		ids = parseCodebaseBulkDelete(body).ids;
	} catch {
		return Response.json(
			{ error: "Permintaan hapus tidak valid.", code: "CODEBASE_IDS_INVALID" },
			{ status: 400 },
		);
	}

	try {
		const result = await deleteOwnedCodebases(ids, user.id);
		return Response.json({ success: true, ...result });
	} catch (error) {
		if (
			error instanceof Error &&
			error.message === CODEBASE_LIBRARY_BULK_DELETE_LIMIT_ERROR
		) {
			return Response.json(
				{
					error: error.message,
					code: "CODEBASE_LIMIT_EXCEEDED",
				},
				{ status: 400 },
			);
		}
		console.error(`[codebases/bulk-delete] failed for user ${user.id}:`, error);
		return Response.json(
			{
				error: "Gagal menghapus repository.",
				code: "CODEBASE_DELETE_FAILED",
			},
			{ status: 500 },
		);
	}
}

// One repository per authenticated user + request identity. Replay never
// reissues credentials or creates transport attempts; replacement is explicit.
export async function handleCodebaseCreate({
	request,
}: {
	request: Request;
}): Promise<Response> {
	let user: { id: string };
	try {
		user = await requireUser(request.headers);
	} catch {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}
	const startedAt = Date.now();
	const body: unknown = await request.json().catch(() => null);
	const parsed = z
		.object({
			requestId: z.uuid(),
			name: z.string().optional(),
			message: z.string().optional(),
		})
		.safeParse(body);
	if (!parsed.success)
		return Response.json(
			{
				error: "Permintaan onboarding tidak valid.",
				code: "CODEBASE_ATTEMPT_INVALID",
			},
			{ status: 400 },
		);
	const nameCheck = validateCodebaseNameInput(parsed.data);
	if (!nameCheck.ok)
		return Response.json({ error: nameCheck.error }, { status: 400 });
	const id = hashSyncToken(JSON.stringify([user.id, parsed.data.requestId]));
	const requestHash = hashSyncToken(
		JSON.stringify([
			"create-codebase",
			nameCheck.name,
			nameCheck.nameSource,
			parsed.data.message ?? null,
		]),
	);
	let operation: "created" | "reused" = "reused";
	const diagnose = (
		result: string,
		safeErrorCode: string | null,
		syncSessionId: string | null = null,
	) =>
		console.info("[codebase/onboarding]", {
			onboardingAttemptId: parsed.data.requestId,
			userId: user.id,
			codebaseId: id,
			syncSessionId,
			operation,
			result,
			durationMs: Date.now() - startedAt,
			safeErrorCode,
		});
	let created:
		| { kind: "conflict" }
		| { kind: "blocked"; response: Response }
		| (PreparedSyncSession & {
				kind: "session";
				codebase: { id: string; name: string };
		  });
	const preflight = await checkPreSyncCredit(user.id);
	try {
		created = await db.transaction(async (tx) => {
			await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${id}))`);
			const [existing] = await tx
				.select({
					id: codebases.id,
					name: codebases.name,
					requestHash: codebases.onboardingRequestHash,
				})
				.from(codebases)
				.where(and(eq(codebases.id, id), eq(codebases.userId, user.id)))
				.limit(1);
			if (existing) {
				if (existing.requestHash !== requestHash)
					return { kind: "conflict" as const };
				return {
					kind: "session" as const,
					codebase: existing,
					...(await prepareSyncSession(tx, user.id, id, undefined, true)),
				};
			}
			if (preflight.response)
				return { kind: "blocked" as const, response: preflight.response };
			const [codebase] = await tx
				.insert(codebases)
				.values({
					id,
					userId: user.id,
					name: nameCheck.name,
					nameSource: nameCheck.nameSource,
					onboardingRequestHash: requestHash,
				})
				.returning({ id: codebases.id, name: codebases.name });
			if (!codebase) throw new Error("Codebase insert returned no row");
			operation = "created";
			return {
				kind: "session" as const,
				codebase,
				...(await prepareSyncSession(tx, user.id, id)),
			};
		});
	} catch (error) {
		diagnose("failed", "CODEBASE_CREATE_FAILED");
		console.error(
			"[codebases/create] persistence failed",
			error instanceof Error ? error.name : "UnknownError",
		);
		return Response.json(
			{
				error: "Gagal membuat codebase",
				code: "CODEBASE_CREATE_FAILED",
			},
			{ status: 500 },
		);
	}

	if (created.kind === "blocked") {
		diagnose("blocked", "CREDIT_REQUIRED");
		return created.response;
	}
	if (created.kind === "conflict") {
		diagnose("conflict", "CODEBASE_ATTEMPT_CONFLICT");
		return Response.json(
			{
				error: "Identitas percobaan sudah digunakan untuk permintaan berbeda.",
				code: "CODEBASE_ATTEMPT_CONFLICT",
			},
			{ status: 409 },
		);
	}
	diagnose("success", null, created.session.id);
	if (!created.token)
		return Response.json(
			{
				id: created.codebase.id,
				name: created.codebase.name,
				sessionId: created.session.id,
				code: "CODEBASE_SESSION_RECOVERY_REQUIRED",
				operation,
			},
			{ headers: { "Cache-Control": "no-store", Pragma: "no-cache" } },
		);
	const sync: SyncPromptPayload = {
		projectId: id,
		sessionId: created.session.id,
		apiBaseUrl: new URL(request.url).origin,
		syncToken: created.token,
		cliMinVersion: created.session.cliMinVersion,
		syncCommand: buildSyncCommand(id),
		expiresAt: created.session.expiresAt.toISOString(),
	};
	return Response.json(
		{
			id: created.codebase.id,
			name: created.codebase.name,
			sync,
		},
		{ headers: { "Cache-Control": "no-store", Pragma: "no-cache" } },
	);
}
