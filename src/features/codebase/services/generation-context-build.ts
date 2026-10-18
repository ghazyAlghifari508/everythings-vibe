import {
	CODEBASE_GENERATION_MAX_ANSWER_CHARS,
	CODEBASE_GENERATION_MAX_CONSTRAINTS,
	CODEBASE_GENERATION_MAX_CONTEXT_CHARS,
	CODEBASE_GENERATION_MAX_FINDINGS,
	CODEBASE_GENERATION_MAX_PATHS,
	CODEBASE_GENERATION_MAX_PROMPT_CHARS,
	CODEBASE_GENERATION_MAX_SUMMARY_CHARS,
} from "@/features/codebase/types/codebase-constants";
import type { CodebaseAnalysis, CodebaseAnalysisFinding } from "./analysis";
import type { SnapshotContext } from "./sync";

// === Generation context ===
// Snapshot identity is linked to generated output through this
// project-owned context record instead of changing existing AC/task version
// semantics. Every stage (Ask, PRD, AC, Task) receives the same six sections:
// feature request, user answers, codebase analysis, relevant module/file
// paths, known constraints, and the source snapshot identifier.

export interface GenerationContextInput {
	featurePrompt: string;
	userAnswers?: string[];
	analysis: CodebaseAnalysis;
	snapshot: SnapshotContext;
	/** Analysis DB record id, filled by the caller loading from storage. */
	analysisId?: string;
}

export interface SnapshotGenerationContext {
	projectId: string;
	snapshotId: string;
	analysisId?: string;
	featurePrompt: string;
	userAnswers: string[];
	analysisSummary: string;
	relevantPaths: string[];
	constraints: string[];
	uncertainFindings: CodebaseAnalysisFinding[];
	/**
	 * Repository capability facts derived from the analysis, for evidence-based
	 * scope validation. `"absent"` is a positive finding (e.g. `database: null`),
	 * `"unknown"` is silence. Optional so contexts built from a partial analysis
	 * keep parsing.
	 */
	capabilities?: RepositoryCapabilities;
}

export interface RepositoryCapabilities {
	database: "absent" | "present" | "unknown";
	backend_api: "absent" | "present" | "unknown";
	authentication: "absent" | "present" | "unknown";
}

/**
 * Derive capability facts from the analysis. A `null` database/auth is a
 * positive finding of absence; a named one is presence; an absent field is
 * unknown and can never justify flagging work.
 *
 * There is no explicit "backend" field in the analysis contract, so it is
 * inferred from the module map: an analysis that reports no backend-ish module
 * while also reporting no database is treated as client-only. Anything less
 * certain stays `unknown`.
 */
export function deriveRepositoryCapabilities(
	analysis: CodebaseAnalysis,
): RepositoryCapabilities {
	const database =
		analysis.database === null
			? "absent"
			: analysis.database && analysis.database.trim().length > 0
				? "present"
				: "unknown";
	const authentication =
		analysis.auth === null
			? "absent"
			: analysis.auth && analysis.auth.trim().length > 0
				? "present"
				: "unknown";

	const modulePaths = (analysis.moduleMap ?? []).map((entry) =>
		entry.path.toLowerCase(),
	);
	const hasServerModule = modulePaths.some((path) =>
		/(^|\/)(server|api|backend|routes?\/api|controllers?|services?\/server)/.test(
			path,
		),
	);
	// Only assert "absent" when the analysis positively reports no database;
	// otherwise silence must stay unknown so no task is flagged by omission.
	const backendApi: RepositoryCapabilities["backend_api"] = hasServerModule
		? "present"
		: database === "absent"
			? "absent"
			: "unknown";

	return { database, backend_api: backendApi, authentication };
}

export function buildAnalysisSummary(analysis: CodebaseAnalysis): string {
	const parts: string[] = [];
	if (analysis.framework) parts.push(`framework ${analysis.framework}`);
	if (analysis.language) parts.push(`language ${analysis.language}`);
	if (analysis.packageManager)
		parts.push(`package manager ${analysis.packageManager}`);
	if (analysis.dependencies && analysis.dependencies.length > 0)
		parts.push(`dependencies ${analysis.dependencies.join(", ")}`);
	if (analysis.database) {
		parts.push(`database ${analysis.database}`);
	} else if (analysis.database === null) {
		parts.push("database None (client-side only / external API)");
	}
	if (analysis.auth) parts.push(`auth ${analysis.auth}`);
	for (const entry of analysis.moduleMap ?? []) {
		parts.push(`${entry.path} (${entry.summary})`);
	}
	return parts.length > 0 ? parts.join("; ") : "-";
}

