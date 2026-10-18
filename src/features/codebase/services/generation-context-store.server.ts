import {
	CODEBASE_GENERATION_MAX_ANSWER_CHARS,
	CODEBASE_GENERATION_MAX_PATHS,
} from "@/features/codebase/types/codebase-constants";
import { safeParseCodebaseAnalysis } from "./analysis";
import {
	buildGenerationContext,
	type GenerationContext,
	truncateText,
} from "./generation-context-build";
import {
	type AskHandoff,
	askHandoffStateSchema,
	parseStoredHandoffAnswers,
	sanitizeAskHandoff,
} from "./generation-context-handoff";
import { selectNewestReadyAnalysis } from "./generation-context-selection";
import { manifestEntrySchema } from "./sync";

// === Generation link row (pure) ===
// Snapshot identity is linked to generated output through a
// codebase_generation_contexts record instead of changing AC/task
// version/deletion semantics.

export interface GenerationLinkInput {
	projectId: string;
	snapshotId: string;
	analysisId?: string;
}

export interface GenerationLinkRow {
	id: string;
	projectId: string;
	snapshotId: string;
	analysisId: string | null;
}

function newLinkId(): string {
	try {
		if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
			return crypto.randomUUID();
		}
	} catch {
		/* fall through to Math.random fallback */
	}
	return `gen_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e9).toString(36)}`;
}

export function buildGenerationLinkRow(
	input: GenerationLinkInput,
): GenerationLinkRow {
	return {
		id: newLinkId(),
		projectId: input.projectId,
		snapshotId: input.snapshotId,
		analysisId: input.analysisId ?? null,
	};
}

// === Server loaders (dynamic db import keeps server-only deps out of the
// client bundle; never import "@/db" at module top-level here) ===

/** Load the validated, snapshot-bound generation context for a project.
 *  Returns null for greenfield projects, projects without a ready snapshot,
 *  or snapshots without a ready (validated) analysis. Never throws for
 *  missing data — callers treat null as "generate without codebase context".
 *  Consumes no credits. */
