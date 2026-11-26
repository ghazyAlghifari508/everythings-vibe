import { describe, expect, it } from "vitest";
import {
	buildSourceViewRows,
	splitSourceLines,
} from "@/features/codebase/services/source-view";

describe("splitSourceLines deterministic line splitting", () => {
	it("handles an empty file with zero lines", () => {
		const res = splitSourceLines("");
		expect(res.lines).toEqual([]);
		expect(res.hasTrailingNewline).toBe(false);
		expect(res.trailingBlankCount).toBe(0);
	});

	it("handles a file without a trailing newline", () => {
		const res = splitSourceLines("one\ntwo");
		expect(res.lines).toEqual(["one", "two"]);
		expect(res.hasTrailingNewline).toBe(false);
		expect(res.trailingBlankCount).toBe(0);
	});

	it("treats a single trailing newline as a POSIX line terminator without inventing a phantom row", () => {
		const res = splitSourceLines("one\ntwo\n");
		expect(res.lines).toEqual(["one", "two"]);
		expect(res.hasTrailingNewline).toBe(true);
		expect(res.trailingBlankCount).toBe(0);
	});

	it("preserves genuine trailing blank lines that exist in the source", () => {
		const res = splitSourceLines("one\ntwo\n\n\n");
		expect(res.lines).toEqual(["one", "two", "", ""]);
		expect(res.hasTrailingNewline).toBe(true);
		expect(res.trailingBlankCount).toBe(2);
	});

	it("handles CRLF vs LF identically without leaving dangling carriage returns", () => {
		const lf = splitSourceLines("alpha\nbeta\ngamma\n");
		const crlf = splitSourceLines("alpha\r\nbeta\r\ngamma\r\n");

		expect(crlf.lines).toEqual(lf.lines);
		expect(crlf.lines).toEqual(["alpha", "beta", "gamma"]);
		expect(crlf.lines.every((line) => !line.includes("\r"))).toBe(true);
		expect(crlf.hasTrailingNewline).toBe(true);
		expect(crlf.trailingBlankCount).toBe(0);
	});

	it("preserves blank lines in the middle of a file", () => {
		const res = splitSourceLines("first\n\n\nsecond\n");
		expect(res.lines).toEqual(["first", "", "", "second"]);
		expect(res.hasTrailingNewline).toBe(true);
		expect(res.trailingBlankCount).toBe(0);

		const resCrlf = splitSourceLines("first\r\n\r\nsecond\r\n");
		expect(resCrlf.lines).toEqual(["first", "", "second"]);
		expect(resCrlf.lines[1]).toBe("");
		expect(resCrlf.trailingBlankCount).toBe(0);
	});

	it("detects trailing whitespace-only lines as trailing blank lines", () => {
		const res = splitSourceLines("content\n   \n\t\n");
		expect(res.lines).toEqual(["content", "   ", "\t"]);
		expect(res.trailingBlankCount).toBe(2);
	});
});

