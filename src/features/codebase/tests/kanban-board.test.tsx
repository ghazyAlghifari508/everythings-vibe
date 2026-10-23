// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computeKanbanProgress } from "@/lib/kanban-utils";
import { CodebaseKanbanBoard } from "../components/planning/codebase-kanban-board";
import { card, columns } from "./kanban-board.fixture";

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
		).toBe("1 dari 3 selesai");
	});
	it("updates a single progress summary from new data without mutating task input", () => {
		const before = structuredClone(columns);
		render();
		const updated = {
			...columns,
			pending: [],
			completed: [...columns.completed, ...columns.pending],
		};
		render({ columns: updated });
		const summaries = container.querySelectorAll(
			"[data-testid='codebase-kanban-progress']",
		);
		expect(summaries).toHaveLength(1);
		expect(summaries[0]?.textContent).toBe("2 dari 3 selesai");
		expect(
			container
				.querySelector("[role='progressbar']")
				?.getAttribute("aria-valuenow"),
		).toBe("67");
		expect(columns).toEqual(before);
	});
	it("matches the canonical progress calculation", () => {
		render();
		const expected = computeKanbanProgress(columns);
		expect(
			container.querySelector("[data-testid='codebase-kanban-progress']")
				?.textContent,
		).toBe(`${expected.done} dari ${expected.total} selesai`);
	});
});
describe("CodebaseKanbanBoard full board action", () => {
	it("offers the full board when the plan allows it", () => {
		render({ canOpenFullBoard: true });
		const link = container.querySelector<HTMLAnchorElement>(
			"[data-testid='codebase-kanban-full-board']",
		);
		expect(link).not.toBeNull();
		expect(link?.getAttribute("aria-label")).toBe("Buka Kanban Penuh");
		expect(link?.getAttribute("href")).toBe("/kanban/proj-1");
		expect(link?.getAttribute("target")).toBe("_blank");
		expect(link?.getAttribute("rel")).toBe("noopener noreferrer");
	});
	it("opens an existing-codebase project at its dedicated route in a new tab", () => {
		render({ codebaseId: "repo-1" });
		const link = container.querySelector<HTMLAnchorElement>(
			"[data-testid='codebase-kanban-full-board']",
		);
		expect(link?.getAttribute("href")).toBe("/codebases/kanban/repo-1/proj-1");
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
	it("disables both arrows when columns fit without overflow", () => {
		render();
		const viewport = container.querySelector<HTMLDivElement>(
			"[data-testid='codebase-kanban-columns']",
		);
		expect(viewport).not.toBeNull();
		if (!viewport) throw new Error("Missing viewport");
		Object.defineProperties(viewport, {
			scrollWidth: { value: 800, configurable: true },
			clientWidth: { value: 800, configurable: true },
			scrollLeft: { value: 0, configurable: true },
		});
		act(() => viewport.dispatchEvent(new Event("scroll")));
		for (const button of container.querySelectorAll<HTMLButtonElement>(
			"[data-testid^='codebase-kanban-scroll-']",
		)) {
			expect(button.disabled).toBe(true);
		}
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
			Object.defineProperties(columnsEl, {
				scrollWidth: { value: 800, configurable: true },
				clientWidth: { value: 300, configurable: true },
			});
			act(() => columnsEl.dispatchEvent(new Event("scroll")));
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
	it("keeps stale data visible and permits retry before clearing the warning on recovery", () => {
		const onRetryExternal = vi.fn();
		render({ staleness: "stale", onRetryExternal });
		expect(container.textContent).toContain(
			"Koneksi lambat. Menampilkan data terakhir.",
		);
		expect(container.querySelectorAll("article").length).toBeGreaterThan(0);
		const retry = [...container.querySelectorAll("button")].find(
			(button) => button.textContent === "Coba lagi",
		);
		act(() => retry?.click());
		expect(onRetryExternal).toHaveBeenCalledTimes(1);
		render({ staleness: "live" });
		expect(container.querySelector("output")).toBeNull();
		expect(container.textContent).not.toContain("KANBAN LIVE");
		expect(container.textContent).not.toContain("Live dari database");
	});
	it("reports a non-live connection instead of pretending to be live", () => {
		render({ staleness: "disconnected" });
		expect(container.textContent).toContain(
			"Koneksi terputus. Menampilkan data terakhir.",
		);
	});
});
