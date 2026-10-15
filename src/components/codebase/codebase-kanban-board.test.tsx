// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computeKanbanProgress } from "@/lib/kanban-utils";
import { CodebaseKanbanBoard } from "./codebase-kanban-board";

declare global {
	var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
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

function card(overrides: Record<string, unknown> = {}) {
	return {
		id: "task-1",
		type: "task" as const,
		featureName: "Ekspor Ringkasan",
		name: "Tambah tombol ekspor di halaman rekomendasi",
		description: "",
		status: "pending" as const,
		dependencies: [],
		startedAt: null,
		completedAt: null,
		...overrides,
	};
}

const columns = {
	pending: [card()],
	in_progress: [
		card({
			id: "task-2",
			name: "Kirim ringkasan ke clipboard",
			status: "in_progress" as const,
			subtaskCount: 4,
			subtaskCompleted: 1,
		}),
	],
	completed: [card({ id: "task-3", status: "completed" as const })],
	failed: [],
};

function render(
	props: Partial<Parameters<typeof CodebaseKanbanBoard>[0]> = {},
) {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	act(() => {
		root?.render(
			<QueryClientProvider client={queryClient}>
				<CodebaseKanbanBoard
					projectId="proj-1"
					columns={columns}
					staleness="live"
					{...props}
				/>
			</QueryClientProvider>,
		);
	});
}

describe("CodebaseKanbanBoard panel layout", () => {
	it("scrolls columns horizontally instead of squeezing them", () => {
		render();
		const board = container.querySelector(
			"[data-testid='codebase-kanban-columns']",
		);
		expect(board?.className).toContain("overflow-x-auto");
		expect(board?.className).not.toContain("grid-cols-3");
	});

	it("keeps a readable fixed card width per column", () => {
		render();
		const columnsEl = container.querySelectorAll(
			"[data-testid^='codebase-kanban-col-']",
		);
		expect(columnsEl.length).toBe(3);
		for (const column of columnsEl) {
			expect(column.className).toContain("w-56");
		}
	});

	it("keeps the full task title visible instead of clamping it", () => {
		render();
		const titles = [...container.querySelectorAll("article p")].map(
			(node) => node.textContent,
		);
		expect(titles).toContain("Tambah tombol ekspor di halaman rekomendasi");
		const titleNode = [...container.querySelectorAll("article p")].find(
			(node) =>
				node.textContent === "Tambah tombol ekspor di halaman rekomendasi",
		);
		expect(titleNode?.className).not.toContain("line-clamp");
	});

	it("keeps status, feature grouping, and subtask progress", () => {
		render();
		expect(container.textContent).toContain("Ekspor Ringkasan");
		expect(container.textContent).toContain("1/4 subtask");
		expect(container.textContent).toContain("Agent coding...");
		expect(
			container.querySelector("[data-testid='codebase-kanban-progress']")
				?.textContent,
		).toBe("1/3 selesai (33%)");
	});

	it("matches the canonical progress calculation", () => {
		render();
		const expected = computeKanbanProgress(columns);
		expect(
			container.querySelector("[data-testid='codebase-kanban-progress']")
				?.textContent,
		).toBe(`${expected.done}/${expected.total} selesai (${expected.pct}%)`);
	});
});

describe("CodebaseKanbanBoard full board action", () => {
	it("offers the full board when the plan allows it", () => {
		render({ canOpenFullBoard: true });
		const link = container.querySelector<HTMLAnchorElement>(
			"[data-testid='codebase-kanban-full-board']",
		);
		expect(link).not.toBeNull();
		expect(link?.textContent).toContain("Buka Kanban Penuh");
		expect(link?.getAttribute("href")).toBe("/kanban/proj-1");
		expect(link?.getAttribute("target")).toBe("_blank");
		expect(link?.getAttribute("rel")).toBe("noopener noreferrer");
	});

	it("opens an existing-codebase project at its dedicated route in a new tab", () => {
		render({ codebaseId: "repo-1" });
		const link = container.querySelector<HTMLAnchorElement>(
			"[data-testid='codebase-kanban-full-board']",
		);

		expect(link?.getAttribute("href")).toBe("/codebases/repo-1/kanban/proj-1");
		expect(link?.getAttribute("target")).toBe("_blank");
		expect(link?.getAttribute("rel")).toBe("noopener noreferrer");
	});

	it("hides the full board link when the route would redirect for the plan", () => {
		render({ canOpenFullBoard: false });
		expect(
			container.querySelector("[data-testid='codebase-kanban-full-board']"),
		).toBeNull();
	});
});

describe("CodebaseKanbanBoard accessible horizontal navigation", () => {
	it("renders accessible horizontal scroll buttons when tasks exist", () => {
		render();
		const leftBtn = container.querySelector<HTMLButtonElement>(
			"[data-testid='codebase-kanban-scroll-left']",
		);
		const rightBtn = container.querySelector<HTMLButtonElement>(
			"[data-testid='codebase-kanban-scroll-right']",
		);
		expect(leftBtn).not.toBeNull();
		expect(rightBtn).not.toBeNull();
		expect(leftBtn?.getAttribute("aria-label")).toBe("Gulir kolom ke kiri");
		expect(rightBtn?.getAttribute("aria-label")).toBe("Gulir kolom ke kanan");
		// At initial position (scrollLeft=0), left scroll is disabled
		expect(leftBtn?.disabled).toBe(true);
	});

	it("triggers horizontal scroll when scroll buttons are clicked", () => {
		render();
		const columnsEl = container.querySelector<HTMLDivElement>(
			"[data-testid='codebase-kanban-columns']",
		);
		expect(columnsEl).not.toBeNull();

		const scrollBySpy = vi.fn();
		if (columnsEl) {
			columnsEl.scrollBy = scrollBySpy;
		}

		const rightBtn = container.querySelector<HTMLButtonElement>(
			"[data-testid='codebase-kanban-scroll-right']",
		);
		act(() => {
			rightBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		expect(scrollBySpy).toHaveBeenCalledWith({ left: 236, behavior: "smooth" });
	});

	it("navigates horizontally with keyboard arrow keys on toolbar", () => {
		render();
		const toolbar = container.querySelector<HTMLDivElement>(
			'[role="toolbar"][aria-label="Navigasi horizontal Kanban"]',
		);
		expect(toolbar).not.toBeNull();

		const columnsEl = container.querySelector<HTMLDivElement>(
			"[data-testid='codebase-kanban-columns']",
		);
		const scrollBySpy = vi.fn();
		if (columnsEl) {
			columnsEl.scrollBy = scrollBySpy;
		}

		act(() => {
			toolbar?.dispatchEvent(
				new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
			);
		});
		expect(scrollBySpy).toHaveBeenCalledWith({ left: 236, behavior: "smooth" });

		act(() => {
			toolbar?.dispatchEvent(
				new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }),
			);
		});
		expect(scrollBySpy).toHaveBeenCalledWith({
			left: -236,
			behavior: "smooth",
		});
	});

	it("updates button disabled state when scrolled", () => {
		render();
		const columnsEl = container.querySelector<HTMLDivElement>(
			"[data-testid='codebase-kanban-columns']",
		);
		const leftBtn = container.querySelector<HTMLButtonElement>(
			"[data-testid='codebase-kanban-scroll-left']",
		);
		const rightBtn = container.querySelector<HTMLButtonElement>(
			"[data-testid='codebase-kanban-scroll-right']",
		);

		if (columnsEl) {
			// Mock dimensions for overflow
			Object.defineProperty(columnsEl, "scrollWidth", {
				value: 800,
				configurable: true,
			});
			Object.defineProperty(columnsEl, "clientWidth", {
				value: 300,
				configurable: true,
			});
			Object.defineProperty(columnsEl, "scrollLeft", {
				value: 100,
				configurable: true,
			});

			act(() => {
				columnsEl.dispatchEvent(new Event("scroll"));
			});

			expect(leftBtn?.disabled).toBe(false);
			expect(rightBtn?.disabled).toBe(false);

			// Now scroll to the end
			Object.defineProperty(columnsEl, "scrollLeft", {
				value: 500,
				configurable: true,
			});
			act(() => {
				columnsEl.dispatchEvent(new Event("scroll"));
			});

			expect(leftBtn?.disabled).toBe(false);
			expect(rightBtn?.disabled).toBe(true);
		}
	});

	it("hides navigation controls when the board has no tasks", () => {
		render({
			columns: {
				pending: [],
				in_progress: [],
				completed: [],
				failed: [],
			},
		});
		expect(
			container.querySelector("[data-testid='codebase-kanban-scroll-left']"),
		).toBeNull();
		expect(
			container.querySelector("[data-testid='codebase-kanban-scroll-right']"),
		).toBeNull();
	});
});

describe("CodebaseKanbanBoard states", () => {
	it("renders one clear empty state when the board has no task", () => {
		render({
			columns: {
				pending: [],
				in_progress: [],
				completed: [],
				failed: [],
			},
		});
		const empty = container.querySelector(
			"[data-testid='codebase-kanban-empty']",
		);
		expect(empty).not.toBeNull();
		expect(empty?.textContent).toContain("Belum ada task di papan ini");
		// No per-column repeated "Kosong" placeholders in the empty state.
		expect(
			container.querySelectorAll("[data-testid^='codebase-kanban-col-']"),
		).toHaveLength(0);
	});

	it("shows the failed column and a note only when tasks failed", () => {
		render();
		expect(
			container.querySelector("[data-testid='codebase-kanban-failed-note']"),
		).toBeNull();
		expect(
			container.querySelector("[data-testid='codebase-kanban-col-Gagal']"),
		).toBeNull();

		render({
			columns: {
				...columns,
				failed: [card({ id: "task-4", status: "failed" as const })],
			},
		});
		expect(
			container.querySelector("[data-testid='codebase-kanban-col-Gagal']"),
		).not.toBeNull();
		expect(
			container.querySelector("[data-testid='codebase-kanban-failed-note']")
				?.textContent,
		).toContain("1 task gagal");
	});

	it("asks for a project before rendering a board", () => {
		render({ projectId: null, columns: undefined });
		expect(
			container.querySelector("[data-testid='codebase-kanban-empty-project']"),
		).not.toBeNull();
	});

	it("surfaces a load failure with retry", () => {
		const onRetryExternal = vi.fn();
		render({ columns: undefined, isErrorExternal: true, onRetryExternal });
		const error = container.querySelector(
			"[data-testid='codebase-kanban-error']",
		);
		expect(error).not.toBeNull();
		const retry = [...(error?.querySelectorAll("button") ?? [])].find((b) =>
			/Coba lagi/.test(b.textContent ?? ""),
		);
		act(() => {
			retry?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		expect(onRetryExternal).toHaveBeenCalledTimes(1);
	});

	it("reports a non-live connection instead of pretending to be live", () => {
		render({ staleness: "disconnected" });
		expect(container.textContent).toContain(
			"Koneksi terputus. Menampilkan data terakhir.",
		);
	});
});
