// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CodebaseDetailPending, Route } from "@/routes/codebases/$id";
import { CodebaseWorkspaceSkeleton } from "./codebase-workspace-skeleton";

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
		const r = root;
		act(() => {
			r.unmount();
		});
		root = null;
	}
	container?.remove();
	document.body.innerHTML = "";
});

describe("CodebaseWorkspaceSkeleton", () => {
	it("wires Route pendingComponent to CodebaseDetailPending", () => {
		expect(Route.options.pendingComponent).toBe(CodebaseDetailPending);
	});

	it("renders a root marked with aria-busy and accessible status copy", () => {
		act(() => {
			root?.render(<CodebaseDetailPending />);
		});

		const skeleton = container.querySelector(
			'[data-testid="codebase-workspace-skeleton"]',
		);
		expect(skeleton).not.toBeNull();
		expect(skeleton?.getAttribute("aria-busy")).toBe("true");
		expect(skeleton?.getAttribute("aria-label")).toBe(
			"Memuat workspace codebase",
		);

		const srText = skeleton?.querySelector(".sr-only");
		expect(srText?.textContent).toBe("Memuat workspace codebase...");
	});

	it("mirrors the full-height workspace container geometry and top header", () => {
		act(() => {
			root?.render(<CodebaseWorkspaceSkeleton />);
		});

		const skeleton = container.querySelector(
			'[data-testid="codebase-workspace-skeleton"]',
		);
		// Root uses full dvh and overflow-hidden matching loaded workspace page
		expect(skeleton?.className).toContain("h-dvh");
		expect(skeleton?.className).toContain("overflow-hidden");
		expect(skeleton?.className).toContain("bg-onyx");

		// Top header uses h-12 matching loaded workspace header
		const header = container.querySelector(
			'[data-testid="codebase-workspace-skeleton-header"]',
		);
		expect(header).not.toBeNull();
		expect(header?.className).toContain("h-12");
		expect(header?.className).toContain("border-b");
	});

	it("mirrors the 280px left explorer pane and its responsive hiding on smaller screens", () => {
		act(() => {
			root?.render(<CodebaseWorkspaceSkeleton />);
		});

		const explorer = container.querySelector(
			'[data-testid="codebase-explorer-skeleton"]',
		);
		expect(explorer).not.toBeNull();

		// Responsive classes match CodebaseWorkspaceShell: hidden on small screens, flex and 280px on lg
		expect(explorer?.className).toContain("w-[280px]");
		expect(explorer?.className).toContain("hidden");
		expect(explorer?.className).toContain("lg:flex");

		// Contains summary card, search bar, tree rows, and stack footer
		const card = explorer?.querySelector(
			'[data-testid="codebase-explorer-skeleton-card"]',
		);
		expect(card).not.toBeNull();

		const search = explorer?.querySelector(
			'[data-testid="codebase-explorer-skeleton-search"]',
		);
		expect(search).not.toBeNull();

		const tree = explorer?.querySelector(
			'[data-testid="codebase-explorer-skeleton-tree"]',
		);
		expect(tree).not.toBeNull();
		// Contains realistic directory/file rows
		const rows = tree?.querySelectorAll(".h-9");
		expect(rows?.length).toBeGreaterThanOrEqual(5);

		const stack = explorer?.querySelector(
			'[data-testid="codebase-explorer-skeleton-stack"]',
		);
		expect(stack).not.toBeNull();
	});

	it("mirrors the main workspace chat pane with header, prompt bar, and starter actions", () => {
		act(() => {
			root?.render(<CodebaseWorkspaceSkeleton />);
		});

		const chatPane = container.querySelector(
			'[data-testid="codebase-chat-skeleton"]',
		);
		expect(chatPane).not.toBeNull();
		expect(chatPane?.className).toContain("flex-1");

		// Header placeholder
		const chatHeader = chatPane?.querySelector(
			'[data-testid="codebase-chat-skeleton-header"]',
		);
		expect(chatHeader).not.toBeNull();

		// Prompt bar placeholder
		const promptBar = chatPane?.querySelector(
			'[data-testid="codebase-prompt-skeleton"]',
		);
		expect(promptBar).not.toBeNull();
		expect(promptBar?.className).toContain("rounded-xl");
		expect(promptBar?.className).toContain("border-graphite");

		// Starter actions grid placeholder
		const starters = chatPane?.querySelector(
			'[data-testid="codebase-starters-skeleton"]',
		);
		expect(starters).not.toBeNull();
		const starterCards = starters?.querySelectorAll(".h-\\[62px\\]");
		expect(starterCards?.length).toBe(4);
	});

	it("does not render old generic centered cards, h-64 box, or canvas pane", () => {
		act(() => {
			root?.render(<CodebaseWorkspaceSkeleton />);
		});

		// Old generic styles must not be present
		expect(container.querySelector(".max-w-4xl")).toBeNull();
		expect(container.querySelector(".h-64")).toBeNull();
		expect(container.textContent).not.toContain("Memuat detail codebase...");

		// Canvas pane must not be rendered when canvas is closed
		expect(
			container.querySelector('[data-testid="codebase-canvas-pane"]'),
		).toBeNull();
	});
});
