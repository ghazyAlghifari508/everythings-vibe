import { describe, expect, it } from "vitest";
import {
	buildSourceViewRows,
	formatMarkupSource,
	shouldSoftWrapLanguage,
	supportsFormattedView,
} from "./codebase-source-view";
import { CODEBASE_FILE_PREVIEW_MAX_LINES } from "./constants";

const MAX = 5000;

describe("supportsFormattedView", () => {
	it("offers a formatted view for markup files", () => {
		expect(supportsFormattedView("index.html")).toBe(true);
		expect(supportsFormattedView("src/App.vue")).toBe(true);
		expect(supportsFormattedView("assets/logo.svg")).toBe(true);
	});

	it("offers no formatted view for plain source or prose", () => {
		expect(supportsFormattedView("src/main.ts")).toBe(false);
		expect(supportsFormattedView("docs/readme.md")).toBe(false);
		expect(supportsFormattedView("package.json")).toBe(false);
	});
});

describe("formatMarkupSource", () => {
	it("puts each tag of a minified document on its own line", () => {
		const minified =
			'<!doctype html><html lang="en"><head><meta charset="utf-8"><title>A</title></head><body><h1>Judul</h1></body></html>';
		const formatted = formatMarkupSource(minified);
		expect(formatted).not.toBeNull();
		expect(formatted?.split("\n")).toEqual([
			"<!doctype html>",
			'<html lang="en">',
			"  <head>",
			'    <meta charset="utf-8">',
			"    <title>A</title>",
			"  </head>",
			"  <body>",
			"    <h1>Judul</h1>",
			"  </body>",
			"</html>",
		]);
	});

	it("never emits an unbalanced structure", () => {
		expect(formatMarkupSource("<div><span>only open")).toBeNull();
		expect(formatMarkupSource("</div></div>")).toBeNull();
		expect(formatMarkupSource("<div>")).toBeNull();
	});

	it("keeps script and style content verbatim", () => {
		const source =
			"<html><head><style>.a{color:red}</style></head><body><script>if (a<b && c>d) { x(); }</script></body></html>";
		const formatted = formatMarkupSource(source);
		expect(formatted).toContain("if (a<b && c>d) { x(); }");
		expect(formatted).toContain(".a{color:red}");
	});

	it("keeps comments on their own line", () => {
		const formatted = formatMarkupSource(
			"<div><!-- a <b> comment --><p>x</p></div>",
		);
		expect(formatted?.split("\n")).toEqual([
			"<div>",
			"  <!-- a <b> comment -->",
			"  <p>x</p>",
			"</div>",
		]);
	});

	it("does not treat void elements as open", () => {
		const formatted = formatMarkupSource(
			'<div><br><img src="a.png"><hr></div>',
		);
		expect(formatted?.split("\n")).toEqual([
			"<div>",
			"  <br>",
			'  <img src="a.png">',
			"  <hr>",
			"</div>",
		]);
	});

	it("leaves a self-closing element balanced", () => {
		expect(formatMarkupSource("<div><br /></div>")?.split("\n")).toEqual([
			"<div>",
			"  <br />",
			"</div>",
		]);
	});

	it("keeps empty lines that were in the source", () => {
		const formatted = formatMarkupSource("<div>\n\n<p>x</p>\n</div>");
		expect(formatted?.split("\n")).toEqual([
			"<div>",
			"",
			"  <p>x</p>",
			"</div>",
		]);
	});

	it("returns null for content that is not markup at all", () => {
		expect(formatMarkupSource("const a = 1;")).toBeNull();
	});
});

describe("shouldSoftWrapLanguage", () => {
	it("soft wraps prose so long paragraphs stay readable", () => {
		expect(shouldSoftWrapLanguage("markdown")).toBe(true);
	});

	it("keeps code on one line so structure is preserved", () => {
		expect(shouldSoftWrapLanguage("typescript")).toBe(false);
		expect(shouldSoftWrapLanguage("json")).toBe(false);
		expect(shouldSoftWrapLanguage(null)).toBe(false);
	});
});

