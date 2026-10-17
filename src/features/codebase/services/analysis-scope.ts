import { buildAnalysisRepairPrompt } from "./analysis-prompt";
import {
	type AnalysisResponse,
	type CodebaseAnalysis,
	codebaseAnalysisSchema,
	codebaseStarterSuggestionsSchema,
} from "./analysis-schema";
import {
	AnalysisValidationError,
	parseAnalysisOutput,
} from "./analysis-validation";
import { canOpenSummary, type SyncStatusResponse } from "./sync";

export interface AnalysisScopeInput {
	projectId: string;
	projectMode: string | null | undefined;
	projectCodebaseId: string | null | undefined;
	projectUserId: string;
	authenticatedUserId: string;
	codebaseOwnerId?: string | null;
}

export type AnalysisScope =
	| { kind: "project"; projectId: string }
	| { kind: "codebase"; projectId: string; codebaseId: string };

export function resolveAnalysisScope(
	input: AnalysisScopeInput,
): AnalysisScope | { kind: "not_found" } {
	if (input.projectUserId !== input.authenticatedUserId) {
		return { kind: "not_found" };
	}
	if (input.projectMode !== "existing_codebase") {
		return { kind: "not_found" };
	}
	if (!input.projectCodebaseId) {
		return { kind: "project", projectId: input.projectId };
	}
	if (input.codebaseOwnerId !== input.authenticatedUserId) {
		return { kind: "not_found" };
	}
	return {
		kind: "codebase",
		projectId: input.projectId,
		codebaseId: input.projectCodebaseId,
	};
}

export interface ValidatedGenerationInput {
	generate: (
		messages: Array<{
			role: "system" | "user" | "assistant";
			content: string;
		}>,
	) => Promise<string>;
	messages: Array<{
		role: "system" | "user" | "assistant";
		content: string;
	}>;
	ids: { projectId: string; snapshotId: string };
	trustedManifestPaths: ReadonlySet<string>;
}

export async function generateValidatedAnalysis(
	input: ValidatedGenerationInput,
): Promise<CodebaseAnalysis> {
	const raw = await input.generate(input.messages);
	try {
		return parseAnalysisOutput(raw, input.ids, input.trustedManifestPaths);
	} catch (error) {
		if (!(error instanceof AnalysisValidationError)) throw error;
		const repaired = await input.generate([
			...input.messages,
			{
				role: "user",
				content: buildAnalysisRepairPrompt({
					raw,
					reason: error.reason,
					issuePaths: error.issuePaths,
				}),
			},
		]);
		return parseAnalysisOutput(repaired, input.ids, input.trustedManifestPaths);
	}
}

export interface CanContinueToCodebaseConclusionInput {
	status: SyncStatusResponse | null | undefined;
	analysis: AnalysisResponse | null | undefined;
	codebaseId: string;
	analysisProjectId: string | null | undefined;
}

/**
 * Authoritative pure predicate determining whether codebase onboarding
 * can advance from sync to conclusion.
 */
export function canContinueToCodebaseConclusion(
	input: CanContinueToCodebaseConclusionInput,
): boolean {
	if (!input.status || !input.analysis) {
		return false;
	}

	if (!canOpenSummary(input.status)) {
		return false;
	}

	if (
		input.status.analysisStatus !== "ready" ||
		input.analysis.status !== "ready"
	) {
		return false;
	}

	if (
		!input.status.analysisId ||
		!input.analysis.id ||
		input.status.analysisId !== input.analysis.id
	) {
		return false;
	}

	if (!input.codebaseId || input.status.projectId !== input.codebaseId) {
		return false;
	}

	if (
		!input.analysisProjectId ||
		input.analysis.projectId !== input.analysisProjectId
	) {
		return false;
	}

	if (
		!input.status.snapshotId ||
		input.analysis.snapshotId !== input.status.snapshotId
	) {
		return false;
	}

	if (!input.analysis.output) {
		return false;
	}

	const parsedAnalysis = codebaseAnalysisSchema.safeParse(
		input.analysis.output,
	);
	if (!parsedAnalysis.success) {
		return false;
	}

	const output = parsedAnalysis.data;
	if (
		output.projectId !== input.analysisProjectId ||
		output.snapshotId !== input.status.snapshotId
	) {
		return false;
	}

	if (!output.starterSuggestions) {
		return false;
	}

	const parsedSuggestions = codebaseStarterSuggestionsSchema.safeParse(
		output.starterSuggestions,
	);
	if (!parsedSuggestions.success) {
		return false;
	}

	return true;
}