export function buildGenerationContext(
	input: GenerationContextInput,
): SnapshotGenerationContext {
	const {
		featurePrompt,
		userAnswers = [],
		analysis,
		snapshot,
		analysisId,
	} = input;
	const relevantPaths = [
		...(analysis.relevantFiles ?? []),
		...(analysis.moduleMap?.map((entry) => entry.path) ?? []),
		...(snapshot.relevantPaths ?? []),
	];
	const constraints = [...(analysis.limitations ?? [])];
	const uncertainFindings = (analysis.findings ?? []).filter(
		(finding) => finding.uncertainty && finding.uncertainty.length > 0,
	);
	return {
		projectId: snapshot.projectId,
		snapshotId: snapshot.snapshotId,
		analysisId,
		featurePrompt,
		userAnswers,
		analysisSummary: buildAnalysisSummary(analysis),
		relevantPaths: [...new Set(relevantPaths)],
		constraints,
		uncertainFindings,
		capabilities: deriveRepositoryCapabilities(analysis),
	};
}

export function formatGenerationContext(
	context: SnapshotGenerationContext,
): string {
	const lines = [
		`Feature request: ${context.featurePrompt}`,
		`User answers: ${context.userAnswers.length > 0 ? context.userAnswers.join(" | ") : "-"}`,
		`Codebase analysis: ${context.analysisSummary}`,
		`Relevant modules/files: ${context.relevantPaths.length > 0 ? context.relevantPaths.join(", ") : "-"}`,
		`Known constraints: ${context.constraints.length > 0 ? context.constraints.join(" | ") : "-"}`,
		...context.uncertainFindings.map(
			(finding) =>
				`Assumption to verify [${finding.title}]: ${finding.uncertainty}`,
		),
		`Source snapshot: ${context.snapshotId}`,
	];
	return lines.join("\n");
}

// === Task 8: bounded generation grounding + Ask handoff ===
// Plan interface alias: getProjectGenerationContext(projectId) returns null
// for greenfield and a snapshot-bound GenerationContext for ready
// existing-codebase projects. Every generator consumes this one builder —
// snapshot queries and formatting are never duplicated per route.

/** Plan-interface alias for the snapshot-bound generation context. */
export type GenerationContext = SnapshotGenerationContext;

export function truncateText(value: string, maxChars: number): string {
	if (value.length <= maxChars) return value;
	return value.slice(0, maxChars);
}

/** Bound a context to the CODEBASE_GENERATION_* limits. Snapshot identity
 *  (projectId/snapshotId/analysisId) always survives limiting. */
export function limitGenerationContext(
	context: SnapshotGenerationContext,
): SnapshotGenerationContext {
	return {
		...context,
		featurePrompt: truncateText(
			context.featurePrompt,
			CODEBASE_GENERATION_MAX_PROMPT_CHARS,
		),
		userAnswers: context.userAnswers.map((answer) =>
			truncateText(answer, CODEBASE_GENERATION_MAX_ANSWER_CHARS),
		),
		analysisSummary: truncateText(
			context.analysisSummary,
			CODEBASE_GENERATION_MAX_SUMMARY_CHARS,
		),
		constraints: context.constraints.slice(
			0,
			CODEBASE_GENERATION_MAX_CONSTRAINTS,
		),
		relevantPaths: context.relevantPaths.slice(
			0,
			CODEBASE_GENERATION_MAX_PATHS,
		),
		uncertainFindings: context.uncertainFindings.slice(
			0,
			CODEBASE_GENERATION_MAX_FINDINGS,
		),
	};
}

/** One formatting boundary: limited sections, then a hard char ceiling so
 *  arbitrary unbounded source content never reaches a model prompt. */
export function formatBoundedGenerationContext(
	context: SnapshotGenerationContext,
): string {
	return truncateText(
		formatGenerationContext(limitGenerationContext(context)),
		CODEBASE_GENERATION_MAX_CONTEXT_CHARS,
	);
}
