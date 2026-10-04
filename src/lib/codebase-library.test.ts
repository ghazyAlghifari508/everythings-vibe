import { describe, expect, it } from "vitest";
import {
	type CodebaseLibraryItem,
	filterLibraryItems,
	getLibraryItemHref,
	hasLibraryAnalysis,
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

describe("hasLibraryAnalysis", () => {
	it("is false when no persisted analysis fields exist", () => {
		expect(hasLibraryAnalysis(makeItem())).toBe(false);
	});

	it("is true when any persisted analysis field exists", () => {
		expect(hasLibraryAnalysis(makeItem({ framework: "React" }))).toBe(true);
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
