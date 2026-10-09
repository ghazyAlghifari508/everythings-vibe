import { z } from "zod";
import { codebaseAnalysisSchema } from "./codebase-analysis";

export const analysisRefreshRequestSchema = z.object({
	snapshotId: z.string().min(1),
	refreshStarterSuggestionsForAnalysisId: z.string().min(1),
});

export type AnalysisRefreshRequest = z.infer<
	typeof analysisRefreshRequestSchema
>;

export type RefreshAnalysisCandidate = {
	id: string;
	projectId: string;
	snapshotId: string;
	status: string;
	output: unknown;
};

export type StarterSuggestionRefreshDecision =
	| { action: "create" }
	| { action: "reuse"; analysisId: string }
	| {
			action: "reject";
			reason:
				| "snapshot_not_uploaded"
				| "target_not_found"
				| "target_not_ready"
				| "invalid_output"
				| "target_has_no_legacy_suggestions";
	  };

export function decideStarterSuggestionRefresh(input: {
	projectId: string;
	snapshotId: string;
	targetAnalysisId: string;
	snapshotStatus: string;
	target: RefreshAnalysisCandidate | null;
	analyses: readonly RefreshAnalysisCandidate[];
}): StarterSuggestionRefreshDecision {
	if (input.snapshotStatus !== "uploaded") {
		return { action: "reject", reason: "snapshot_not_uploaded" };
	}
	const { target } = input;
	if (
		!target ||
		target.id !== input.targetAnalysisId ||
		target.projectId !== input.projectId ||
		target.snapshotId !== input.snapshotId
	) {
		return { action: "reject", reason: "target_not_found" };
	}
	if (target.status !== "ready") {
		return { action: "reject", reason: "target_not_ready" };
	}
	const parsedTarget = codebaseAnalysisSchema.safeParse(target.output);
	if (
		!parsedTarget.success ||
		parsedTarget.data.projectId !== input.projectId ||
		parsedTarget.data.snapshotId !== input.snapshotId
	) {
		return { action: "reject", reason: "invalid_output" };
	}
	if (parsedTarget.data.starterSuggestions) {
		return { action: "reuse", analysisId: target.id };
	}

	const reusable = input.analyses.find((analysis) => {
		if (
			analysis.projectId !== input.projectId ||
			analysis.snapshotId !== input.snapshotId
		)
			return false;
		if (analysis.status === "pending") return true;
		if (analysis.status !== "ready") return false;
		const parsed = codebaseAnalysisSchema.safeParse(analysis.output);
		return Boolean(
			parsed.success &&
				parsed.data.projectId === input.projectId &&
				parsed.data.snapshotId === input.snapshotId &&
				parsed.data.starterSuggestions,
		);
	});
	if (reusable) return { action: "reuse", analysisId: reusable.id };

	return { action: "create" };
}
