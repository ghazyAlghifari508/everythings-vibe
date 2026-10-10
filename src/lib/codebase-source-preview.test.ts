import { describe, expect, it } from "vitest";
import {
	assembleSnapshotFileChunks,
	buildFencedSource,
	detectSourceLanguage,
	isDisplayableTextContent,
	limitPreviewLines,
	sourceFileName,
	truncatePreviewContent,
} from "./codebase-source-preview";
import { CODEBASE_FILE_PREVIEW_MAX_LINES } from "./constants";

describe("assembleSnapshotFileChunks", () => {
	it("rejoins chunks in index order regardless of row order", () => {
		expect(
			assembleSnapshotFileChunks([
				{ chunkIndex: 2, chunkTotal: 3, data: "Qw==" },
				{ chunkIndex: 0, chunkTotal: 3, data: "QQ==" },
				{ chunkIndex: 1, chunkTotal: 3, data: "Qg==" },
			]),
		).toBe("QQ==Qg==Qw==");
	});

	it("rejects an incomplete chunk set instead of silently dropping content", () => {
		expect(
			assembleSnapshotFileChunks([
				{ chunkIndex: 0, chunkTotal: 3, data: "QQ==" },
				{ chunkIndex: 2, chunkTotal: 3, data: "Qw==" },
			]),
		).toBeNull();
	});

	it("rejects inconsistent, missing, or empty chunk metadata", () => {
		expect(
			assembleSnapshotFileChunks([
				{ chunkIndex: 0, chunkTotal: 2, data: "QQ==" },
				{ chunkIndex: 1, chunkTotal: 3, data: "Qg==" },
			]),
		).toBeNull();
		expect(
			assembleSnapshotFileChunks([{ chunkIndex: 0, chunkTotal: 1, data: "" }]),
		).toBeNull();
		expect(
			assembleSnapshotFileChunks([
				{ chunkIndex: 0, chunkTotal: 0, data: "QQ==" },
			]),
		).toBeNull();
		expect(assembleSnapshotFileChunks([])).toBeNull();
	});

	it("rejects a set whose indices do not start at zero", () => {
		expect(
			assembleSnapshotFileChunks([
				{ chunkIndex: 1, chunkTotal: 1, data: "QQ==" },
			]),
		).toBeNull();
	});
});

describe("truncatePreviewContent", () => {
	it("returns short content untouched", () => {
		expect(truncatePreviewContent("abc", 10)).toEqual({
			content: "abc",
			truncated: false,
		});
	});

	it("cuts on a line boundary so line numbers never drift", () => {
		const content = `${"a".repeat(10)}\n${"b".repeat(10)}\n${"c".repeat(10)}`;
		const result = truncatePreviewContent(content, 15);
		expect(result.truncated).toBe(true);
		expect(result.content).toBe(`${"a".repeat(10)}\n`);
		expect(result.content.split("\n").filter(Boolean)).toHaveLength(1);
	});

	it("keeps the raw slice when the budget has no line break", () => {
		const result = truncatePreviewContent("abcdefghij", 4);
		expect(result).toEqual({ content: "abcd", truncated: true });
	});
});

describe("limitPreviewLines", () => {
	it("passes short files through with their real line count", () => {
		const result = limitPreviewLines(["a", "b", "c"]);
		expect(result).toEqual({ lines: ["a", "b", "c"], truncated: false });
	});

	it("bounds very large files at the shared limit", () => {
		const lines = Array.from(
			{ length: CODEBASE_FILE_PREVIEW_MAX_LINES + 25 },
			(_, index) => `line-${index}`,
		);
		const result = limitPreviewLines(lines);
		expect(result.lines).toHaveLength(CODEBASE_FILE_PREVIEW_MAX_LINES);
		expect(result.truncated).toBe(true);
		expect(result.lines[CODEBASE_FILE_PREVIEW_MAX_LINES - 1]).toBe(
			`line-${CODEBASE_FILE_PREVIEW_MAX_LINES - 1}`,
		);
	});
});

describe("isDisplayableTextContent", () => {
	it("accepts normal source with tabs and newlines", () => {
		expect(isDisplayableTextContent("const a = 1;\n\tif (a) {\r\n}\n")).toBe(
			true,
		);
		expect(isDisplayableTextContent("")).toBe(true);
	});

	it("rejects decoded bytes that are not displayable text", () => {
		expect(isDisplayableTextContent("abc\u0000def")).toBe(false);
		expect(isDisplayableTextContent("abc\u0001def")).toBe(false);
		expect(isDisplayableTextContent("abc\u007fdef")).toBe(false);
	});
});

describe("detectSourceLanguage", () => {
	it("maps common source extensions to highlight.js languages", () => {
		const cases: Array<[string, string]> = [
			["src/app.ts", "typescript"],
			["src/app.tsx", "tsx"],
			["server.js", "javascript"],
			["styles/app.css", "css"],
			["scripts/run.sh", "bash"],
			["db/schema.sql", "sql"],
			["Dockerfile", "dockerfile"],
			["config/app.yml", "yaml"],
		];
		for (const [path, language] of cases) {
			expect(detectSourceLanguage(path)).toBe(language);
		}
	});

	it("returns null for extensions without a highlighting mapping", () => {
		expect(detectSourceLanguage("LICENSE")).toBeNull();
		expect(detectSourceLanguage("docs/notes.txt")).toBeNull();
		expect(detectSourceLanguage(".gitignore")).toBeNull();
	});
});

describe("buildFencedSource", () => {
	it("wraps content with the detected language and a minimal fence", () => {
		expect(buildFencedSource("const a = 1;", "typescript")).toBe(
			"```typescript\nconst a = 1;\n```",
		);
	});

	it("uses a bare fence when no language is supported", () => {
		expect(buildFencedSource("plain text", null)).toBe("```\nplain text\n```");
	});

	it("widens the fence past any backtick run in the content", () => {
		const fenced = buildFencedSource("```js\nconst a = 1;\n```", "typescript");
		expect(fenced.startsWith("````typescript")).toBe(true);
		expect(fenced.endsWith("\n````")).toBe(true);
	});
});

describe("sourceFileName", () => {
	it("returns the last path segment and the whole name at the root", () => {
		expect(sourceFileName("src/components/app.tsx")).toBe("app.tsx");
		expect(sourceFileName("README.md")).toBe("README.md");
	});
});
