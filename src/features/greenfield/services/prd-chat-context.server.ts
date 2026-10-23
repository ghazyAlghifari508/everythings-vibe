// Server-only PRD chat context for `POST /api/chat`.
//
// Prepares the project-scoped facts a PRD turn needs (language, planning mode,
// feature-tree SSOT block, repository grounding, active PRD document) and then
// composes the system prompt. Ownership is re-checked here: a foreign or
// tombstoned project id fails closed instead of leaking generation context.
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { acVersions, codebaseSnapshots, projects, tasks } from "@/db/schema";
import {
	buildCodebasePromptBlock,
	getProjectGenerationContext,
	requireProjectGenerationContext,
} from "@/features/codebase/services/generation-context";
import {
	PRD_REVISION_PROMPT,
	PRD_SYSTEM_PROMPT,
} from "@/features/greenfield/prompts/prd";
import {
	FEATURE_TREE_MISSING_MESSAGE,
	featureTreeSchema,
	formatFeatureTreeBlock,
} from "@/features/greenfield/services/feature-service";
import type { PrdChatMode } from "@/features/greenfield/services/prd-chat-request";
import {
	getLatestPrdContent,
	getLatestPrdVersion,
} from "@/features/greenfield/services/prd-service";
import { buildStageScopeDirective } from "@/features/greenfield/utils/planning-mode";
import { depthDirective } from "@/features/greenfield/utils/prompt-depth";
import { isPrdLocked } from "@/lib/flow-progress";
import {
	getLanguageDirective,
	normalizeLanguage,
	type OutputLanguage,
} from "@/lib/language";

export interface PrdChatContext {
	/** Prompt text the repository grounding runs against. */
	groundingSource: string;
	projectLanguage: OutputLanguage;
	projectMode: string | null;
	/** Current PRD document a revision patches; null when none exists. */
	revisionBaseContent: string | null;
	revisionBaseVersion?: number;
	codebaseBlock: string;
	featureTreeBlock: string;
	codebaseSnapshotId?: string;
	codebaseAnalysisId?: string;
	codebaseSnapshotInfo?: { fileCount?: number; sourceBytes?: number };
}

export type PrdChatContextResult =
	| { ok: true; data: PrdChatContext }
	| { ok: false; response: Response };

