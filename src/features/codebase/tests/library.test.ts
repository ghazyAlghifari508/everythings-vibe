import { describe, expect, it } from "vitest";
import {
	buildCodebaseLibraryItems,
	CODEBASE_LIBRARY_STATUS_LABELS,
	type CodebaseLibraryItem,
	filterLibraryItems,
	getLibraryItemHref,
	hasReadyLibraryAnalysis,
	libraryAnalysisLabels,
	NEW_REPOSITORY_HREF,
	pickLibraryAnalysis,
	resolveLibraryItemAction,
	resolveLibraryItemStatus,
	selectLatestUsableCodebaseSnapshots,
} from "@/features/codebase/services/library";

function makeItem(
	overrides: Partial<CodebaseLibraryItem> = {},
): CodebaseLibraryItem {
	return {
		id: "cb-1",
		name: "<sample codebase>",
		updatedAt: "2026-10-04T22:40:00.000Z",
		fileCount: 37,
		snapshotCreatedAt: "2026-10-04T22:40:00.000Z",
		snapshotStatus: "uploaded",
		summary: null,
		framework: null,
		language: null,
		packageManager: null,
		hasReadyAnalysis: false,
		hasUsableSnapshot: true,
		analysisAttemptStatus: null,
		onboardingProjectId: null,
		readiness: "recovery_required",
		planCount: 0,
		...overrides,
	};
}

describe("resolveLibraryItemStatus", () => {
	it("uses the four public labels only", () => {
		expect(Object.values(CODEBASE_LIBRARY_STATUS_LABELS).sort()).toEqual([
			"Menganalisis",
			"Perlu analisis",
			"Siap",
			"Sinkronisasi belum selesai",
		]);
	});

	it("reports a validated analysis as ready", () => {
		expect(
			resolveLibraryItemStatus(
				makeItem({ readiness: "planning_ready", hasReadyAnalysis: true }),
			),
		).toBe("ready");
	});

	it("reports a running attempt as analyzing", () => {
		expect(
			resolveLibraryItemStatus(
				makeItem({
					readiness: "analysis_pending",
					analysisAttemptStatus: "pending",
				}),
			),
		).toBe("analyzing");
	});

	it("reports a synced repository with no attempt as needing analysis", () => {
		expect(
			resolveLibraryItemStatus(
				makeItem({
					readiness: "analysis_pending",
					analysisAttemptStatus: null,
				}),
			),
		).toBe("needs_analysis");
	});

	it("reports a failed attempt as needing analysis", () => {
		expect(
			resolveLibraryItemStatus(
				makeItem({
					readiness: "recovery_required",
					analysisAttemptStatus: "failed",
				}),
			),
		).toBe("needs_analysis");
	});

	it("reports a repository that never synced as sync incomplete", () => {
		expect(
			resolveLibraryItemStatus(
				makeItem({ readiness: "onboarding", hasUsableSnapshot: false }),
			),
		).toBe("sync_incomplete");
	});

	it("keeps a repository with a stored plan readable while its analysis runs", () => {
		expect(
			resolveLibraryItemStatus(
				makeItem({
					readiness: "existing_plan_readonly",
					analysisAttemptStatus: "pending",
				}),
			),
		).toBe("analyzing");
	});
});

describe("resolveLibraryItemAction", () => {
	it("opens the workspace only when planning is ready", () => {
		expect(
			resolveLibraryItemAction(makeItem({ readiness: "planning_ready" })),
		).toEqual({
			kind: "open_workspace",
			label: "Buka Workspace",
			href: "/codebases/cb-1",
			recovery: false,
		});
	});

	it("opens the workspace for a stored plan whose latest analysis is broken", () => {
		expect(
			resolveLibraryItemAction(
				makeItem({ readiness: "existing_plan_readonly" }),
			),
		).toMatchObject({ kind: "open_workspace", href: "/codebases/cb-1" });
	});

	it("sends a running analysis to progress", () => {
		expect(
			resolveLibraryItemAction(
				makeItem({
					readiness: "analysis_pending",
					analysisAttemptStatus: "pending",
				}),
			),
		).toMatchObject({
			kind: "view_progress",
			label: "Lihat Progres",
			href: NEW_REPOSITORY_HREF,
			recovery: true,
		});
	});

	it("sends a credit-blocked / not-started repository to start analysis", () => {
		expect(
			resolveLibraryItemAction(
				makeItem({
					readiness: "analysis_pending",
					analysisAttemptStatus: null,
				}),
			),
		).toMatchObject({
			kind: "complete_analysis",
			label: "Selesaikan Analisis",
			href: NEW_REPOSITORY_HREF,
		});
	});

	it("sends a failed analysis to retry", () => {
		expect(
			resolveLibraryItemAction(
				makeItem({
					readiness: "recovery_required",
					analysisAttemptStatus: "failed",
				}),
			),
		).toMatchObject({
			kind: "retry_analysis",
			label: "Coba Analisis Lagi",
			href: NEW_REPOSITORY_HREF,
		});
	});

	it("sends an unfinished sync to sync recovery", () => {
		expect(
			resolveLibraryItemAction(
				makeItem({ readiness: "onboarding", hasUsableSnapshot: false }),
			),
		).toMatchObject({
			kind: "resume_sync",
			label: "Lanjutkan Sinkronisasi",
			href: NEW_REPOSITORY_HREF,
		});
	});

	it("never routes a non-ready repository into the workspace", () => {
		for (const readiness of [
			"analysis_pending",
			"recovery_required",
			"onboarding",
		] as const) {
			expect(resolveLibraryItemAction(makeItem({ readiness })).href).toBe(
				NEW_REPOSITORY_HREF,
			);
		}
	});
});

