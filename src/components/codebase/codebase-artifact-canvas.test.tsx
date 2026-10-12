// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CodebaseArtifactCanvas } from "./codebase-artifact-canvas";

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
	props: Partial<Parameters<typeof CodebaseArtifactCanvas>[0]> = {},
) {
	act(() => {
		root?.render(
			<CodebaseArtifactCanvas
				fileName="PRD-watchlist.md"
				badge="MARKDOWN"
				copyValue={"# PRD\n\nIsi dokumen."}
				onClose={() => {}}
				{...props}
			>
				<p>konten</p>
			</CodebaseArtifactCanvas>,
		);
	});
}

function copyButton() {
	return container.querySelector<HTMLButtonElement>(
		"[data-testid='codebase-canvas-copy']",
	);
}

describe("CodebaseArtifactCanvas canonical copy", () => {
	it("copies the active artifact content, never the file name", async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		Object.defineProperty(navigator, "clipboard", {
			configurable: true,
			value: { writeText },
		});
		render({ copyValue: "# PRD\n\nIsi dokumen." });

		await act(async () => {
			copyButton()?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});

		expect(writeText).toHaveBeenCalledWith("# PRD\n\nIsi dokumen.");
		expect(writeText).not.toHaveBeenCalledWith("PRD-watchlist.md");
	});

	it("disables the copy action when there is no complete content", () => {
		render({ copyValue: null, copyUnavailableReason: "Pratinjau dipotong" });
		const button = copyButton();
		expect(button?.disabled).toBe(true);
		expect(button?.getAttribute("title")).toBe("Pratinjau dipotong");
	});

	it("surfaces a failure when clipboard access is denied", async () => {
		const writeText = vi.fn().mockRejectedValue(new Error("denied"));
		Object.defineProperty(navigator, "clipboard", {
			configurable: true,
			value: { writeText },
		});
		render();

		await act(async () => {
			copyButton()?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		expect(
			container.querySelector("[data-testid='codebase-canvas-copy-error']"),
		).not.toBeNull();
	});

	it("uses the caller's accessible label on the single copy button", () => {
		render({ copyLabel: "Salin isi sumber" });
		expect(copyButton()?.getAttribute("aria-label")).toBe("Salin isi sumber");
		expect(
			container.querySelectorAll("[data-testid='codebase-canvas-copy']"),
		).toHaveLength(1);
	});
});
