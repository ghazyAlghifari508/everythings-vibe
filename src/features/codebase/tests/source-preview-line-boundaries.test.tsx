// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CodebaseSourcePreview } from "../components/explorer/codebase-source-preview";

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(() => {
	if (root) {
		act(() => {
			root?.unmount();
		});
		root = null;
	}
	container.remove();
});

function render(
	props: Partial<Parameters<typeof CodebaseSourcePreview>[0]> = {},
) {
	act(() => {
		root?.render(
			<CodebaseSourcePreview
				path="src/app.ts"
				content={"const a = 1;\nconst b = 2;\n"}
				truncated={false}
				sizeBytes={32}
				{...props}
			/>,
		);
	});
}

function rows(): Array<{ line: number; text: string }> {
	return [...container.querySelectorAll("[data-line]")].map((element) => ({
		line: Number(element.getAttribute("data-line")),
		text: element.textContent ?? "",
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

describe("CodebaseSourcePreview line boundary rendering", () => {
	it("renders exact lines without phantom row for files with single trailing newline", () => {
		render({ content: "const a = 1;\nconst b = 2;\n" });

		expect(rows()).toEqual([
			{ line: 1, text: "const a = 1;" },
			{ line: 2, text: "const b = 2;" },
		]);
		expect(gutterNumbers()).toEqual(["1", "2"]);
		expect(
			container.querySelector("[data-testid='codebase-source-linecount']")
				?.textContent,
		).toBe("2 baris");
		expect(
			container.querySelector("[data-testid='codebase-source-eof']")
				?.textContent,
		).toContain("[Akhir file]");
	});

	it("renders multiple trailing blank lines with explicit note and toggle affordance", () => {
		const content = "line 1\nline 2\n\n\n";
		render({ content });

		// Source has 4 lines total (2 content, 2 blank)
		expect(rows()).toHaveLength(4);
		expect(gutterNumbers()).toEqual(["1", "2", "3", "4"]);
		expect(
			container.querySelector("[data-testid='codebase-source-linecount']")
				?.textContent,
		).toBe("4 baris");
		expect(
			container.querySelector("[data-testid='codebase-source-trailing-note']")
				?.textContent,
		).toContain("2 kosong di akhir");

		const toggle = container.querySelector(
			"[data-testid='codebase-source-trailing-toggle']",
		);
		expect(toggle?.textContent).toContain("Sembunyikan 2 baris kosong akhir");

		// Click to hide trailing blank lines
		click("codebase-source-trailing-toggle");
		expect(rows()).toHaveLength(2);
		expect(gutterNumbers()).toEqual(["1", "2"]);
		expect(
			container.querySelector("[data-testid='codebase-source-eof']")
				?.textContent,
		).toContain("2 baris kosong di akhir disembunyikan");
		expect(
			container.querySelector("[data-testid='codebase-source-trailing-toggle']")
				?.textContent,
		).toContain("Tampilkan 2 baris kosong akhir");

		// Click again to restore
		click("codebase-source-trailing-toggle");
		expect(rows()).toHaveLength(4);
		expect(gutterNumbers()).toEqual(["1", "2", "3", "4"]);
	});

	it("omits [Akhir file] indicator when content is truncated", () => {
		render({
			content: "line 1\nline 2\nline 3\n",
			truncated: true,
		});

		expect(
			container.querySelector("[data-testid='codebase-source-eof']"),
		).toBeNull();
		expect(
			container.querySelector("[data-testid='codebase-source-truncated']"),
		).not.toBeNull();
	});

	it("handles CRLF content identically to LF without stray carriage returns", () => {
		render({ content: "export default 1;\r\nexport const b = 2;\r\n" });

		expect(rows()).toEqual([
			{ line: 1, text: "export default 1;" },
			{ line: 2, text: "export const b = 2;" },
		]);
		expect(rows().every((r) => !r.text.includes("\r"))).toBe(true);
	});
});
