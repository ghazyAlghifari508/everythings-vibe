// @vitest-environment jsdom
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
} from "@testing-library/react";
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
	title: "Tasks · Pencarian Artikel",
	fileName: "tasks-pencarian-artikel.md",
	fileSizeBytes: 2048,
	badge: "MARKDOWN",
	description: "Dokumen siap",
};

const repositoryFiles = [
	{ path: "src/server/search.ts" },
	{ path: "src/components/search-bar.tsx" },
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
			messages={[{ id: "m1", role: "user", content: "Halo" }]}
			questions={[]}
			answers={{}}
			artifacts={[featureArtifact, prdArtifact, acArtifact, tasksArtifact]}
			repositoryFiles={repositoryFiles}
			{...overrides}
		/>,
	);
}

describe("FIX 07 — floating @ document selector positioning & interaction", () => {
	it("portals the selector out of the composer and anchors to the actual @ trigger without altering composer layout", () => {
		renderWorkspace();
		const form = screen.getByTestId("prompt-bar");
		const shell = form.parentElement as HTMLElement;
		const childrenBefore = form.childElementCount;
		const shellChildrenBefore = shell.childElementCount;

		const trigger = screen.getByTestId("composer-mention-trigger");
		expect(trigger.getAttribute("data-composer-mention-anchor")).toBe("true");

		fireEvent.click(trigger);

		const popover = screen.getByTestId("composer-mention-popover");

		// Floating layer: portaled to the body, positioned by the popper wrapper,
		// never an in-flow descendant of the composer shell.
		expect(document.body.contains(popover)).toBe(true);
		expect(popover.closest("[data-radix-popper-content-wrapper]")).not.toBe(
			null,
		);
		expect(shell.contains(popover)).toBe(false);

		// Shell invariant: opening the selector adds no in-flow child to the composer
		// and does not mutate composer structure or layout.
		expect(form.childElementCount).toBe(childrenBefore);
		expect(shell.childElementCount).toBe(shellChildrenBefore);

		expect(popover.getAttribute("role")).toBe("dialog");
		expect(popover.getAttribute("aria-label")).toBe("Pilih dokumen");
	});

	it("uses a compact natural width and does not dictate width from the composer", () => {
		expect(MENTION_POPOVER_PLACEMENT.side).toBe("top");
		expect(MENTION_POPOVER_PLACEMENT.align).toBe("start");
		expect(MENTION_POPOVER_PLACEMENT.sideOffset).toBeGreaterThan(0);
		expect(MENTION_POPOVER_PLACEMENT.sideOffset).toBeLessThanOrEqual(12);
		expect(MENTION_POPOVER_PLACEMENT.collisionPadding).toBeGreaterThan(0);

		renderWorkspace();
		fireEvent.click(screen.getByTestId("composer-mention-trigger"));

		const popover = screen.getByTestId("composer-mention-popover");
		// Compact floating popover: w-72 max-w-[calc(100vw_-_2rem)], NOT full composer width.
		expect(popover.className).not.toContain(
			"w-[var(--radix-popover-trigger-width)]",
		);
		expect(popover.className).toContain("w-72");
		expect(popover.className).toContain("max-w-[calc(100vw_-_2rem)]");

		const list = screen.getByRole("listbox", { name: "Dokumen planning" });
		expect(list.className).toContain("overflow-y-auto");
		expect(list.className).toContain("max-h-[min(18rem");
	});

	it("displays real documents with titles and subtitles, and supports search filtering", () => {
		renderWorkspace();
		fireEvent.click(screen.getByTestId("composer-mention-trigger"));

		expect(screen.getByTestId("composer-mention-doc-feature")).toBeTruthy();
		expect(screen.getByTestId("composer-mention-doc-prd")).toBeTruthy();
		expect(screen.getByTestId("composer-mention-doc-ac")).toBeTruthy();
		expect(screen.getByTestId("composer-mention-doc-tasks")).toBeTruthy();

		// Subtitles matching real planning document kinds
		expect(screen.getByText("Dokumen kebutuhan fitur")).toBeTruthy();
		expect(screen.getByText("Kriteria penerimaan fitur")).toBeTruthy();
		expect(screen.getByText("Daftar pekerjaan")).toBeTruthy();

		// Search filtering
		const search = screen.getByTestId("composer-mention-search");
		fireEvent.change(search, { target: { value: "kriteria" } });

		expect(screen.getByTestId("composer-mention-doc-ac")).toBeTruthy();
		expect(screen.queryByTestId("composer-mention-doc-prd")).toBeNull();
		expect(screen.queryByTestId("composer-mention-doc-tasks")).toBeNull();

		// Empty search result
		fireEvent.change(search, { target: { value: "tidak-ada" } });
		expect(screen.getByText("Tidak ada dokumen yang cocok.")).toBeTruthy();
	});

	it("shows a concise and relevant empty state when no planning documents exist", () => {
		renderWorkspace({ artifacts: [] });
		fireEvent.click(screen.getByTestId("composer-mention-trigger"));

		expect(screen.getByTestId("composer-mention-popover")).toBeTruthy();
		expect(screen.getByText("Belum ada dokumen planning")).toBeTruthy();
		expect(
			screen.getByText(
				"Dokumen akan tersedia setelah PRD, AC, atau Tasks dibuat.",
			),
		).toBeTruthy();
		expect(screen.queryAllByRole("option")).toHaveLength(0);
	});

	it("handles Escape, outside click, and trigger button toggle predictably", async () => {
		renderWorkspace();
		const trigger = screen.getByTestId("composer-mention-trigger");

		// Open via trigger
		fireEvent.click(trigger);
		expect(screen.getByTestId("composer-mention-popover")).toBeTruthy();

		// Escape closes
		fireEvent.keyDown(screen.getByTestId("composer-mention-search"), {
			key: "Escape",
			code: "Escape",
		});
		expect(screen.queryByTestId("composer-mention-popover")).toBeNull();

		// Reopen via trigger
		fireEvent.click(trigger);
		expect(screen.getByTestId("composer-mention-popover")).toBeTruthy();

		// Clicking trigger while open closes cleanly without immediate reopen
		fireEvent.pointerDown(trigger, { button: 0 });
		fireEvent.click(trigger);
		expect(screen.queryByTestId("composer-mention-popover")).toBeNull();

		// Reopen and outside click closes
		fireEvent.click(trigger);
		expect(screen.getByTestId("composer-mention-popover")).toBeTruthy();
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 0));
		});
		fireEvent.pointerDown(document.body, { button: 0 });
		fireEvent.click(document.body);
		expect(screen.queryByTestId("composer-mention-popover")).toBeNull();
	});

	it("preserves Plan/Revise dropdown mode menu without regression", () => {
		renderWorkspace();
		const modeTrigger = screen.getByTestId("composer-mode-trigger");
		expect(modeTrigger.textContent).toContain("Plan");

		fireEvent.click(modeTrigger);
		expect(screen.getByTestId("composer-mode-option-plan")).toBeTruthy();
		expect(screen.getByTestId("composer-mode-option-revise")).toBeTruthy();

		fireEvent.click(screen.getByTestId("composer-mode-option-revise"));
		expect(modeTrigger.textContent).toContain("Revise");

		// @ trigger still functions independently
		fireEvent.click(screen.getByTestId("composer-mention-trigger"));
		expect(screen.getByTestId("composer-mention-popover")).toBeTruthy();
	});
});