describe("buildSourceViewRows line boundary invariants", () => {
	it("numbers files without trailing newlines exactly to content length", () => {
		const content = "const a = 1;\nconst b = 2;";
		const view = buildSourceViewRows({
			content,
			path: "test.ts",
			mode: "original",
			maxLines: 100,
		});

		expect(view.totalLines).toBe(2);
		expect(view.rows.map((row) => row.lineNumber)).toEqual([1, 2]);
		expect(view.rows.map((row) => row.text)).toEqual([
			"const a = 1;",
			"const b = 2;",
		]);
		expect(view.hasTrailingNewline).toBe(false);
		expect(view.trailingBlankCount).toBe(0);
	});

	it("does not append a blank row for files with a single trailing terminator newline", () => {
		const content = "line 1\nline 2\nline 3\n";
		const view = buildSourceViewRows({
			content,
			path: "test.txt",
			mode: "original",
			maxLines: 100,
		});

		expect(view.totalLines).toBe(3);
		expect(view.rows).toHaveLength(3);
		expect(view.rows.map((row) => row.lineNumber)).toEqual([1, 2, 3]);
		expect(view.rows[2]?.text).toBe("line 3");
		expect(view.hasTrailingNewline).toBe(true);
		expect(view.trailingBlankCount).toBe(0);
	});

	it("accurately numbers and preserves multiple trailing blank lines when present in source", () => {
		// Example matching the problem report: content ends at 3, followed by 3 blank lines
		const content = "line 1\nline 2\nline 3\n\n\n\n";
		const view = buildSourceViewRows({
			content,
			path: "test.txt",
			mode: "original",
			maxLines: 100,
		});

		expect(view.totalLines).toBe(6);
		expect(view.rows).toHaveLength(6);
		expect(view.rows.map((row) => row.lineNumber)).toEqual([1, 2, 3, 4, 5, 6]);
		expect(view.rows[2]?.text).toBe("line 3");
		expect(view.rows[3]?.text).toBe("");
		expect(view.rows[4]?.text).toBe("");
		expect(view.rows[5]?.text).toBe("");
		expect(view.trailingBlankCount).toBe(3);
		expect(view.hiddenTrailingLinesCount).toBe(0);
	});

	it("allows presentation hiding of trailing blank lines without modifying original content or totalLines", () => {
		const content = "line 1\nline 2\nline 3\n\n\n\n";
		const view = buildSourceViewRows({
			content,
			path: "test.txt",
			mode: "original",
			maxLines: 100,
			hideTrailingBlankLines: true,
		});

		expect(view.totalLines).toBe(6);
		expect(view.rows).toHaveLength(3);
		expect(view.rows.map((row) => row.lineNumber)).toEqual([1, 2, 3]);
		expect(view.hiddenTrailingLinesCount).toBe(3);
		expect(view.originalContent).toBe(content);
	});

	it("preserves empty lines in the middle even when hideTrailingBlankLines is active", () => {
		const content = "header\n\nbody\n\n\n";
		const view = buildSourceViewRows({
			content,
			path: "test.txt",
			mode: "original",
			maxLines: 100,
			hideTrailingBlankLines: true,
		});

		expect(view.totalLines).toBe(5);
		expect(view.rows).toHaveLength(3);
		expect(view.rows.map((row) => row.text)).toEqual(["header", "", "body"]);
		expect(view.rows.map((row) => row.lineNumber)).toEqual([1, 2, 3]);
		expect(view.hiddenTrailingLinesCount).toBe(2);
	});

	it("preserves line numbers correctly under truncation", () => {
		const content = "a\nb\nc\nd\ne\n";
		const view = buildSourceViewRows({
			content,
			path: "test.txt",
			mode: "original",
			maxLines: 3,
		});

		expect(view.totalLines).toBe(5);
		expect(view.rows).toHaveLength(3);
		expect(view.rows.map((row) => row.lineNumber)).toEqual([1, 2, 3]);
		expect(view.truncatedLines).toBe(true);
	});

	it("maintains line numbering synchronization in formatted view for markup", () => {
		const minifiedHtml =
			"<!doctype html><html><head><title>T</title></head><body><p>Text</p></body></html>\n";
		const originalView = buildSourceViewRows({
			content: minifiedHtml,
			path: "index.html",
			mode: "original",
			maxLines: 100,
		});
		expect(originalView.totalLines).toBe(1);
		expect(originalView.rows).toHaveLength(1);
		expect(originalView.rows[0]?.lineNumber).toBe(1);

		const formattedView = buildSourceViewRows({
			content: minifiedHtml,
			path: "index.html",
			mode: "formatted",
			maxLines: 100,
		});
		expect(formattedView.rows.length).toBeGreaterThan(1);
		expect(
			formattedView.rows.map((row, idx) => row.lineNumber === idx + 1),
		).toEqual(Array.from({ length: formattedView.rows.length }, () => true));
		expect(formattedView.originalContent).toBe(minifiedHtml);
	});
});
