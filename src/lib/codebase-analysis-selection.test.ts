import { describe, expect, it } from "vitest";
import type { AnalysisResponse } from "./codebase-analysis";
import {
	type AnalysisRecordLike,
	resolveWorkspaceSnapshotIdentity,
	selectWorkspaceAnalysis,
	shouldDiscardWorkspaceAnalysis,
} from "./codebase-analysis-selection";

const projectId = "project-anchor";
const snapshotId = "snapshot-current";

const suggestions = [
	{
		id: "feature",
		title: "Feature",
		description: "Feature description",
		prompt: "Implement a feature evidenced by this repository.",
	},
	{
		id: "bugfix",
		title: "Bug fix",
		description: "Bug fix description",
		prompt: "Fix a behavior evidenced by this repository.",
	},
	{
		id: "refactor",
		title: "Refactor",
		description: "Refactor description",
		prompt: "Refactor a proven module without changing behavior.",
	},
	{
		id: "ui",
		title: "UI improvement",
		description: "UI description",
		prompt: "Improve an existing interface using repository patterns.",
	},
] satisfies NonNullable<AnalysisResponse["output"]>["starterSuggestions"];

const readyOutput = {
	projectId,
	snapshotId,
	framework: "TypeScript",
	language: "TypeScript",
	starterSuggestions: suggestions,
} satisfies NonNullable<AnalysisResponse["output"]>;

function record(
	overrides: Partial<AnalysisRecordLike> & Pick<AnalysisRecordLike, "id">,
): AnalysisRecordLike {
	return {
		projectId,
		snapshotId,
		status: "ready",
		output: readyOutput,
		createdAt: "2026-01-01T00:00:00.000Z",
		...overrides,
	};
}

describe("workspace analysis selection", () => {
	it("keeps a failed newer attempt from hiding the ready analysis of the same snapshot", () => {
		const selection = selectWorkspaceAnalysis(
			[
				record({ id: "newest-failed", status: "failed", output: null }),
				record({ id: "ready-valid" }),
			],
			{ projectId, snapshotId },
		);

		expect(selection.selected?.id).toBe("ready-valid");
		expect(selection.latestAttempt).toEqual({
			id: "newest-failed",
			status: "failed",
		});
	});

	it("keeps a pending newer attempt from hiding the ready analysis of the same snapshot", () => {
		const selection = selectWorkspaceAnalysis(
			[
				record({ id: "newest-pending", status: "pending", output: null }),
				record({ id: "ready-valid" }),
			],
			{ projectId, snapshotId },
		);

		expect(selection.selected?.id).toBe("ready-valid");
		expect(selection.latestAttempt?.status).toBe("pending");
	});

	it("reports no selected analysis when every attempt for the snapshot failed", () => {
		const selection = selectWorkspaceAnalysis(
			[
				record({
					id: "failed-1",
					status: "failed",
					output: null,
					createdAt: "2026-01-01T00:00:00.000Z",
				}),
				record({
					id: "failed-2",
					status: "failed",
					output: null,
					createdAt: "2026-02-01T00:00:00.000Z",
				}),
			],
			{ projectId, snapshotId },
		);

		expect(selection.selected).toBeNull();
		expect(selection.latestAttempt?.id).toBe("failed-2");
	});

	it("prefers the newest usable ready analysis when several exist", () => {
		const selection = selectWorkspaceAnalysis(
			[record({ id: "ready-newest" }), record({ id: "ready-older" })],
			{ projectId, snapshotId },
		);

		expect(selection.selected?.id).toBe("ready-newest");
		expect(selection.latestAttempt?.id).toBe("ready-newest");
	});

	it("never reuses suggestions recorded against a different snapshot", () => {
		const stale = record({
			id: "stale-snapshot",
			snapshotId: "snapshot-previous",
		});
		const selection = selectWorkspaceAnalysis([stale], {
			projectId,
			snapshotId,
		});

		expect(selection.selected).toBeNull();
		expect(selection.latestAttempt).toBeNull();
	});

	it("never reuses an analysis recorded against a different onboarding project", () => {
		const other = record({ id: "other-project", projectId: "project-other" });
		const selection = selectWorkspaceAnalysis([other], {
			projectId,
			snapshotId,
		});

		expect(selection.selected).toBeNull();
	});

	it("rejects a ready record whose stored output belongs to another snapshot", () => {
		const selection = selectWorkspaceAnalysis(
			[
				record({
					id: "mismatched-output",
					output: { ...readyOutput, snapshotId: "snapshot-previous" },
				}),
			],
			{ projectId, snapshotId },
		);

		expect(selection.selected).toBeNull();
	});

	it("accepts a legacy ready record stored before starter suggestions existed", () => {
		const { starterSuggestions: _omitted, ...legacyOutput } = readyOutput;
		const selection = selectWorkspaceAnalysis(
			[record({ id: "legacy-ready", output: legacyOutput })],
			{ projectId, snapshotId },
		);

		expect(selection.selected?.id).toBe("legacy-ready");
		expect(selection.selected?.output?.starterSuggestions).toBeUndefined();
	});

	it("returns nothing for an empty identity", () => {
		expect(
			selectWorkspaceAnalysis([record({ id: "ready-valid" })], {
				projectId: "",
				snapshotId,
			}),
		).toEqual({ selected: null, latestAttempt: null });
		expect(
			selectWorkspaceAnalysis([record({ id: "ready-valid" })], {
				projectId,
				snapshotId: "",
			}),
		).toEqual({ selected: null, latestAttempt: null });
	});

	it("orders by creation time so callers need not pre-sort", () => {
		const selection = selectWorkspaceAnalysis(
			[
				record({ id: "older", createdAt: "2026-01-01T00:00:00.000Z" }),
				record({ id: "newer", createdAt: "2026-02-01T00:00:00.000Z" }),
			],
			{ projectId, snapshotId },
		);

		expect(selection.selected?.id).toBe("newer");
	});

	it("drops stored statuses that the analysis contract does not define", () => {
		const selection = selectWorkspaceAnalysis(
			[record({ id: "bogus", status: "queued", output: null })],
			{ projectId, snapshotId },
		);

		expect(selection.selected).toBeNull();
		expect(selection.latestAttempt).toBeNull();
	});
});

