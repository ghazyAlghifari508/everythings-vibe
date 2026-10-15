// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CodebaseDocPreview } from "./codebase-doc-preview";

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
});

const SAMPLE = [
	"# PRD Fitur Ekspor",
	"",
	"## Tujuan",
	"",
	"Memberi user cara mengunduh ringkasan rekomendasi.",
	"",
	"## Alur Pengguna",
	"",
	"1. User membuka halaman rekomendasi.",
	"2. User menekan tombol ekspor.",
	"",
	"| Field | Nilai |",
	"| --- | --- |",
	"| Format | Markdown |",
	"",
	"```ts",
	"const value = 1;",
	"```",
	"",
	"```mermaid",
	"graph TD; A-->B;",
	"```",
	"",
	"[Tautan dokumentasi](https://example.com)",
].join("\n");

function render(content = SAMPLE) {
	act(() => {
		root?.render(<CodebaseDocPreview content={content} />);
	});
}

describe("CodebaseDocPreview", () => {
	it("renders the document without a table of contents", () => {
		render();
		const preview = container.querySelector(
			"[data-testid='codebase-doc-preview']",
		);
		expect(preview).not.toBeNull();
		expect(preview?.querySelector("aside")).toBeNull();
		expect(container.textContent).not.toContain("Table of Contents");
	});

	it("renders real markdown structure, not plain text", () => {
		render();
		expect(container.querySelector("h1")?.textContent).toBe("PRD Fitur Ekspor");
		const headings = [...container.querySelectorAll("h2")].map(
			(node) => node.textContent,
		);
		expect(headings).toEqual(["Tujuan", "Alur Pengguna"]);
		expect(container.querySelectorAll("ol li").length).toBe(2);
	});

	it("renders tables, code blocks, and links", () => {
		render();
		expect(container.querySelector("table")).not.toBeNull();
		expect(container.querySelector("pre code")).not.toBeNull();
		const link = container.querySelector("a");
		expect(link?.getAttribute("href")).toBe("https://example.com");
	});

	it("keeps headings addressable for in-document anchors", () => {
		render();
		expect(container.querySelector("h2#tujuan")).not.toBeNull();
		expect(container.querySelector("h2#alur-pengguna")).not.toBeNull();
	});

	it("renders long content without truncation", () => {
		const long = Array.from(
			{ length: 80 },
			(_, index) => `## Bagian ${index + 1}\n\nIsi bagian ${index + 1}.`,
		).join("\n\n");
		render(long);
		expect(container.querySelectorAll("h2").length).toBe(80);
		expect(container.textContent).toContain("Isi bagian 80.");
	});

	it("strips internal structural section markers from the presentation preview", () => {
		const docWithMarkers = [
			"<!-- SECTION: Overview -->",
			"## 1. Overview",
			"",
			"Deskripsi produk di sini.",
			"<!-- /SECTION -->",
			"",
			"<!-- SECTION: Goals & Success Metrics -->",
			"## 2. Goals & Success Metrics",
			"",
			"- Target 1",
			"<!-- /SECTION -->",
		].join("\n");

		render(docWithMarkers);
		expect(container.textContent).not.toContain("SECTION: Overview");
		expect(container.textContent).not.toContain("<!--");
		expect(container.textContent).not.toContain("/SECTION");
		expect(container.querySelector('h2[id="1-overview"]')?.textContent).toBe(
			"1. Overview",
		);
		expect(container.textContent).toContain("Deskripsi produk di sini.");
		expect(container.textContent).toContain("Target 1");
	});

	it("preserves section markers when they are inside code fences", () => {
		const docWithFencedMarker = [
			"## 1. Panduan Markdown",
			"",
			"```html",
			"<!-- SECTION: Overview -->",
			"<div>Contoh kode</div>",
			"<!-- /SECTION -->",
			"```",
		].join("\n");

		render(docWithFencedMarker);
		const codeBlock = container.querySelector("pre code");
		expect(codeBlock).not.toBeNull();
		expect(codeBlock?.textContent).toContain("<!-- SECTION: Overview -->");
		expect(codeBlock?.textContent).toContain("<!-- /SECTION -->");
	});
});
