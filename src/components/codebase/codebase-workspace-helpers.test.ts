import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import {
	buildExportPlanCommand,
	buildPlanHandoffPrompt,
} from "./codebase-chat-workspace";
import {
	type ExplorerFileEntry,
	filterExplorerFiles,
} from "./codebase-explorer-sidebar";
import { formatFileSize } from "./codebase-file-card";
import { getCodebaseKanbanProgress } from "./codebase-kanban-board";
import {
	CodebaseMarkdown,
	parseVersionRows,
	selectLatestVersionContent,
	stripInternalSectionMarkers,
} from "./codebase-markdown";

function renderMarkdown(content: string): string {
	return renderToStaticMarkup(createElement(CodebaseMarkdown, { content }));
}

describe("CodebaseMarkdown mermaid handling", () => {
	test("intercepts a mermaid fence instead of emitting it as a code block", () => {
		const html = renderMarkdown("```mermaid\ngraph TD;\n  A-->B;\n```");
		expect(html).not.toContain("language-mermaid");
		expect(html).not.toContain("graph TD");
	});

	test("keeps an ordinary fenced block as a highlighted code block", () => {
		const html = renderMarkdown("```ts\nconst a = 1;\n```");
		expect(html).toContain("language-ts");
		expect(html).toContain("hljs-keyword");
	});

	test("anchors headings so the table of contents can navigate to them", () => {
		const html = renderMarkdown("## Tujuan Produk\n\nisi");
		expect(html).toContain('id="tujuan-produk"');
	});
});

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

describe("buildExportPlanCommand", () => {
	test("builds the plan export command for a project", () => {
		expect(buildExportPlanCommand("prj_123")).toBe(
			"npx vibeeverything export plan prj_123 --root .",
		);
	});

	test("trims surrounding whitespace from the project id", () => {
		expect(buildExportPlanCommand("  prj_123  ")).toBe(
			"npx vibeeverything export plan prj_123 --root .",
		);
	});
});

