import { describe, expect, test } from "vitest";
import { buildHandoffCommand } from "./codebase-chat-workspace";
import {
	type ExplorerFileEntry,
	filterExplorerFiles,
} from "./codebase-explorer-sidebar";
import { formatFileSize } from "./codebase-file-card";
import { getCodebaseKanbanProgress } from "./codebase-kanban-board";
import { parsePrdVersions, selectLatestPrdContent } from "./codebase-markdown";

describe("formatFileSize", () => {
	test("formats bytes below 1 KB", () => {
		expect(formatFileSize(0)).toBe("0 B");
		expect(formatFileSize(512)).toBe("512 B");
	});

	test("formats kilobytes with one decimal", () => {
		expect(formatFileSize(1024)).toBe("1.0 KB");
		expect(formatFileSize(1536)).toBe("1.5 KB");
	});

	test("formats megabytes with one decimal", () => {
		expect(formatFileSize(1048576)).toBe("1.0 MB");
	});

	test("falls back to zero for non-finite or negative input", () => {
		expect(formatFileSize(-1)).toBe("0 B");
		expect(formatFileSize(Number.NaN)).toBe("0 B");
	});
});

describe("filterExplorerFiles", () => {
	const files: ExplorerFileEntry[] = [
		{ path: "src/components/Navbar.tsx" },
		{ path: "src/db/schema.ts" },
		{ path: "package.json" },
	];

	test("returns every file when the query is blank", () => {
		expect(filterExplorerFiles(files, "   ")).toEqual(files);
	});

	test("matches paths case-insensitively", () => {
		expect(filterExplorerFiles(files, "SCHEMA")).toEqual([
			{ path: "src/db/schema.ts" },
		]);
	});

	test("returns an empty list when nothing matches", () => {
		expect(filterExplorerFiles(files, "tidak-ada")).toEqual([]);
	});
});

describe("buildHandoffCommand", () => {
	test("builds the export plus task-next command for a project", () => {
		expect(buildHandoffCommand("prj_123")).toBe(
			"npx vibeeverything export rules prj_123 && npx vibeeverything task next prj_123",
		);
	});

	test("trims surrounding whitespace from the project id", () => {
		expect(buildHandoffCommand("  prj_123  ")).toBe(
			"npx vibeeverything export rules prj_123 && npx vibeeverything task next prj_123",
		);
	});
});

describe("getCodebaseKanbanProgress", () => {
	test("computes done, total, and rounded percentage", () => {
		expect(getCodebaseKanbanProgress({ done: 2, total: 5 })).toEqual({
			done: 2,
			total: 5,
			pct: 40,
		});
	});

	test("reports zero percent when there are no tasks", () => {
		expect(getCodebaseKanbanProgress({ done: 0, total: 0 })).toEqual({
			done: 0,
			total: 0,
			pct: 0,
		});
	});

	test("clamps done to total", () => {
		expect(getCodebaseKanbanProgress({ done: 9, total: 4 })).toEqual({
			done: 4,
			total: 4,
			pct: 100,
		});
	});
});

describe("parsePrdVersions", () => {
	test("accepts rows with version and content", () => {
		expect(
			parsePrdVersions([
				{ version: 1, content: "a" },
				{ version: 2, content: "b" },
			]),
		).toEqual([
			{ version: 1, content: "a" },
			{ version: 2, content: "b" },
		]);
	});

	test("rejects rows with missing content", () => {
		expect(parsePrdVersions([{ version: 1 }])).toBeNull();
		expect(parsePrdVersions(null)).toBeNull();
	});
});

describe("selectLatestPrdContent", () => {
	test("selects the content of the highest version", () => {
		expect(
			selectLatestPrdContent([
				{ version: 1, content: "lama" },
				{ version: 3, content: "baru" },
				{ version: 2, content: "tengah" },
			]),
		).toBe("baru");
	});

	test("returns null when there are no rows or only blank content", () => {
		expect(selectLatestPrdContent([])).toBeNull();
		expect(selectLatestPrdContent([{ version: 1, content: "   " }])).toBeNull();
	});
});