export async function getProjectGenerationContext(
	projectId: string,
): Promise<GenerationContext | null> {
	const { db } = await import("@/db");
	const { codebaseAnalyses, codebaseAskHandoffs, codebaseSnapshots, projects } =
		await import("@/db/schema");
	const { and, desc, eq, isNull } = await import("drizzle-orm");

	const [project] = await db
		.select({
			projectMode: projects.projectMode,
			name: projects.name,
			description: projects.description,
			codebaseId: projects.codebaseId,
		})
		.from(projects)
		.where(and(eq(projects.id, projectId), isNull(projects.deletedAt)))
		.limit(1);
	if (!project || project.projectMode !== "existing_codebase") return null;

	// Repository-aware mode resolves context at the CODEBASE level. The
	// onboarding analysis runs against the codebase's onboarding project, not
	// the user's feature project, so looking up analyses by the feature
	// project id alone would find nothing and silently drop to greenfield.
	// Joining analyses through snapshots keeps every feature project of the
	// same repository grounded on the same trusted context. A project without a
	// codebase id falls back to its own analyses (legacy project-scoped rows).
	const analysisRows = project.codebaseId
		? await db
				.select({
					id: codebaseAnalyses.id,
					status: codebaseAnalyses.status,
					output: codebaseAnalyses.output,
					snapshotId: codebaseAnalyses.snapshotId,
					createdAt: codebaseAnalyses.createdAt,
				})
				.from(codebaseAnalyses)
				.innerJoin(
					codebaseSnapshots,
					eq(codebaseAnalyses.snapshotId, codebaseSnapshots.id),
				)
				.where(eq(codebaseSnapshots.codebaseId, project.codebaseId))
				.orderBy(desc(codebaseAnalyses.createdAt))
		: await db
				.select({
					id: codebaseAnalyses.id,
					status: codebaseAnalyses.status,
					output: codebaseAnalyses.output,
					snapshotId: codebaseAnalyses.snapshotId,
					createdAt: codebaseAnalyses.createdAt,
				})
				.from(codebaseAnalyses)
				.where(eq(codebaseAnalyses.projectId, projectId))
				.orderBy(desc(codebaseAnalyses.createdAt));
	const readyAnalysis = selectNewestReadyAnalysis(
		analysisRows.map((row) => ({
			id: row.id,
			status: row.status,
			createdAt: row.createdAt?.toISOString() ?? "",
		})),
	);
	if (!readyAnalysis) return null;
	const readyRow = analysisRows.find((row) => row.id === readyAnalysis.id);
	if (!readyRow) return null;
	const parsed = safeParseCodebaseAnalysis(readyRow.output);
	if (!parsed.success) return null;

	// The snapshot is the one this feature's analysis was written against — not
	// the codebase's newest. A re-sync must not rewrite an existing feature's
	// context.
	const [activeRow] = await db
		.select({
			id: codebaseSnapshots.id,
			status: codebaseSnapshots.status,
			branch: codebaseSnapshots.branch,
			commitSha: codebaseSnapshots.commitSha,
			manifest: codebaseSnapshots.manifest,
			fileCount: codebaseSnapshots.fileCount,
			excludedCount: codebaseSnapshots.excludedCount,
			createdAt: codebaseSnapshots.createdAt,
		})
		.from(codebaseSnapshots)
		.where(eq(codebaseSnapshots.id, readyRow.snapshotId))
		.limit(1);
	if (!activeRow) return null;

	// Relevant paths come from the validated manifest only — never invented.
	let relevantPaths: string[] = [];
	try {
		const manifest = manifestEntrySchema
			.array()
			.safeParse(activeRow.manifest ?? []);
		if (manifest.success) {
			relevantPaths = manifest.data
				.map((entry) => entry.path)
				.slice(0, CODEBASE_GENERATION_MAX_PATHS);
		}
	} catch {
		relevantPaths = [];
	}

	// Authoritative persisted Ask answers (best-effort: missing handoff
	// degrades to empty answers, never a generation failure).
	let userAnswers: string[] = [];
	try {
		const [handoff] = await db
			.select({
				answers: codebaseAskHandoffs.answers,
				snapshotId: codebaseAskHandoffs.snapshotId,
			})
			.from(codebaseAskHandoffs)
			.where(eq(codebaseAskHandoffs.projectId, projectId))
			.limit(1);
		if (handoff) {
			userAnswers = parseStoredHandoffAnswers(handoff.answers).map(
				(entry) =>
					`${truncateText(entry.question, 200)}: ${truncateText(entry.answer, CODEBASE_GENERATION_MAX_ANSWER_CHARS)}`,
			);
		}
	} catch {
		userAnswers = [];
	}

	const featurePrompt =
		project.description?.trim() || project.name?.trim() || projectId;

	return buildGenerationContext({
		featurePrompt,
		userAnswers,
		analysis: parsed.data,
		snapshot: {
			snapshotId: activeRow.id,
			projectId,
			branch: activeRow.branch,
			commitSha: activeRow.commitSha,
			fileCount: activeRow.fileCount ?? 0,
			excludedCount: activeRow.excludedCount ?? 0,
			relevantPaths,
		},
		analysisId: readyRow?.id,
	});
}

/** Resolve the snapshot of the project's newest ready analysis for handoff
 *  traceability (Task 9 write-through). Returns null when no analysis is
 *  ready, but preserves database failures so callers never silently lose
 *  snapshot identity. Generation resolves the same way at call time (see
 *  getProjectGenerationContext); the stamped id is advisory traceability
 *  only. */
