// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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

function noticeText() {
	return (
		container.querySelector("[data-testid='codebase-source-truncated']")
			?.textContent ?? ""
	);
}

describe("CodebaseSourcePreview clipping and scroll containment", () => {
	it("reports how many rows are shown when the source is clipped", () => {
		render({ path: "index.html", content: "a\nb\nc\nd\ne", maxLines: 3 });

		expect(noticeText()).toContain("3 dari 5 baris");
		expect(noticeText()).toContain(
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

		expect(noticeText()).not.toMatch(/repository lokal/i);
		expect(noticeText()).toContain(
			"Unduh file HTML untuk melihat seluruh isi.",
		);
	});

	it("keeps the repository wording when the source was already clipped", () => {
		render({ content: "a\nb\nc", truncated: true });

		expect(noticeText()).toContain("Pratinjau dipotong agar tetap ringan.");
		expect(noticeText()).toContain(
			"File lengkap tersedia di repository lokal.",
		);
	});

	it("caps the source area so a long file scrolls inside it", () => {
		render({ content: "a\nb\nc", maxBodyHeight: 320 });

		const body = container.querySelector<HTMLElement>(
			"[data-testid='codebase-source-body']",
		);
		expect(body?.style.maxHeight).toBe("320px");
	});

	it("lets the source area fill its parent when no cap is given", () => {
		render({ content: "a\nb\nc" });

		const body = container.querySelector<HTMLElement>(
			"[data-testid='codebase-source-body']",
		);
		expect(body?.style.maxHeight).toBe("");
	});
});