export async function preparePrdChatContext(input: {
	userId: string;
	projectId: string | undefined;
	mode: PrdChatMode;
	message: string;
	selectedVersionNum?: number;
}): Promise<PrdChatContextResult> {
	const { userId, projectId, mode, message, selectedVersionNum } = input;

	const context: PrdChatContext = {
		groundingSource: message,
		projectLanguage: "id",
		projectMode: null,
		revisionBaseContent: null,
		codebaseBlock: "",
		featureTreeBlock: "",
	};
	if (!projectId) {
		return mode === "revise"
			? {
					ok: false,
					response: Response.json(
						{ error: "Project revisi diperlukan." },
						{ status: 400 },
					),
				}
			: { ok: true, data: context };
	}

	const [project] = await db
		.select({
			id: projects.id,
			language: projects.language,
			projectMode: projects.projectMode,
			step: projects.step,
			acStatus: projects.acStatus,
			taskStatus: projects.taskStatus,
			featureTree: projects.featureTree,
		})
		.from(projects)
		.where(
			and(
				eq(projects.id, projectId),
				eq(projects.userId, userId),
				isNull(projects.deletedAt),
			),
		)
		.limit(1);

	if (!project) {
		return {
			ok: false,
			response: Response.json(
				{ error: "Project not found or unauthorized" },
				{ status: 403 },
			),
		};
	}

	// Fitur SSOT: Bab 4-5 PRD disusun 1:1 dari daftar fitur. Fail closed with an
	// actionable message instead of generating a PRD whose features later stages
	// must discard.
	if (mode === "generate") {
		const parsedTree = featureTreeSchema.safeParse(project.featureTree);
		if (!parsedTree.success) {
			return {
				ok: false,
				response: Response.json(
					{
						error: FEATURE_TREE_MISSING_MESSAGE,
						code: "FEATURE_TREE_MISSING",
					},
					{ status: 409 },
				),
			};
		}
		context.featureTreeBlock = formatFeatureTreeBlock(parsedTree.data);
	}

	const [existingAc] =
		mode === "revise"
			? await db
					.select({ id: acVersions.id })
					.from(acVersions)
					.where(eq(acVersions.projectId, projectId))
					.limit(1)
			: [];
	const [existingTask] =
		mode === "revise"
			? await db
					.select({ id: tasks.id })
					.from(tasks)
					.where(eq(tasks.projectId, projectId))
					.limit(1)
			: [];
	if (
		mode === "revise" &&
		(isPrdLocked(project.step) ||
			project.acStatus !== "pending" ||
			project.taskStatus !== "pending" ||
			existingAc ||
			existingTask)
	) {
		const stageLabel =
			project.step === "task" ? "Task / Kanban" : "Acceptance Criteria";
		return {
			ok: false,
			response: Response.json(
				{
					error: `Dokumen PRD telah dikunci (Read-Only) karena proyek telah mencapai tahap ${stageLabel}.`,
					code: "PRD_LOCKED",
				},
				{ status: 409 },
			),
		};
	}

	if (project.language)
		context.projectLanguage = normalizeLanguage(project.language);
	context.projectMode = project.projectMode ?? null;

	if (project.projectMode === "existing_codebase") {
		try {
			// Fail closed for a fresh PRD generation: a repository-aware PRD must
			// never silently fall back to generic greenfield context. Revisions
			// keep working on the existing document.
			const required =
				mode === "generate"
					? await requireProjectGenerationContext(projectId)
					: { context: null };
			if ("code" in required) {
				return {
					ok: false,
					response: Response.json(required, { status: required.status }),
				};
			}
			const generationContext =
				required.context ?? (await getProjectGenerationContext(projectId));
			if (generationContext) {
				context.codebaseBlock = buildCodebasePromptBlock(generationContext);
				context.codebaseSnapshotId = generationContext.snapshotId;
				context.codebaseAnalysisId = generationContext.analysisId ?? undefined;
				const [snapshot] = await db
					.select({
						fileCount: codebaseSnapshots.fileCount,
						contentSize: codebaseSnapshots.contentSize,
					})
					.from(codebaseSnapshots)
					.where(eq(codebaseSnapshots.id, generationContext.snapshotId))
					.limit(1);
				if (snapshot) {
					context.codebaseSnapshotInfo = {
						fileCount: snapshot.fileCount,
						sourceBytes: snapshot.contentSize,
					};
				}
			}
		} catch {
			/* optional context must never block generation */
		}
	}

	if (mode === "revise" || mode === "chat") {
		const latest =
			mode === "revise" ? await getLatestPrdVersion(projectId) : null;
		const activeContent =
			mode === "revise"
				? latest?.content
				: await getLatestPrdContent(projectId);
		if (
			mode === "revise" &&
			(!activeContent ||
				(selectedVersionNum !== undefined &&
					selectedVersionNum !== latest?.version))
		) {
			return {
				ok: false,
				response: Response.json(
					{
						error:
							"Versi PRD tidak tersedia atau sudah berubah. Muat ulang planning.",
						code: "PRD_VERSION_CONFLICT",
					},
					{ status: 409 },
				),
			};
		}
		if (activeContent) {
			context.groundingSource = `${activeContent}\n\n${message}`;
			if (mode === "revise") {
				context.revisionBaseContent = activeContent;
				context.revisionBaseVersion = latest?.version;
			}
		}
	}

	return { ok: true, data: context };
}

/**
 * Compose the PRD system prompt for this turn, including repository grounding.
 *
 * Called after the credit reservation (matching the original ordering) so a
 * rejected turn never pays for grounding. groundStack() returns "" on any
 * failure and the import itself is guarded, so a Context7 outage degrades the
 * prompt instead of failing the request.
 */
export async function buildPrdChatSystemPrompt(input: {
	mode: PrdChatMode;
	projectLanguage: OutputLanguage;
	projectMode: string | null;
	revisionBaseContent: string | null;
	groundingSource: string;
	codebaseBlock: string;
	featureTreeBlock: string;
}): Promise<string> {
	let systemPrompt: string;
	if (input.mode === "revise") {
		systemPrompt = input.revisionBaseContent
			? `${PRD_REVISION_PROMPT}\n\nCURRENT PRD CONTENT:\n\n${input.revisionBaseContent}`
			: PRD_SYSTEM_PROMPT();
	} else {
		// projectLanguage settles after the project lookup; build the PRD prompt
		// with localized sub-headings now that the value is known.
		systemPrompt = PRD_SYSTEM_PROMPT(input.projectLanguage);
	}
	systemPrompt += `\n${depthDirective("prd")}`;
	systemPrompt += `\n${getLanguageDirective(input.projectLanguage, "prd")}`;
	// Planning mode scope directive: "" for greenfield.
	systemPrompt += buildStageScopeDirective("prd", input.projectMode);

	try {
		const { groundStack } = await import(
			"@/features/greenfield/services/grounding"
		);
		systemPrompt += await groundStack(input.groundingSource);
	} catch (err) {
		console.warn("[grounding] failed to ground stack with Context7:", err);
	}
	systemPrompt += input.codebaseBlock;
	// Fitur SSOT: "" except for mode === "generate" (gated above).
	if (input.featureTreeBlock) systemPrompt += `\n${input.featureTreeBlock}`;
	return systemPrompt;
}