describe("selectLatestUsableCodebaseSnapshots", () => {
	it("picks the newest snapshot a feature can be planned against", () => {
		const latest = selectLatestUsableCodebaseSnapshots([
			{
				id: "snap-old",
				codebaseId: "cb-1",
				createdAt: new Date("2026-10-01"),
				status: "uploaded",
			},
			{
				id: "snap-uploading",
				codebaseId: "cb-1",
				createdAt: new Date("2026-10-02"),
				status: "uploading",
			},
		]);
		expect(latest.get("cb-1")?.id).toBe("snap-old");
	});

	it("returns nothing for a codebase whose only snapshot is incomplete", () => {
		const latest = selectLatestUsableCodebaseSnapshots([
			{
				id: "snap-uploading",
				codebaseId: "cb-1",
				createdAt: new Date("2026-10-02"),
				status: "uploading",
			},
		]);
		expect(latest.size).toBe(0);
	});
});

describe("filterLibraryItems", () => {
	const items = [
		makeItem({
			id: "cb-react",
			name: "<sample react app>",
			summary: "<sample summary rental>",
			framework: "React",
			language: "TypeScript",
		}),
		makeItem({ id: "cb-clipper", name: "<sample clipper>" }),
	];

	it("returns all items on empty query", () => {
		expect(filterLibraryItems(items, "")).toHaveLength(2);
		expect(filterLibraryItems(items, "   ")).toHaveLength(2);
	});

	it("filters by name", () => {
		expect(filterLibraryItems(items, "clipper")).toHaveLength(1);
	});

	it("filters by persisted summary", () => {
		const result = filterLibraryItems(items, "rental");
		expect(result.map((item) => item.id)).toEqual(["cb-react"]);
	});

	it("filters by detected framework or language", () => {
		expect(
			filterLibraryItems(items, "typescript").map((item) => item.id),
		).toEqual(["cb-react"]);
	});
});

describe("getLibraryItemHref", () => {
	it("links an existing project card to its workspace", () => {
		expect(getLibraryItemHref({ id: "cb-123" })).toBe("/codebases/cb-123");
	});

	it("exposes the new-repository wizard destination", () => {
		expect(NEW_REPOSITORY_HREF).toBe("/plan/codebase");
	});
});

describe("libraryAnalysisLabels", () => {
	it("is empty when no persisted analysis fields exist", () => {
		expect(libraryAnalysisLabels(makeItem())).toEqual([]);
	});

	it("lists persisted framework, language and package manager in order", () => {
		expect(
			libraryAnalysisLabels(
				makeItem({
					framework: "React",
					language: "TypeScript",
					packageManager: "pnpm",
				}),
			),
		).toEqual(["React", "TypeScript", "pnpm"]);
	});
});

describe("pickLibraryAnalysis", () => {
	it("returns persisted summary and stack when available", () => {
		expect(
			pickLibraryAnalysis({
				projectId: "<sample project>",
				snapshotId: "<sample snapshot>",
				summary: "<sample summary>",
				framework: "React",
				language: "TypeScript",
				packageManager: "pnpm",
			}),
		).toEqual({
			summary: "<sample summary>",
			framework: "React",
			language: "TypeScript",
			packageManager: "pnpm",
		});
	});

	it("normalizes missing analysis to nulls rather than fabricated stack", () => {
		expect(pickLibraryAnalysis(null)).toEqual({
			summary: null,
			framework: null,
			language: null,
			packageManager: null,
		});
	});

	it("normalizes uncertainty placeholders to nulls", () => {
		expect(
			pickLibraryAnalysis({
				projectId: "<sample project>",
				snapshotId: "<sample snapshot>",
				framework: "Tidak terdeteksi",
				language: "  ",
			}),
		).toMatchObject({ framework: null, language: null });
	});
});

