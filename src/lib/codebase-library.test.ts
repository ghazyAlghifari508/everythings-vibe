import { describe, expect, it } from "vitest";
import {
	buildCodebaseLibraryItems,
	type CodebaseLibraryItem,
	filterLibraryItems,
	getLibraryItemHref,
	isCodebaseLibraryReady,
	libraryAnalysisLabels,
	mapLibraryStatus,
	NEW_REPOSITORY_HREF,
	pickLibraryAnalysis,
} from "./codebase-library";

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
		...overrides,
	};
}

describe("mapLibraryStatus", () => {
	it("maps ready snapshots to Siap", () => {
		expect(mapLibraryStatus("ready", false)).toBe("Siap");
	});

	it("prefers Siap when validated analysis exists for the latest snapshot", () => {
		expect(mapLibraryStatus("uploaded", true)).toBe("Siap");
	});

	it("maps analyzing to Sedang dianalisis", () => {
		expect(mapLibraryStatus("analyzing", false)).toBe("Sedang dianalisis");
	});

	it("maps uploading transport to Sedang disinkronkan", () => {
		expect(mapLibraryStatus("uploading", false)).toBe("Sedang disinkronkan");
	});

	it("maps uploaded transport without analysis to Tersinkron, never Siap", () => {
		expect(mapLibraryStatus("uploaded", false)).toBe("Tersinkron");
	});

	it("maps failed to Perlu perhatian", () => {
		expect(mapLibraryStatus("failed", false)).toBe("Perlu perhatian");
	});

	it("maps expired to Sesi berakhir", () => {
		expect(mapLibraryStatus("expired", false)).toBe("Sesi berakhir");
	});

	it("maps missing snapshot to Belum ada sync", () => {
		expect(mapLibraryStatus(null, false)).toBe("Belum ada sync");
	});

	it("falls back for unknown statuses", () => {
		expect(mapLibraryStatus("migrating", false)).toBe("Status tidak dikenal");
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

describe("isCodebaseLibraryReady", () => {
	it("is strict when no snapshot exists", () => {
		expect(
			isCodebaseLibraryReady({ latestSnapshotId: null, matchedAnalysis: null }),
		).toBe(false);
	});

	it("is strict when analysis is absent", () => {
		expect(
			isCodebaseLibraryReady({
				latestSnapshotId: "snap-1",
				matchedAnalysis: null,
			}),
		).toBe(false);
	});

	it("is false when the matched analysis points at a stale snapshot", () => {
		expect(
			isCodebaseLibraryReady({
				latestSnapshotId: "snap-2",
				matchedAnalysis: {
					snapshotId: "snap-1",
					status: "ready",
					outputParsed: true,
				},
			}),
		).toBe(false);
	});

	it("is false while analysis is pending", () => {
		expect(
			isCodebaseLibraryReady({
				latestSnapshotId: "snap-1",
				matchedAnalysis: {
					snapshotId: "snap-1",
					status: "pending",
					outputParsed: true,
				},
			}),
		).toBe(false);
	});

	it("is false when analysis failed", () => {
		expect(
			isCodebaseLibraryReady({
				latestSnapshotId: "snap-1",
				matchedAnalysis: {
					snapshotId: "snap-1",
					status: "failed",
					outputParsed: true,
				},
			}),
		).toBe(false);
	});

	it("is false when ready analysis output failed validation", () => {
		expect(
			isCodebaseLibraryReady({
				latestSnapshotId: "snap-1",
				matchedAnalysis: {
					snapshotId: "snap-1",
					status: "ready",
					outputParsed: false,
				},
			}),
		).toBe(false);
	});

	it("is true only for a ready, parsed analysis bound to the latest snapshot", () => {
		expect(
			isCodebaseLibraryReady({
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

	it("hides a freshly created codebase that never synced", () => {
		const items = buildCodebaseLibraryItems(baseInput());
		expect(items.map((item) => item.id)).not.toContain("cb-draft");
	});

	it("keeps only snapshots whose project has a ready, valid analysis for the latest snapshot", () => {
		const items = buildCodebaseLibraryItems(baseInput());
		expect(items.map((item) => item.id)).toEqual(["cb-ready"]);
		expect(items.every((item) => item.hasReadyAnalysis)).toBe(true);
		expect(
			items[0].summary === null || typeof items[0].summary === "string",
		).toBe(true);
	});

	it("hides an uploaded snapshot without a ready analysis", () => {
		expect(
			buildCodebaseLibraryItems(baseInput()).map((i) => i.id),
		).not.toContain("cb-uploaded-no-analysis");
	});

	it("hides pending and failed analyses", () => {
		const ids = buildCodebaseLibraryItems(baseInput()).map((i) => i.id);
		expect(ids).not.toContain("cb-pending");
		expect(ids).not.toContain("cb-failed");
	});

	it("hides a codebase whose ready analysis is bound to an older snapshot than the latest", () => {
		expect(
			buildCodebaseLibraryItems(baseInput()).map((i) => i.id),
		).not.toContain("cb-stale");
	});

	it("hides a codebase whose ready analysis output is not parseable", () => {
		expect(
			buildCodebaseLibraryItems(baseInput()).map((i) => i.id),
		).not.toContain("cb-bad-output");
	});

	it("scopes search and pagination only to visible ready projects", () => {
		const items = buildCodebaseLibraryItems(baseInput());
		const matches = filterLibraryItems(items, "draft");
		expect(matches).toEqual([]);
		expect(items.length).toBe(1);
	});

	it("treats a codebase with no ready items as an empty library state", () => {
		const items = buildCodebaseLibraryItems({
			codebases: [
				{ id: "cb-draft", name: "Draft", createdAt: null, updatedAt: null },
			],
			snapshots: [],
			projects: [],
			analyses: [],
		});
		expect(items).toEqual([]);
	});
});
