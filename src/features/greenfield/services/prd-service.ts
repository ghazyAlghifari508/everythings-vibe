/**
 * PRD persistence — Drizzle. New schema: prd_versions(project_id, version,
 * content, change_summary); projects.share_token exists.
 *
 * Text rules live in `./prd-text` and naming heuristics in `./prd-naming`;
 * this module owns only the database contract.
 */
import { randomBytes } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
	acVersions,
	conversations,
	prdVersions,
	projects,
	tasks,
} from "@/db/schema";
import {
	assertCompletePrdOutput,
	sanitizeModelOutput,
} from "@/features/greenfield/services/prd-text";
import { advanceStep, isPrdLocked } from "@/lib/flow-progress";

export class PrdRevisionConflictError extends Error {}

export interface PrdRevisionGuard {
	userId: string;
	projectId: string;
	baseContent: string;
	version: number;
}

// ponytail: moved from utils.ts - node:crypto crashes browser bundles via utils.ts.
export function generateShareToken(): string {
	return randomBytes(9).toString("base64url");
}

/**
 * Save a PRD version + mark project completed. On generate, set share token.
 * Resolves projectId from conversationId if needed.
 *
 * `changeSummary` overrides the derived summary when the caller already holds a
 * better one — a revision passes the same completion message the user saw, so
 * version history and the chat bubble never drift apart.
 */
export async function savePrdVersion(
	idOrConversationId: string,
	fullResponse: string,
	userMessage: string,
	mode: "generate" | "revise",
	allowShareLink = true,
	changeSummaryOverride?: string,
	revisionGuard?: PrdRevisionGuard,
): Promise<{ prdVersionId: string; version: number } | undefined> {
	let projectId: string | undefined;
	const [conv] = await db
		.select({
			projectId: conversations.projectId,
			userId: conversations.userId,
		})
		.from(conversations)
		.where(eq(conversations.id, idOrConversationId))
		.limit(1);
	if (conv?.projectId) {
		projectId = conv.projectId;
	} else {
		const [proj] = await db
			.select({ id: projects.id })
			.from(projects)
			.where(
				and(eq(projects.id, idOrConversationId), isNull(projects.deletedAt)),
			)
			.limit(1);
		if (proj?.id) {
			projectId = proj.id;
		}
	}
	if (!projectId) {
		console.warn(
			"savePrdVersion: conversation or project missing, content discarded",
			{ idOrConversationId },
		);
		return undefined;
	}

	if (
		mode === "revise" &&
		(!revisionGuard ||
			revisionGuard.projectId !== projectId ||
			(conv && conv.userId !== revisionGuard.userId))
	) {
		throw new PrdRevisionConflictError(
			"Project revisi tidak sesuai atau tidak diizinkan.",
		);
	}

	// HTML-page output (a model that ignored the markdown instruction) is
	// unwrapped to text when possible, then the section contract is enforced
	// before any write.
	const cleanContent = sanitizeModelOutput(fullResponse);
	if (mode === "generate") assertCompletePrdOutput(cleanContent);

	const changeSummary =
		mode === "generate"
			? "Initial PRD generation"
			: changeSummaryOverride?.trim() || `${userMessage.substring(0, 50)}...`;

	// One transaction per project: the row lock serializes concurrent writers
	// so version allocation is atomic (no read-then-insert race and no
	// message-string retry), and the share token only rotates once the output
	// has passed validation above — a rejected generation must not revoke the
	// existing public link.
	return db.transaction(async (tx) => {
		const [project] = await tx
			.select({
				step: projects.step,
				userId: projects.userId,
				projectMode: projects.projectMode,
				acStatus: projects.acStatus,
				taskStatus: projects.taskStatus,
			})
			.from(projects)
			.where(and(eq(projects.id, projectId), isNull(projects.deletedAt)))
			.for("update")
			.limit(1);
		if (!project) throw new Error("Project not found for PRD save");

		if (mode === "revise") {
			// ponytail: locked planning has no approved revision workflow; add server-bound impact review before allowing downstream changes.
			if (
				!revisionGuard ||
				project.userId !== revisionGuard.userId ||
				project.projectMode === "existing_codebase" ||
				isPrdLocked(project.step) ||
				project.acStatus !== "pending" ||
				project.taskStatus !== "pending"
			)
				throw new PrdRevisionConflictError(
					"PRD terkunci atau project tidak diizinkan. Muat ulang planning.",
				);
			const [ac] = await tx
				.select({ id: acVersions.id })
				.from(acVersions)
				.where(eq(acVersions.projectId, projectId))
				.limit(1);
			const [task] = await tx
				.select({ id: tasks.id })
				.from(tasks)
				.where(eq(tasks.projectId, projectId))
				.limit(1);
			if (ac || task)
				throw new PrdRevisionConflictError(
					"PRD terkunci karena AC atau Task sudah tersedia.",
				);
		}
		let nextVersion = 1;
		if (mode === "revise") {
			const [latest] = await tx
				.select({ version: prdVersions.version, content: prdVersions.content })
				.from(prdVersions)
				.where(eq(prdVersions.projectId, projectId))
				.orderBy(desc(prdVersions.version))
				.limit(1);
			if (
				!latest ||
				latest.content !== revisionGuard?.baseContent ||
				latest.version !== revisionGuard.version
			)
				throw new PrdRevisionConflictError(
					"Versi PRD sudah berubah. Muat ulang planning sebelum revisi.",
				);
			nextVersion = latest.version + 1;
		}

		const prdVersionId = crypto.randomUUID();
		await tx.insert(prdVersions).values({
			id: prdVersionId,
			projectId,
			version: nextVersion,
			content: cleanContent,
			changeSummary,
		});

		// Advance step to 'prd' — forward only (mirrors saveAcVersion). A
		// generate marks the project furthest point reached; History sends the
		// user to /prd.
		const nextStep = advanceStep(project.step, "prd");
		const projectUpdate: {
			status: string;
			updatedAt: Date;
			step?: string;
			shareToken?: string;
		} = { status: "completed", updatedAt: new Date() };
		if (nextStep) projectUpdate.step = nextStep;
		if (mode === "generate" && allowShareLink) {
			projectUpdate.shareToken = generateShareToken();
		}
		await tx
			.update(projects)
			.set(projectUpdate)
			.where(eq(projects.id, projectId));

		return { prdVersionId, version: nextVersion };
	});
}

export async function getPrdVersionContent(
	projectId: string,
	version: number,
): Promise<string | null> {
	const [row] = await db
		.select({ content: prdVersions.content })
		.from(prdVersions)
		.where(
			and(
				eq(prdVersions.projectId, projectId),
				eq(prdVersions.version, version),
			),
		)
		.limit(1);
	return row?.content ?? null;
}

export async function getLatestPrdVersion(
	projectId: string,
): Promise<{ content: string; version: number } | null> {
	const [row] = await db
		.select({ content: prdVersions.content, version: prdVersions.version })
		.from(prdVersions)
		.where(eq(prdVersions.projectId, projectId))
		.orderBy(desc(prdVersions.version))
		.limit(1);
	return row ?? null;
}

export async function getLatestPrdContent(
	projectId: string,
): Promise<string | null> {
	return (await getLatestPrdVersion(projectId))?.content ?? null;
}

export async function resolveProjectId(
	projectId: string | undefined,
	conversationId: string | undefined,
): Promise<string | undefined> {
	if (projectId) return projectId;
	if (!conversationId) return undefined;
	const [conv] = await db
		.select({ projectId: conversations.projectId })
		.from(conversations)
		.where(eq(conversations.id, conversationId))
		.limit(1);
	return conv?.projectId ?? undefined;
}
