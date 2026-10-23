// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	type CodebaseArtifactRef,
	CodebaseFileCard,
} from "../components/explorer/codebase-file-card";

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

const sampleArtifact: CodebaseArtifactRef = {
	id: "prd-sample-1",
	title: "PRD · Pencarian Artikel",
	fileName: "PRD-pencarian-artikel.md",
	fileSizeBytes: null,
	badge: "MARKDOWN",
	description: "Dokumen siap",
};

function renderCard(
	artifact: CodebaseArtifactRef = sampleArtifact,
	props: {
		active?: boolean;
		onOpen?: (artifact: CodebaseArtifactRef) => void;
		onDownload?: (artifact: CodebaseArtifactRef) => void;
	} = {},
) {
	act(() => {
		root?.render(
			<CodebaseFileCard
				artifact={artifact}
				active={props.active}
				onOpen={props.onOpen}
				onDownload={props.onDownload}
			/>,
		);
	});
}

describe("CodebaseFileCard", () => {
	it("opens the artifact preview when clicked", () => {
		const onOpen = vi.fn();
		renderCard(sampleArtifact, { onOpen });

		const button = container.querySelector<HTMLButtonElement>(
			"[data-testid='codebase-file-card']",
		);
		expect(button).not.toBeNull();

		act(() => {
			button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});

		expect(onOpen).toHaveBeenCalledTimes(1);
		expect(onOpen).toHaveBeenCalledWith(sampleArtifact);
	});

	it("supports keyboard activation via Enter and Space", () => {
		const onOpen = vi.fn();
		renderCard(sampleArtifact, { onOpen });

		const button = container.querySelector<HTMLButtonElement>(
			"[data-testid='codebase-file-card']",
		);

		act(() => {
			button?.dispatchEvent(
				new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
			);
		});
		expect(onOpen).toHaveBeenCalledTimes(1);

		act(() => {
			button?.dispatchEvent(
				new KeyboardEvent("keydown", { key: " ", bubbles: true }),
			);
		});
		expect(onOpen).toHaveBeenCalledTimes(2);
	});

	it("does not render any download button in the file card", () => {
		const onDownload = vi.fn();
		renderCard(sampleArtifact, { onDownload });

		expect(
			container.querySelector("[data-testid='codebase-file-download']"),
		).toBeNull();
		const allButtons = container.querySelectorAll("button");
		for (const btn of allButtons) {
			expect(btn.textContent).not.toContain("Unduh");
		}
	});

	it("omits file size when fileSizeBytes is null and never displays placeholder text", () => {
		renderCard({
			...sampleArtifact,
			fileSizeBytes: null,
		});

		expect(
			container.querySelector("[data-testid='codebase-file-size']"),
		).toBeNull();
		expect(container.textContent).not.toContain("Ukuran menyusul");
	});

	it("displays real formatted file size when fileSizeBytes is present", () => {
		renderCard({
			...sampleArtifact,
			fileSizeBytes: 2048,
		});

		const sizeElement = container.querySelector(
			"[data-testid='codebase-file-size']",
		);
		expect(sizeElement).not.toBeNull();
		expect(sizeElement?.textContent).toBe("2.0 KB");
		expect(container.textContent).not.toContain("Ukuran menyusul");
	});

	it("protects layout with truncation and exposes the full filename via title tooltip", () => {
		const longFileName =
			"PRD-sistem-autentikasi-multi-tenant-dan-otorisasi-berbasis-peran-pengguna-v2-final.md";
		renderCard({
			...sampleArtifact,
			fileName: longFileName,
			title: "PRD · Multi-Tenant Auth",
		});

		const nameElement = container.querySelector(
			"[data-testid='codebase-file-name']",
		);
		expect(nameElement).not.toBeNull();
		expect(nameElement?.getAttribute("title")).toBe(longFileName);
		expect(nameElement?.className).toContain("truncate");
	});

	it("falls back to fileName when title is undefined", () => {
		renderCard({
			...sampleArtifact,
			title: undefined,
			fileName: "tasks-feature-1.json",
		});

		const nameElement = container.querySelector(
			"[data-testid='codebase-file-name']",
		);
		expect(nameElement?.textContent).toBe("tasks-feature-1.json");
	});
});
