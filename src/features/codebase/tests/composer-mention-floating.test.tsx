// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { CodebaseChatWorkspace } from "../components/chat/codebase-chat-workspace";
import { MENTION_POPOVER_PLACEMENT } from "../components/chat/codebase-composer-mention-popover";

beforeAll(() => {
	// Radix Popper measures the anchor element; jsdom ships no ResizeObserver.
	globalThis.ResizeObserver ??= class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
});

afterEach(cleanup);

const featureArtifact = {
	id: "feature-proj-1",
	title: "Spesifikasi Fitur · Pencarian Artikel",
	fileName: "feature-pencarian-artikel.json",
	fileSizeBytes: 1024,
	badge: "FITUR",
	description: "Dokumen siap",
};

const prdArtifact = {
	id: "prd-proj-1",
	title: "PRD · Pencarian Artikel",
	fileName: "PRD-pencarian-artikel.md",
	fileSizeBytes: 2048,
	badge: "MARKDOWN",
	description: "Dokumen siap",
};

const acArtifact = {
	id: "ac-proj-1",
	title: "Acceptance Criteria · Pencarian Artikel",
	fileName: "AC-pencarian-artikel.md",
	fileSizeBytes: 1536,
	badge: "MARKDOWN",
	description: "Dokumen siap",
};

const tasksArtifact = {
	id: "tasks-proj-1",
	title: "Task · Pencarian Artikel",
	fileName: "tasks-pencarian-artikel.json",
	fileSizeBytes: 512,
	badge: "TASK",
	description: "Dokumen siap",
};

const repositoryFiles = [
	{ path: "src/pages/Content.jsx" },
	{ path: "package.json" },
];

function renderWorkspace(
	overrides: Partial<Parameters<typeof CodebaseChatWorkspace>[0]> = {},
) {
	return render(
		<CodebaseChatWorkspace
			featureName="Pencarian Artikel"
			projectId="proj-1"
			codebaseId="repo-1"
			currentSnapshotId="snap-1"
			composerMode="revise"
			messages={[{ id: "m1", role: "user", content: "Halo" }]}
			questions={[]}
			answers={{}}
			artifacts={[featureArtifact, prdArtifact, acArtifact, tasksArtifact]}
			repositoryFiles={repositoryFiles}
			{...overrides}
		/>,
	);
}

describe("FIX 06 — floating @ selector", () => {
	it("portals the selector out of the composer and keeps the composer layout intact", () => {
		renderWorkspace();
		const form = screen.getByTestId("prompt-bar");
		const shell = form.parentElement as HTMLElement;
		const childrenBefore = form.childElementCount;
		const shellChildrenBefore = shell.childElementCount;

		fireEvent.click(screen.getByTestId("composer-mention-trigger"));

		const popover = screen.getByTestId("composer-mention-popover");
		const anchor = screen.getByTestId("composer-mention-anchor");

		// Floating layer: portaled to the body, positioned by the popper wrapper,
		// never a descendant of the composer shell.
		expect(document.body.contains(popover)).toBe(true);
		expect(popover.closest("[data-radix-popper-content-wrapper]")).not.toBe(
			null,
		);
		expect(shell.contains(popover)).toBe(false);

		// Shell invariant: the positioning anchor is an out-of-flow zero-height
		// sibling, so opening the selector adds no in-flow child to the composer.
		expect(form.childElementCount).toBe(childrenBefore);
		expect(shell.childElementCount).toBe(shellChildrenBefore);
		expect(shell.contains(anchor)).toBe(true);
		expect(anchor.className).toContain("absolute");
		expect(anchor.className).toContain("h-0");

		expect(popover.getAttribute("role")).toBe("dialog");
		expect(popover.getAttribute("aria-label")).toBe("Pilih dokumen");
	});

	it("declares an upward placement with a slight overlap and collision padding", () => {
		expect(MENTION_POPOVER_PLACEMENT.side).toBe("top");
		expect(MENTION_POPOVER_PLACEMENT.align).toBe("start");
		expect(MENTION_POPOVER_PLACEMENT.sideOffset).toBeLessThan(0);
		expect(Math.abs(MENTION_POPOVER_PLACEMENT.sideOffset)).toBeLessThanOrEqual(
			12,
		);
		expect(MENTION_POPOVER_PLACEMENT.collisionPadding).toBeGreaterThan(0);

		renderWorkspace();
		fireEvent.click(screen.getByTestId("composer-mention-trigger"));

		// Width comes from the anchor, height is capped by the available viewport
		// space, and the list scrolls independently of the composer.
		const popover = screen.getByTestId("composer-mention-popover");
		expect(popover.className).toContain(
			"w-[var(--radix-popover-trigger-width)]",
		);
		const list = screen.getByRole("listbox", { name: "Dokumen planning" });
		expect(list.className).toContain("overflow-y-auto");
		expect(list.className).toContain("max-h-[min(18rem");
	});
});
