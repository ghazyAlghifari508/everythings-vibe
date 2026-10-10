// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CodebaseSourcePreview } from "./codebase-source-preview";

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

describe("CodebaseSourcePreview", () => {
	it("shows the file name and the full repository-relative path", () => {
		render({ path: "src/components/chat/Composer.tsx" });

		expect(
			container.querySelector("[data-testid='codebase-source-filename']")
				?.textContent,
		).toBe("Composer.tsx");
		expect(
			container.querySelector("[data-testid='codebase-source-path']")
				?.textContent,
		).toBe("src/components/chat/Composer.tsx");
	});

	it("renders a line number for every rendered line", () => {
		render({ content: "one\ntwo\nthree" });

		const gutter = container.querySelector(
			"[data-testid='codebase-source-linenumbers']",
		);
		expect(gutter?.textContent).toBe("1\n2\n3");
		expect(container.textContent).toContain("3 baris");
	});

	it("marks truncated content instead of presenting a partial file as whole", () => {
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

	it("copies the file content and the path with explicit accessible names", async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		Object.defineProperty(navigator, "clipboard", {
			configurable: true,
			value: { writeText },
		});
		render({ content: "const a = 1;" });

		const copyButton = container.querySelector<HTMLButtonElement>(
			"[data-testid='codebase-source-copy']",
		);
		expect(copyButton?.getAttribute("aria-label")).toBe("Salin isi app.ts");
		await act(async () => {
			copyButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		expect(writeText).toHaveBeenCalledWith("const a = 1;");
		expect(copyButton?.textContent).toContain("Tersalin");
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
		// The markup survives as readable text inside the code block.
		expect(
			container.querySelector("[data-testid='codebase-source-body']")
				?.textContent,
		).toContain("<script>");
	});

	it("labels the detected language and reports the stored size", () => {
		render({ path: "src/app.ts", sizeBytes: 2048 });
		expect(
			container.querySelector("[data-testid='codebase-source-preview']")
				?.textContent,
		).toContain("typescript");
		expect(container.textContent).toContain("2.0 KB");
	});

	it("falls back to a plain label when the file has no known language", () => {
		render({ path: "docs/notes.txt", sizeBytes: null });
		expect(container.textContent).toContain("teks");
	});
});