describe("workspace snapshot identity", () => {
	it("keeps the persisted snapshot when the CLI session no longer reports one", () => {
		expect(
			resolveWorkspaceSnapshotIdentity({
				persistedSnapshotId: snapshotId,
				polledSnapshotId: null,
			}),
		).toBe(snapshotId);
	});

	it("keeps the persisted snapshot when the polled session reports no snapshot", () => {
		expect(
			resolveWorkspaceSnapshotIdentity({
				persistedSnapshotId: snapshotId,
				polledSnapshotId: undefined,
			}),
		).toBe(snapshotId);
	});

	it("adopts a freshly uploaded snapshot reported by polling", () => {
		expect(
			resolveWorkspaceSnapshotIdentity({
				persistedSnapshotId: snapshotId,
				polledSnapshotId: "snapshot-fresh",
			}),
		).toBe("snapshot-fresh");
	});

	it("reports no snapshot when nothing was ever persisted", () => {
		expect(
			resolveWorkspaceSnapshotIdentity({
				persistedSnapshotId: null,
				polledSnapshotId: null,
			}),
		).toBeNull();
	});
});

describe("workspace analysis retention", () => {
	const readyAnalysis = {
		id: "ready-valid",
		projectId,
		snapshotId,
		status: "ready",
		output: readyOutput,
	} satisfies AnalysisResponse;

	it("keeps a valid analysis for the active snapshot", () => {
		expect(
			shouldDiscardWorkspaceAnalysis({
				analysis: readyAnalysis,
				projectId,
				activeSnapshotId: snapshotId,
			}),
		).toBe(false);
	});

	it("keeps a valid analysis while no snapshot is known yet", () => {
		expect(
			shouldDiscardWorkspaceAnalysis({
				analysis: readyAnalysis,
				projectId,
				activeSnapshotId: null,
			}),
		).toBe(false);
	});

	it("discards an analysis bound to a superseded snapshot", () => {
		expect(
			shouldDiscardWorkspaceAnalysis({
				analysis: readyAnalysis,
				projectId,
				activeSnapshotId: "snapshot-fresh",
			}),
		).toBe(true);
	});

	it("discards an analysis bound to another onboarding project", () => {
		expect(
			shouldDiscardWorkspaceAnalysis({
				analysis: readyAnalysis,
				projectId: "project-other",
				activeSnapshotId: snapshotId,
			}),
		).toBe(true);
	});

	it("discards nothing when there is no analysis to keep", () => {
		expect(
			shouldDiscardWorkspaceAnalysis({
				analysis: null,
				projectId,
				activeSnapshotId: snapshotId,
			}),
		).toBe(false);
	});

	it("discards a ready envelope whose stored output no longer validates", () => {
		expect(
			shouldDiscardWorkspaceAnalysis({
				analysis: { ...readyAnalysis, output: null },
				projectId,
				activeSnapshotId: snapshotId,
			}),
		).toBe(true);
	});
});