describe("buildPlanHandoffPrompt", () => {
	test("uses the real project id and the CLI export command", () => {
		const prompt = buildPlanHandoffPrompt("prj_123", "react-movie-app");
		expect(prompt).toContain("npx vibeeverything export plan prj_123 --root .");
		expect(prompt).toContain("Project ID: prj_123");
		// The agent is pointed at the written documents, not handed the PRD.
		expect(prompt).toContain("docs/vibeplan/");
		expect(prompt).toContain("manifest.json");
		expect(prompt).toContain("tasks.json");
		// It must read repository rules and preserve the existing architecture.
		expect(prompt).toContain("AGENTS.md");
		expect(prompt).toContain("react-movie-app");
		// Task status is updated through the CLI, never by editing the snapshot.
		expect(prompt).toContain("task update");
		expect(prompt).toContain("subtask update");
	});

	test("never embeds a credential or a placeholder", () => {
		const prompt = buildPlanHandoffPrompt("prj_123", null);
		expect(prompt).not.toMatch(/token|api[-_ ]?key|secret|bearer/i);
		expect(prompt).not.toContain("<projectId>");
		expect(prompt).not.toContain("YOUR_");
	});

	test("omits the repository name when none is known", () => {
		const prompt = buildPlanHandoffPrompt("prj_123", null);
		expect(prompt).not.toContain("repository null");
		expect(prompt).toContain("Pastikan kamu berada di repository yang benar");
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

describe("parseVersionRows", () => {
	test("accepts rows with version and content", () => {
		expect(
			parseVersionRows([
				{ version: 1, content: "a" },
				{ version: 2, content: "b" },
			]),
		).toEqual([
			{ version: 1, content: "a" },
			{ version: 2, content: "b" },
		]);
	});

	test("rejects rows with missing content", () => {
		expect(parseVersionRows([{ version: 1 }])).toBeNull();
		expect(parseVersionRows(null)).toBeNull();
	});
});

describe("selectLatestVersionContent", () => {
	test("selects the content of the highest version", () => {
		expect(
			selectLatestVersionContent([
				{ version: 1, content: "lama" },
				{ version: 3, content: "baru" },
				{ version: 2, content: "tengah" },
			]),
		).toBe("baru");
	});

	test("returns null when there are no rows or only blank content", () => {
		expect(selectLatestVersionContent([])).toBeNull();
		expect(
			selectLatestVersionContent([{ version: 1, content: "   " }]),
		).toBeNull();
	});
});

describe("stripInternalSectionMarkers", () => {
	test("returns original content when there are no markers or empty input", () => {
		expect(stripInternalSectionMarkers("")).toBe("");
		expect(stripInternalSectionMarkers("## Judul\n\nIsi")).toBe(
			"## Judul\n\nIsi",
		);
	});

	test("strips opening and closing section comments from markdown", () => {
		const raw = [
			"<!-- SECTION: Overview -->",
			"## 1. Overview",
			"### 1.1 Latar Belakang",
			"Paragraf pengantar.",
			"<!-- /SECTION -->",
			"",
			"<!-- SECTION: Goals & Success Metrics -->",
			"## 2. Goals & Success Metrics",
			"- Metrik 1",
			"<!-- /SECTION -->",
		].join("\n");

		const cleaned = stripInternalSectionMarkers(raw);
		expect(cleaned).not.toContain("<!-- SECTION: Overview -->");
		expect(cleaned).not.toContain("<!-- /SECTION -->");
		expect(cleaned).not.toContain("<!-- SECTION: Goals & Success Metrics -->");
		expect(cleaned).toContain("## 1. Overview");
		expect(cleaned).toContain("Paragraf pengantar.");
		expect(cleaned).toContain("## 2. Goals & Success Metrics");
		expect(cleaned).toContain("- Metrik 1");
	});

	test("preserves markers verbatim inside triple-backtick code fences", () => {
		const raw = [
			"## Panduan",
			"",
			"```html",
			"<!-- SECTION: Overview -->",
			"<div>Konten</div>",
			"<!-- /SECTION -->",
			"```",
		].join("\n");

		const cleaned = stripInternalSectionMarkers(raw);
		expect(cleaned).toBe(raw);
	});

	test("preserves markers verbatim inside tilde code fences", () => {
		const raw = [
			"## Panduan Tilde",
			"",
			"~~~markdown",
			"<!-- SECTION: Architecture & Tech Stack -->",
			"~~~",
		].join("\n");

		const cleaned = stripInternalSectionMarkers(raw);
		expect(cleaned).toBe(raw);
	});

	test("preserves markers inside inline backtick code spans", () => {
		const raw = "Gunakan `<!-- SECTION: Overview -->` sebagai marker pembuka.";
		const cleaned = stripInternalSectionMarkers(raw);
		expect(cleaned).toBe(raw);
	});

	test("does not strip legitimate non-section HTML comments or HTML elements", () => {
		const raw = [
			"<!-- Copyright 2026 Author -->",
			'<div class="custom">',
			"Konten",
			"</div>",
		].join("\n");

		const cleaned = stripInternalSectionMarkers(raw);
		expect(cleaned).toContain("<!-- Copyright 2026 Author -->");
		expect(cleaned).toContain('<div class="custom">');
	});

	test("preserves tables, headings, and mermaid diagrams", () => {
		const raw = [
			"<!-- SECTION: Architecture & Tech Stack -->",
			"## 6. Architecture & Tech Stack",
			"",
			"| Komponen | Fungsi |",
			"| --- | --- |",
			"| Web | Client |",
			"",
			"```mermaid",
			"graph TD;",
			"  A-->B;",
			"```",
			"<!-- /SECTION -->",
		].join("\n");

		const cleaned = stripInternalSectionMarkers(raw);
		expect(cleaned).not.toContain("SECTION: Architecture");
		expect(cleaned).toContain("## 6. Architecture & Tech Stack");
		expect(cleaned).toContain("| Komponen | Fungsi |");
		expect(cleaned).toContain("```mermaid\ngraph TD;\n  A-->B;\n```");
	});
});
