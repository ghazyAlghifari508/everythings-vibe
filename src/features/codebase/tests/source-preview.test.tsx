// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CodebaseSourcePreview } from "../components/explorer/codebase-source-preview";

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
	(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(() => {
	if (root) {
		const current = root;
		act(() => {
			current.unmount();
		});
		root = null;
	}
	container?.remove();
	document.body.innerHTML = "";
	vi.unstubAllGlobals();
});

function render(
	props: Partial<Parameters<typeof CodebaseSourcePreview>[0]> = {},
) {
	act(() => {
		root?.render(
			<CodebaseSourcePreview
				path="src/app.ts"
				content={"const a = 1;\nconst b = 2;"}
				truncated={false}
				sizeBytes={42}
				{...props}
			/>,
		);
	});
}

function rows() {
	return [...container.querySelectorAll("[data-line]")].map((row) => ({
		line: Number(row.getAttribute("data-line")),
		text: row.textContent,
	}));
}

function gutterNumbers(): string[] {
	const gutter = container.querySelector(
		"[data-testid='codebase-source-linenumbers']",
	);
	return [...(gutter?.children ?? [])].map((child) => child.textContent ?? "");
}

function click(testId: string) {
	const button = container.querySelector<HTMLButtonElement>(
		`[data-testid='${testId}']`,
	);
	act(() => {
		button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
	});
}

describe("CodebaseSourcePreview line numbering", () => {
	it("renders a line number for every rendered line", () => {
		render({ content: "one\ntwo\nthree" });

		expect(gutterNumbers()).toEqual(["1", "2", "3"]);
		expect(rows().map((row) => row.line)).toEqual([1, 2, 3]);
		expect(
			container.querySelector("[data-testid='codebase-source-linecount']")
				?.textContent,
		).toBe("3 baris");
	});

	it("keeps empty lines and indentation as their own numbered rows", () => {
		render({ content: "function a() {\n\n\t\treturn 1;\n}" });

		expect(rows()).toEqual([
			{ line: 1, text: "function a() {" },
			{ line: 2, text: "" },
			{ line: 3, text: "\t\treturn 1;" },
			{ line: 4, text: "}" },
		]);
		expect(gutterNumbers()).toEqual(["1", "2", "3", "4"]);
	});

	it("draws the gutter and the code from the same lines for a long file", () => {
		const total = 500;
		const content = Array.from(
			{ length: total },
			(_, index) => `line ${index + 1}`,
		).join("\n");
		render({ content });

		// The exact 3000-line bound belongs to the row model and is asserted
		// there; what the viewer must guarantee is that both columns are drawn
		// from the same sequence and stay aligned at size.
		expect(rows()).toHaveLength(total);
		expect(gutterNumbers()).toHaveLength(total);
		expect(rows()[0]).toEqual({ line: 1, text: "line 1" });
		expect(rows()[total - 1]).toEqual({ line: total, text: `line ${total}` });
		expect(gutterNumbers()[total - 1]).toBe(String(total));
	});

	it("marks content already clipped by the server", () => {
		render({ truncated: true });
		expect(
			container.querySelector("[data-testid='codebase-source-truncated']"),
		).not.toBeNull();
	});

	it("says nothing about truncation when the file is complete", () => {
		render();
		expect(
			container.querySelector("[data-testid='codebase-source-truncated']"),
		).toBeNull();
	});

	it("handles a single line without a trailing newline", () => {
		render({ content: "only" });
		expect(rows()).toEqual([{ line: 1, text: "only" }]);
		expect(gutterNumbers()).toEqual(["1"]);
	});
});

describe("CodebaseSourcePreview file types", () => {
	it("renders markdown prose with wrapping instead of horizontal scrolling", () => {
		render({
			path: "docs/readme.md",
			content: `# Judul\n\nParagraf yang sangat panjang sekali agar membungkus.`,
		});

		expect(rows().map((row) => row.line)).toEqual([1, 2, 3]);
		const firstRow = container.querySelector("[data-line]");
		expect(firstRow?.className).toContain("whitespace-pre-wrap");
		expect(container.textContent).toContain("Paragraf yang sangat panjang");
	});

	it("keeps code rows on a single line so structure survives", () => {
		render({ path: "src/app.ts", content: "const a = 1;" });
		const row = container.querySelector("[data-line]");
		expect(row?.className).toContain("whitespace-pre");
		expect(row?.className).not.toContain("whitespace-pre-wrap");
	});

	it("renders json and css with their own highlighting", () => {
		render({ path: "package.json", content: '{\n  "name": "x"\n}' });
		expect(container.textContent).toContain('"name"');
		expect(rows().map((row) => row.line)).toEqual([1, 2, 3]);

		render({ path: "app.css", content: ".a {\n  color: red;\n}" });
		expect(rows().map((row) => row.line)).toEqual([1, 2, 3]);
	});

	it("highlights a tsx component without losing its lines", () => {
		render({
			path: "src/App.tsx",
			content: "export function App() {\n\treturn <div>hi</div>;\n}",
		});
		expect(rows().map((row) => row.line)).toEqual([1, 2, 3]);
		expect(container.querySelector(".hljs-keyword")).not.toBeNull();
	});

	it("keeps a multi-line comment highlighted across its own rows", () => {
		render({
			path: "src/app.ts",
			content: "/**\n * one\n */\nconst a = 1;",
		});

		expect(rows().map((row) => row.text)).toEqual([
			"/**",
			" * one",
			" */",
			"const a = 1;",
		]);
		for (const row of container.querySelectorAll("[data-line]")) {
			const open = (row.innerHTML.match(/<span/g) ?? []).length;
			const close = (row.innerHTML.match(/<\/span>/g) ?? []).length;
			expect(open).toBe(close);
		}
	});

	it("labels the detected language and reports the stored size", () => {
		render({ path: "src/app.ts", sizeBytes: 2048 });
		expect(container.textContent).toContain("typescript");
		expect(container.textContent).toContain("2.0 KB");
	});

	it("falls back to a plain label when the file has no known language", () => {
		render({ path: "docs/notes.txt", sizeBytes: null });
		expect(container.textContent).toContain("teks");
	});
});

describe("CodebaseSourcePreview original and formatted views", () => {
	const minifiedHtml =
		'<!doctype html><html lang="en"><head><meta charset="utf-8"><title>A</title></head><body><h1>Judul</h1></body></html>';

	it("offers no view toggle for files that are not markup", () => {
		render({ path: "src/app.ts" });
		expect(
			container.querySelector("[data-testid='codebase-source-mode-formatted']"),
		).toBeNull();
	});

	it("formats a minified document only when asked", () => {
		render({ path: "index.html", content: minifiedHtml });

		expect(rows()).toEqual([{ line: 1, text: minifiedHtml }]);

		click("codebase-source-mode-formatted");
		expect(rows().map((row) => row.text)).toEqual([
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

	it("returns to the untouched original", () => {
		render({ path: "index.html", content: minifiedHtml });
		click("codebase-source-mode-formatted");
		click("codebase-source-mode-original");
		expect(rows()).toEqual([{ line: 1, text: minifiedHtml }]);
	});

	it("does not offer a formatted view for markup it cannot format", () => {
		render({ path: "broken.html", content: "<div><span>unbalanced" });
		expect(
			container.querySelector("[data-testid='codebase-source-mode-formatted']"),
		).toBeNull();
		expect(rows()).toEqual([{ line: 1, text: "<div><span>unbalanced" }]);
	});

	it("never mutates the source it was given", () => {
		const original = "<div><p>x</p></div>";
		render({ path: "ok.html", content: original });
		click("codebase-source-mode-formatted");

		expect(original).toBe("<div><p>x</p></div>");
		click("codebase-source-mode-original");
		expect(rows()).toEqual([{ line: 1, text: original }]);
	});
});

describe("CodebaseSourcePreview copying and safety", () => {
	it("offers no copy action of its own — copying lives in the canvas header", () => {
		render({ path: "ok.html", content: "<div><p>x</p></div>" });
		expect(
			container.querySelector("[data-testid='codebase-source-copy']"),
		).toBeNull();
	});

	it("renders repository content as inert text, never as executable markup", () => {
		render({
			path: "src/evil.html",
			content:
				"<script>window.__pwned = true;</script>\n<img src=x onerror=alert(1)>",
		});

		expect(container.querySelector("script")).toBeNull();
		expect(container.querySelector("img")).toBeNull();
		expect((globalThis as Record<string, unknown>).__pwned).toBeUndefined();
		expect(
			container.querySelector("[data-testid='codebase-source-body']")
				?.textContent,
		).toContain("<script>");
	});

	it("does not execute markup shown in the formatted view either", () => {
		render({
			path: "evil.html",
			content: "<div><script>window.__pwned = true;</script></div>",
		});
		click("codebase-source-mode-formatted");

		expect(container.querySelector("script")).toBeNull();
		expect((globalThis as Record<string, unknown>).__pwned).toBeUndefined();
	});

	it("shows a reload action when the caller supplies one", () => {
		const onRetry = vi.fn();
		render({ onRetry });
		const button = container.querySelector<HTMLButtonElement>(
			"[data-testid='codebase-source-body']",
		);
		expect(button).not.toBeNull();
		const reload = [...container.querySelectorAll("button")].find((candidate) =>
			candidate.textContent?.includes("Muat ulang"),
		);
		act(() => {
			reload?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		expect(onRetry).toHaveBeenCalled();
	});
});

describe("CodebaseSourcePreview clipping and scroll containment", () => {
	it("reports how many rows are shown when the source is clipped", () => {
		render({ path: "index.html", content: "a\nb\nc\nd\ne", maxLines: 3 });

		const notice = container.querySelector(
			"[data-testid='codebase-source-truncated']",
		);
		expect(notice?.textContent).toContain("3 dari 5 baris");
		expect(notice?.textContent).toContain(
			"File lengkap tersedia di repository lokal.",
		);
		expect(rows().map((row) => row.line)).toEqual([1, 2, 3]);
	});

	it("uses the supplied hint instead of the repository wording", () => {
		render({
			path: "index.html",
			content: "a\nb\nc\nd\ne",
			maxLines: 3,
			truncationHint: "Unduh file HTML untuk melihat seluruh isi.",
		});

		const notice = container.querySelector(
			"[data-testid='codebase-source-truncated']",
		);
		expect(notice?.textContent).not.toMatch(/repository lokal/i);
		expect(notice?.textContent).toContain(
			"Unduh file HTML untuk melihat seluruh isi.",
		);
	});

	it("keeps the repository wording when the source was already clipped", () => {
		render({ content: "a\nb\nc", truncated: true });

		const notice = container.querySelector(
			"[data-testid='codebase-source-truncated']",
		);
		expect(notice?.textContent).toContain(
			"Pratinjau dipotong agar tetap ringan.",
		);
		expect(notice?.textContent).toContain(
			"File lengkap tersedia di repository lokal.",
		);
	});

	it("caps the source area so a long file scrolls inside it", () => {
		render({ content: "a\nb\nc", maxBodyHeight: 320 });

		const body = container.querySelector<HTMLElement>(
			"[data-testid='codebase-source-body']",
		);
		expect(body?.style.maxHeight).toBe("320px");
		expect(body?.className).toContain("overflow-auto");
	});

	it("lets the source area fill its parent when no cap is given", () => {
		render({ content: "a\nb\nc" });

		const body = container.querySelector<HTMLElement>(
			"[data-testid='codebase-source-body']",
		);
		expect(body?.style.maxHeight).toBe("");
		expect(body?.className).toContain("flex-1");
	});
});

describe("CodebaseSourcePreview file switching", () => {
	it("never keeps the previous file's rows or view", () => {
		render({ path: "index.html", content: "<div><p>x</p></div>" });
		click("codebase-source-mode-formatted");
		expect(container.textContent).toContain("<p>x</p>");

		render({ path: "src/other.ts", content: "const z = 9;" });

		expect(container.textContent).not.toContain("<p>x</p>");
		expect(rows()).toEqual([{ line: 1, text: "const z = 9;" }]);
		// The formatted view is not offered for the newly selected file.
		expect(
			container.querySelector("[data-testid='codebase-source-mode-formatted']"),
		).toBeNull();
	});
});
