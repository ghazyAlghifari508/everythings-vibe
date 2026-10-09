import { describe, expect, it } from "vitest";
import {
	analysisRefreshRequestSchema,
	decideStarterSuggestionRefresh,
} from "./codebase-analysis-refresh";

const legacyOutput = {
	projectId: "project-1",
	snapshotId: "snapshot-1",
	framework: "React",
};

const starterSuggestions = [
	{
		id: "feature",
		title: "Feature",
		description: "Add a feature",
		prompt: "Build it",
	},
	{
		id: "bugfix",
		title: "Bug fix",
		description: "Fix a bug",
		prompt: "Fix it",
	},
	{
		id: "refactor",
		title: "Refactor",
		description: "Refactor code",
		prompt: "Refactor it",
	},
	{ id: "ui", title: "UI", description: "Improve UI", prompt: "Improve it" },
];

function analysis(
	id: string,
	status: string,
	output: unknown = legacyOutput,
	overrides: { projectId?: string; snapshotId?: string } = {},
) {
	return {
		id,
		projectId: overrides.projectId ?? "project-1",
		snapshotId: overrides.snapshotId ?? "snapshot-1",
		status,
		output,
	};
}

describe("explicit starter-suggestion refresh request", () => {
	it("requires a pinned snapshot and exact legacy analysis id", () => {
		expect(
			analysisRefreshRequestSchema.safeParse({
				snapshotId: "snapshot-1",
				refreshStarterSuggestionsForAnalysisId: "analysis-1",
			}).success,
		).toBe(true);
		expect(
			analysisRefreshRequestSchema.safeParse({
				refreshStarterSuggestionsForAnalysisId: "analysis-1",
			}).success,
		).toBe(false);
	});
});

describe("decideStarterSuggestionRefresh", () => {
	const request = {
		projectId: "project-1",
		snapshotId: "snapshot-1",
		targetAnalysisId: "analysis-legacy",
		snapshotStatus: "uploaded",
		target: analysis("analysis-legacy", "ready"),
	};

	it("creates a new attempt only for a valid ready legacy output without suggestions", () => {
		expect(
			decideStarterSuggestionRefresh({ ...request, analyses: [] }),
		).toEqual({
			action: "create",
		});
	});

	it("reuses a target that already contains valid starter suggestions", () => {
		expect(
			decideStarterSuggestionRefresh({
				...request,
				target: analysis("analysis-legacy", "ready", {
					...legacyOutput,
					starterSuggestions,
				}),
				analyses: [],
			}),
		).toEqual({ action: "reuse", analysisId: "analysis-legacy" });
	});

	it("reuses a pending attempt before creating another refresh", () => {
		expect(
			decideStarterSuggestionRefresh({
				...request,
				analyses: [analysis("analysis-pending", "pending", null)],
			}),
		).toEqual({ action: "reuse", analysisId: "analysis-pending" });
	});

	it("reuses a ready analysis with valid suggestions from a concurrent refresh", () => {
		expect(
			decideStarterSuggestionRefresh({
				...request,
				analyses: [
					analysis("analysis-newer", "ready", {
						...legacyOutput,
						starterSuggestions,
					}),
				],
			}),
		).toEqual({ action: "reuse", analysisId: "analysis-newer" });
	});

	it("fails closed for a malformed target output", () => {
		expect(
			decideStarterSuggestionRefresh({
				...request,
				target: analysis("analysis-legacy", "ready", {
					...legacyOutput,
					framework: 3,
				}),
				analyses: [],
			}),
		).toMatchObject({ action: "reject", reason: "invalid_output" });
	});

	it.each([
		{
			snapshotStatus: "uploading",
			target: analysis("analysis-legacy", "ready"),
		},
		{ snapshotStatus: "uploaded", target: null },
		{
			snapshotStatus: "uploaded",
			target: analysis("analysis-legacy", "pending"),
		},
		{
			snapshotStatus: "uploaded",
			target: analysis("analysis-legacy", "ready", legacyOutput, {
				projectId: "other-project",
			}),
		},
		{
			snapshotStatus: "uploaded",
			target: analysis("analysis-legacy", "ready", legacyOutput, {
				snapshotId: "other-snapshot",
			}),
		},
	])("rejects refresh when the target or uploaded snapshot is not eligible", (input) => {
		expect(
			decideStarterSuggestionRefresh({
				...request,
				...input,
				analyses: [],
			}),
		).toMatchObject({ action: "reject" });
	});
});
