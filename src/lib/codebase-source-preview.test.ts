import { describe, expect, it } from "vitest";
import {
	assembleSnapshotFileChunks,
	detectSourceLanguage,
	isDisplayableTextContent,
	sourceFileName,
	truncatePreviewContent,
} from "./codebase-source-preview";

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

describe("sourceFileName", () => {
	it("returns the last path segment and the whole name at the root", () => {
		expect(sourceFileName("src/components/app.tsx")).toBe("app.tsx");
		expect(sourceFileName("README.md")).toBe("README.md");
	});
});
