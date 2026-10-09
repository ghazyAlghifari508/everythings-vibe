import {
	type AnalysisResponse,
	analysisResponseSchema,
	codebaseAnalysisSchema,
} from "./codebase-analysis";
import type { CodebaseAnalysisStatus } from "./codebase-sync";

export function matchesWorkspaceAnalysis(
	analysis: unknown,
	projectId: string,
	snapshotId: string,
): boolean {
	if (!analysis || !projectId || !snapshotId) return false;
	const parsedResponse = analysisResponseSchema.safeParse(analysis);
	if (!parsedResponse.success) return false;
	const response = parsedResponse.data;
	if (
		response.status !== "ready" ||
		response.projectId !== projectId ||
		response.snapshotId !== snapshotId ||
		!response.output
	) {
		return false;
	}
	const parsedOutput = codebaseAnalysisSchema.safeParse(response.output);
	if (!parsedOutput.success) return false;
	return (
		parsedOutput.data.projectId === projectId &&
		parsedOutput.data.snapshotId === snapshotId
	);
}

export function shouldFetchWorkspaceAnalysis(input: {
	projectId: string | null | undefined;
	snapshotId: string | null | undefined;
	analysisStatus: CodebaseAnalysisStatus | undefined;
	analysis: AnalysisResponse | null | undefined;
}): boolean {
	if (
		!input.projectId ||
		!input.snapshotId ||
		input.analysisStatus !== "ready"
	) {
		return false;
	}
	return !matchesWorkspaceAnalysis(
		input.analysis,
		input.projectId,
		input.snapshotId,
	);
}