export async function resolveActiveSnapshotId(
	projectId: string,
): Promise<string | null> {
	const { db } = await import("@/db");
	const { codebaseAnalyses } = await import("@/db/schema");
	const { desc, eq } = await import("drizzle-orm");
	const rows = await db
		.select({
			id: codebaseAnalyses.id,
			status: codebaseAnalyses.status,
			snapshotId: codebaseAnalyses.snapshotId,
			createdAt: codebaseAnalyses.createdAt,
		})
		.from(codebaseAnalyses)
		.where(eq(codebaseAnalyses.projectId, projectId))
		.orderBy(desc(codebaseAnalyses.createdAt));
	const newest = selectNewestReadyAnalysis(
		rows.map((row) => ({
			id: row.id,
			status: row.status,
			createdAt: row.createdAt?.toISOString() ?? "",
		})),
	);
	if (!newest) return null;
	return rows.find((row) => row.id === newest.id)?.snapshotId ?? null;
}

/** Persist the snapshot-identity link after a successful generation.
 *  Non-fatal by design: link failures never block generation output.
 *  Consumes no credits. */
export async function linkGenerationContext(
	projectId: string,
	snapshotId: string,
	analysisId?: string,
): Promise<void> {
	try {
		const { db } = await import("@/db");
		const { codebaseGenerationContexts } = await import("@/db/schema");
		await db
			.insert(codebaseGenerationContexts)
			.values(buildGenerationLinkRow({ projectId, snapshotId, analysisId }));
	} catch (error) {
		console.warn("linkGenerationContext skipped:", error);
	}
}

/** Upsert the authoritative Ask handoff (ownership-checked by the caller).
 *  Throws on DB errors — the route maps them to 500. */
export async function saveAskHandoff(
	userId: string,
	input: AskHandoff,
	executor?: Pick<typeof import("@/db").db, "insert">,
): Promise<void> {
	const clean = sanitizeAskHandoff(input);
	const database = executor ?? (await import("@/db")).db;
	const { codebaseAskHandoffs } = await import("@/db/schema");
	await database
		.insert(codebaseAskHandoffs)
		.values({
			projectId: clean.projectId,
			userId,
			snapshotId: clean.snapshotId ?? null,
			answers: clean.answers,
			compiledPrompt: clean.compiledPrompt ?? null,
			state: clean.state ?? null,
			updatedAt: new Date(),
		})
		.onConflictDoUpdate({
			target: [codebaseAskHandoffs.projectId],
			set: {
				userId,
				snapshotId: clean.snapshotId ?? null,
				answers: clean.answers,
				...(clean.compiledPrompt !== undefined
					? { compiledPrompt: clean.compiledPrompt }
					: {}),
				state: clean.state ?? null,
				updatedAt: new Date(),
			},
		});
}

/** Read the authoritative Ask handoff. Returns null when absent or owned by
 *  another user — never throws for missing data. */
export async function getAskHandoff(
	projectId: string,
	userId: string,
): Promise<AskHandoff | null> {
	const { db } = await import("@/db");
	const { codebaseAskHandoffs } = await import("@/db/schema");
	const { and, eq } = await import("drizzle-orm");
	const [row] = await db
		.select({
			answers: codebaseAskHandoffs.answers,
			compiledPrompt: codebaseAskHandoffs.compiledPrompt,
			snapshotId: codebaseAskHandoffs.snapshotId,
			state: codebaseAskHandoffs.state,
		})
		.from(codebaseAskHandoffs)
		.where(
			and(
				eq(codebaseAskHandoffs.projectId, projectId),
				eq(codebaseAskHandoffs.userId, userId),
			),
		)
		.limit(1);
	if (!row) {
		return null;
	}
	if (!row.compiledPrompt && !row.state) {
		return null;
	}
	const stateParsed =
		row.state && typeof row.state === "object"
			? askHandoffStateSchema.safeParse(row.state)
			: null;
	return sanitizeAskHandoff({
		projectId,
		answers: parseStoredHandoffAnswers(row.answers),
		...(row.compiledPrompt ? { compiledPrompt: row.compiledPrompt } : {}),
		...(row.snapshotId ? { snapshotId: row.snapshotId } : {}),
		...(stateParsed?.success ? { state: stateParsed.data } : {}),
	});
}