describe("buildSourceViewRows", () => {
	it("numbers every source line exactly once and in order", () => {
		const content = "alpha\nbeta\ngamma";
		const view = buildSourceViewRows({
			content,
			path: "src/main.ts",
			mode: "original",
			maxLines: MAX,
		});
		expect(view.rows.map((row) => row.lineNumber)).toEqual([1, 2, 3]);
		expect(view.rows.map((row) => row.text)).toEqual([
			"alpha",
			"beta",
			"gamma",
		]);
		expect(view.truncatedLines).toBe(false);
		expect(view.totalLines).toBe(3);
	});

	it("preserves empty lines and indentation", () => {
		const content = "function a() {\n\n\t\treturn 1;\n}";
		const view = buildSourceViewRows({
			content,
			path: "a.ts",
			mode: "original",
			maxLines: MAX,
		});
		expect(view.rows.map((row) => row.text)).toEqual([
			"function a() {",
			"",
			"\t\treturn 1;",
			"}",
		]);
	});

	it("cuts the gutter and the code from the same lines when truncating", () => {
		const content = Array.from({ length: 40 }, (_, i) => `line ${i + 1}`).join(
			"\n",
		);
		const view = buildSourceViewRows({
			content,
			path: "big.ts",
			mode: "original",
			maxLines: 10,
		});
		expect(view.rows).toHaveLength(10);
		expect(view.rows.map((row) => row.lineNumber)).toEqual([
			1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
		]);
		expect(view.rows[9].text).toBe("line 10");
		expect(view.truncatedLines).toBe(true);
		expect(view.totalLines).toBe(40);
	});

	it("keeps highlighting inside a multi-line block comment aligned", () => {
		const content = "/**\n * one\n */\nconst a = 1;";
		const view = buildSourceViewRows({
			content,
			path: "a.ts",
			mode: "original",
			maxLines: MAX,
		});
		expect(view.rows.map((row) => row.text)).toEqual([
			"/**",
			" * one",
			" */",
			"const a = 1;",
		]);
		// Each row carries its own runs, so a row can be rendered alone. Every line
		// of the block comment stays a comment, and the code after it is not
		// still styled as one.
		expect(view.rows[1]?.tokens.map((token) => token.className)).toEqual([
			"hljs-comment",
		]);
		expect(view.rows[2]?.tokens.map((token) => token.className)).toEqual([
			"hljs-comment",
		]);
		expect(view.rows[3]?.tokens[0]?.className).toBe("hljs-keyword");
		// Reassembling the rows reproduces the source exactly.
		expect(view.rows.map((row) => row.text).join("\n")).toBe(content);
		expect(
			view.rows
				.map((row) => row.tokens.map((token) => token.text).join(""))
				.join("\n"),
		).toBe(content);
	});

	it("keeps repository markup as text rather than as markup", () => {
		const view = buildSourceViewRows({
			content: "<script>alert(1)</script>",
			path: "evil.html",
			mode: "original",
			maxLines: MAX,
		});
		expect(view.rows[0].text).toBe("<script>alert(1)</script>");
		// Runs carry plain text only, so React performs the escaping.
		expect(view.rows[0].tokens.map((token) => token.text).join("")).toBe(
			"<script>alert(1)</script>",
		);
	});

	it("falls back to the formatted view when the requested one cannot be produced", () => {
		const view = buildSourceViewRows({
			content: "<div><span>unbalanced",
			path: "broken.html",
			mode: "formatted",
			maxLines: MAX,
		});
		expect(view.mode).toBe("original");
		expect(view.formattedAvailable).toBe(false);
	});

	it("reports the formatted view as available when markup formats cleanly", () => {
		const view = buildSourceViewRows({
			content: "<div><p>x</p></div>",
			path: "ok.html",
			mode: "formatted",
			maxLines: MAX,
		});
		expect(view.mode).toBe("formatted");
		expect(view.formattedAvailable).toBe(true);
		expect(view.rows.map((row) => row.text)).toEqual([
			"<div>",
			"  <p>x</p>",
			"</div>",
		]);
	});

	it("keeps the original source available for copying regardless of the view", () => {
		const view = buildSourceViewRows({
			content: "<div><p>x</p></div>",
			path: "ok.html",
			mode: "formatted",
			maxLines: MAX,
		});
		expect(view.originalContent).toBe("<div><p>x</p></div>");
	});

	it("highlights a markdown file as prose rather than as one code blob", () => {
		const view = buildSourceViewRows({
			content: "# Judul\n\nParagraf panjang.",
			path: "readme.md",
			mode: "original",
			maxLines: MAX,
		});
		expect(view.softWrap).toBe(true);
		expect(view.rows).toHaveLength(3);
		expect(view.rows[0].lineNumber).toBe(1);
	});

	it("renders an unknown language as plain escaped text", () => {
		const view = buildSourceViewRows({
			content: "plain <text> here",
			path: "notes.unknown-ext",
			mode: "original",
			maxLines: MAX,
		});
		expect(view.language).toBeNull();
		expect(view.rows[0].tokens.map((token) => token.text).join("")).toBe(
			"plain <text> here",
		);
	});

	it("handles a single line without a trailing newline", () => {
		const view = buildSourceViewRows({
			content: "only",
			path: "one.txt",
			mode: "original",
			maxLines: MAX,
		});
		expect(view.rows).toHaveLength(1);
		expect(view.rows[0].lineNumber).toBe(1);
	});

	it("stays bounded for a very large file", () => {
		const content = Array.from({ length: 50_000 }, (_, i) => `l${i}`).join(
			"\n",
		);
		const view = buildSourceViewRows({
			content,
			path: "huge.ts",
			mode: "original",
			maxLines: MAX,
		});
		expect(view.rows.length).toBeLessThanOrEqual(MAX);
		expect(view.totalLines).toBe(50_000);
	});

	it("cuts exactly at the shared preview bound", () => {
		const content = Array.from(
			{ length: CODEBASE_FILE_PREVIEW_MAX_LINES + 20 },
			(_, index) => `line ${index + 1}`,
		).join("\n");
		const view = buildSourceViewRows({
			content,
			path: "big.ts",
			mode: "original",
			maxLines: CODEBASE_FILE_PREVIEW_MAX_LINES,
		});

		// The gutter is drawn from these rows, so a truncated file can never
		// show extra unnumbered source lines beside them.
		expect(view.rows).toHaveLength(CODEBASE_FILE_PREVIEW_MAX_LINES);
		expect(view.rows[CODEBASE_FILE_PREVIEW_MAX_LINES - 1]).toMatchObject({
			lineNumber: CODEBASE_FILE_PREVIEW_MAX_LINES,
			text: `line ${CODEBASE_FILE_PREVIEW_MAX_LINES}`,
		});
		expect(view.truncatedLines).toBe(true);
		expect(view.totalLines).toBe(CODEBASE_FILE_PREVIEW_MAX_LINES + 20);
	});
});