describe("hasReadyLibraryAnalysis", () => {
	it("is strict when no snapshot exists", () => {
		expect(
			hasReadyLibraryAnalysis({
				latestSnapshotId: null,
				matchedAnalysis: null,
			}),
		).toBe(false);
	});

	it("is strict when analysis is absent", () => {
		expect(
			hasReadyLibraryAnalysis({
				latestSnapshotId: "snap-1",
				matchedAnalysis: null,
			}),
		).toBe(false);
	});

	it("is false when the matched analysis points at a stale snapshot", () => {
		expect(
			hasReadyLibraryAnalysis({
				latestSnapshotId: "snap-2",
				matchedAnalysis: {
					snapshotId: "snap-1",
					status: "ready",
					outputParsed: true,
				},
			}),
		).toBe(false);
	});

	it("is true only for a ready, parsed analysis bound to the latest snapshot", () => {
		expect(
			hasReadyLibraryAnalysis({
				latestSnapshotId: "snap-1",
				matchedAnalysis: {
					snapshotId: "snap-1",
					status: "ready",
					outputParsed: true,
				},
			}),
		).toBe(true);
	});
});

describe("buildCodebaseLibraryItems", () => {
	function readyOutput(): Record<string, unknown> {
		return { projectId: "proj-1", snapshotId: "snap-1", framework: "React" };
	}

	function baseInput() {
		return {
			codebases: [
				{ id: "cb-draft", name: "Draft", createdAt: null, updatedAt: null },
				{ id: "cb-ready", name: "Ready One", createdAt: null, updatedAt: null },
				{
					id: "cb-stale",
					name: "Stale Analysis",
					createdAt: null,
					updatedAt: null,
				},
				{
					id: "cb-pending",
					name: "Pending Analysis",
					createdAt: null,
					updatedAt: null,
				},
				{
					id: "cb-failed",
					name: "Failed Analysis",
					createdAt: null,
					updatedAt: null,
				},
				{
					id: "cb-uploaded-no-analysis",
					name: "No Analysis Yet",
					createdAt: null,
					updatedAt: null,
				},
				{
					id: "cb-bad-output",
					name: "Bad Output",
					createdAt: null,
					updatedAt: null,
				},
			],
			snapshots: [
				{
					id: "snap-1",
					codebaseId: "cb-ready",
					createdAt: new Date("2026-10-01"),
					fileCount: 12,
					status: "ready",
				},
				{
					id: "snap-stale-old",
					codebaseId: "cb-stale",
					createdAt: new Date("2026-10-01"),
					fileCount: 5,
					status: "ready",
				},
				{
					id: "snap-stale-new",
					codebaseId: "cb-stale",
					createdAt: new Date("2026-10-02"),
					fileCount: 9,
					status: "ready",
				},
				{
					id: "snap-pending",
					codebaseId: "cb-pending",
					createdAt: new Date("2026-10-01"),
					fileCount: 3,
					status: "ready",
				},
				{
					id: "snap-failed",
					codebaseId: "cb-failed",
					createdAt: new Date("2026-10-01"),
					fileCount: 3,
					status: "ready",
				},
				{
					id: "snap-uploaded",
					codebaseId: "cb-uploaded-no-analysis",
					createdAt: new Date("2026-10-01"),
					fileCount: 3,
					status: "uploaded",
				},
				{
					id: "snap-badout",
					codebaseId: "cb-bad-output",
					createdAt: new Date("2026-10-01"),
					fileCount: 3,
					status: "ready",
				},
			],
			projects: [
				{ id: "proj-ready", codebaseId: "cb-ready" },
				{ id: "proj-stale", codebaseId: "cb-stale" },
				{ id: "proj-pending", codebaseId: "cb-pending" },
				{ id: "proj-failed", codebaseId: "cb-failed" },
				{
					id: "proj-uploaded-no-analysis",
					codebaseId: "cb-uploaded-no-analysis",
				},
				{ id: "proj-bad-output", codebaseId: "cb-bad-output" },
			],
			analyses: [
				{
					projectId: "proj-ready",
					snapshotId: "snap-1",
					status: "ready",
					output: readyOutput(),
				},
				{
					projectId: "proj-stale",
					snapshotId: "snap-stale-old",
					status: "ready",
					output: {
						projectId: "proj-stale",
						snapshotId: "snap-stale-old",
						framework: "React",
					},
				},
				{
					projectId: "proj-pending",
					snapshotId: "snap-pending",
					status: "pending",
					output: null,
				},
				{
					projectId: "proj-failed",
					snapshotId: "snap-failed",
					status: "failed",
					output: null,
				},
				{
					projectId: "proj-bad-output",
					snapshotId: "snap-badout",
					status: "ready",
					output: { projectId: 123 },
				},
			],
		} as const;
	}

	it("lists every owned repository, including one that never synced", () => {
		const items = buildCodebaseLibraryItems(baseInput());
		expect(items.map((item) => item.id).sort()).toEqual(
			[
				"cb-bad-output",
				"cb-draft",
				"cb-failed",
				"cb-pending",
				"cb-ready",
				"cb-stale",
				"cb-uploaded-no-analysis",
			].sort(),
		);
	});

	it("marks only a ready, valid analysis for the newest snapshot as analysed", () => {
		const items = buildCodebaseLibraryItems(baseInput());
		const byId = new Map(items.map((item) => [item.id, item]));
		expect(byId.get("cb-ready")?.hasReadyAnalysis).toBe(true);
		expect(byId.get("cb-uploaded-no-analysis")?.hasReadyAnalysis).toBe(false);
		expect(byId.get("cb-pending")?.hasReadyAnalysis).toBe(false);
		expect(byId.get("cb-failed")?.hasReadyAnalysis).toBe(false);
		expect(byId.get("cb-bad-output")?.hasReadyAnalysis).toBe(false);
	});

	it("does not count an analysis bound to an older snapshot as analysed", () => {
		// A re-synced repository is not analysed until its new snapshot is.
		const byId = new Map(
			buildCodebaseLibraryItems(baseInput()).map((item) => [item.id, item]),
		);
		expect(byId.get("cb-stale")?.hasReadyAnalysis).toBe(false);
		expect(byId.get("cb-stale")?.hasUsableSnapshot).toBe(true);
		expect(byId.get("cb-stale")?.readiness).toBe("analysis_pending");
	});

	it("surfaces the newest attempt status so running differs from needs-action", () => {
		const byId = new Map(
			buildCodebaseLibraryItems(baseInput()).map((item) => [item.id, item]),
		);
		expect(byId.get("cb-pending")?.analysisAttemptStatus).toBe("pending");
		expect(byId.get("cb-failed")?.analysisAttemptStatus).toBe("failed");
		expect(byId.get("cb-stale")?.analysisAttemptStatus).toBeNull();
	});

	it("keeps a repository with a stored plan readable even when its analysis is not ready", () => {
		const input = baseInput();
		const items = buildCodebaseLibraryItems({
			...input,
			projects: input.projects.map((project) =>
				project.id === "proj-failed"
					? { ...project, hasArtifacts: true }
					: project,
			),
		});
		const failed = items.find((item) => item.id === "cb-failed");
		expect(failed?.readiness).toBe("existing_plan_readonly");
		if (!failed) throw new Error("expected cb-failed to be listed");
		expect(resolveLibraryItemAction(failed)).toMatchObject({
			kind: "open_workspace",
		});
	});

	it("keeps an older ready result visible after a newer failed attempt", () => {
		const input = baseInput();
		const items = buildCodebaseLibraryItems({
			...input,
			analyses: [
				{
					projectId: "proj-ready",
					snapshotId: "snap-1",
					status: "failed",
					output: null,
				},
				{
					projectId: "proj-ready",
					snapshotId: "snap-1",
					status: "ready",
					output: readyOutput(),
				},
			],
		});
		const ready = items.find((item) => item.id === "cb-ready");
		expect(ready?.hasReadyAnalysis).toBe(true);
		expect(ready?.readiness).toBe("planning_ready");
	});

	it("counts the feature plans of each repository", () => {
		const byId = new Map(
			buildCodebaseLibraryItems(baseInput()).map((item) => [item.id, item]),
		);
		expect(byId.get("cb-ready")?.planCount).toBe(1);
	});

	it("reports an empty library only when the user owns no repositories", () => {
		const items = buildCodebaseLibraryItems({
			codebases: [],
			snapshots: [],
			projects: [],
			analyses: [],
		});
		expect(items).toEqual([]);
	});
});
