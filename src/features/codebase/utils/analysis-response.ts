import {
	type AnalysisResponse,
	safeParseCodebaseAnalysis,
} from "@/lib/codebase-analysis";

export function safeParseAnalysisResponse(
	input: unknown,
): AnalysisResponse | null {
	if (typeof input !== "object" || input === null) return null;
	if (
		!("id" in input) ||
		!("projectId" in input) ||
		!("snapshotId" in input) ||
		!("status" in input)
	)
		return null;
	const output =
		"output" in input
			? safeParseCodebaseAnalysis(input.output)
			: { success: false as const };
	if (
		input.id &&
		typeof input.id === "string" &&
		input.projectId &&
		typeof input.projectId === "string" &&
		input.snapshotId &&
		typeof input.snapshotId === "string" &&
		(input.status === "pending" ||
			input.status === "ready" ||
			input.status === "failed")
	) {
		return {
			id: input.id,
			projectId: input.projectId,
			snapshotId: input.snapshotId,
			status: input.status,
			output: output.success ? output.data : null,
		};
	}
	return null;
}
