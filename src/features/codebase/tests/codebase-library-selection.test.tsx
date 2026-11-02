// @vitest-environment jsdom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CodebaseLibraryView } from "@/features/codebase/components/planning/codebase-library-view";
import type { CodebaseLibraryItem } from "@/features/codebase/services/library";
import {
	readPlanCodebasePointer,
	storePlanCodebasePointer,
} from "@/features/codebase/services/plan-storage";

vi.mock("@tanstack/react-router", () => ({
	useRouter: () => ({ invalidate: vi.fn() }),
	Link: (props: {
		children: React.ReactNode;
		to: string;
		className?: string;
		onClick?: () => void;
	}) => (
		<a href={props.to} className={props.className} onClick={props.onClick}>
			{props.children}
		</a>
	),
}));

function installRadixDomPolyfills() {
	vi.stubGlobal(
		"ResizeObserver",
		class {
			observe() {}
			unobserve() {}
			disconnect() {}
		},
	);
	vi.stubGlobal(
		"DOMRect",
		class {
			x = 0;
			y = 0;
			width = 0;
			height = 0;
			top = 0;
			left = 0;
			right = 0;
			bottom = 0;
		},
	);
	if (!Element.prototype.hasPointerCapture) {
		Element.prototype.hasPointerCapture = () => false;
		Element.prototype.setPointerCapture = () => {};
		Element.prototype.releasePointerCapture = () => {};
	}
	if (!Element.prototype.scrollIntoView) {
		Element.prototype.scrollIntoView = () => {};
	}
}

function makeItem(
	id: string,
	name: string,
	overrides: Partial<CodebaseLibraryItem> = {},
): CodebaseLibraryItem {
	return {
		id,
		name,
		updatedAt: "2026-10-14T00:00:00.000Z",
		fileCount: 42,
		snapshotCreatedAt: "2026-10-14T00:00:00.000Z",
		snapshotStatus: "uploaded",
		summary: null,
		framework: "React",
		language: "TypeScript",
		packageManager: "pnpm",
		hasReadyAnalysis: true,
		hasUsableSnapshot: true,
		analysisAttemptStatus: "ready",
		onboardingProjectId: null,
		readiness: "planning_ready",
		planCount: 0,
		...overrides,
	};
}

let bulkDeleteCalls: string[][] = [];

function mockApi(
	customHandler?: (ids: string[]) => {
		deleted: number;
		skipped: number;
		deletedIds: string[];
	},
) {
	bulkDeleteCalls = [];
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: unknown, init?: RequestInit) => {
			const url = String(input);
			const method = init?.method ?? "GET";
			if (url.includes("/api/codebases") && method === "DELETE") {
				if (init?.body) {
					const parsed = JSON.parse(String(init.body));
					if (parsed.ids) {
						bulkDeleteCalls.push(parsed.ids);
						if (customHandler) {
							return {
								ok: true,
								status: 200,
								json: async () => ({
									success: true,
									...customHandler(parsed.ids),
								}),
							};
						}
						return {
							ok: true,
							status: 200,
							json: async () => ({
								success: true,
								deleted: parsed.ids.length,
								skipped: 0,
								deletedIds: parsed.ids,
							}),
						};
					}
				}
				return {
					ok: true,
					status: 200,
					json: async () => ({ success: true, deleted: true }),
				};
			}
			throw new Error(`Unexpected fetch ${method} ${url}`);
		}),
	);
}

beforeEach(() => {
	installRadixDomPolyfills();
	mockApi();
	sessionStorage.clear();
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	sessionStorage.clear();
});

describe("CodebaseLibraryView selection and bulk delete", () => {
	it("renders checkbox per row and updates count on individual selection", () => {
		const items = [
			makeItem("cb-1", "Ghazy Portofolio"),
			makeItem("cb-2", "Ocean Guard"),
		];
		render(<CodebaseLibraryView items={items} />);

		const cb1 = screen.getByRole("checkbox", {
			name: /Pilih repository Ghazy Portofolio/i,
		});
		expect((cb1 as HTMLInputElement).checked).toBe(false);
		expect(screen.queryByText(/repository dipilih/i)).toBeNull();

		fireEvent.click(cb1);
		expect((cb1 as HTMLInputElement).checked).toBe(true);
		expect(screen.getByText("1 repository dipilih")).toBeDefined();
		expect(
			screen.getByRole("button", { name: "Batalkan Pilihan" }),
		).toBeDefined();
		expect(
			screen.getByRole("button", { name: "Hapus Terpilih" }),
		).toBeDefined();
	});

	it("clicking row checkbox does not navigate to repository", () => {
		const items = [makeItem("cb-1", "Ghazy Portofolio")];
		render(<CodebaseLibraryView items={items} />);

		const checkbox = screen.getByRole("checkbox", {
			name: /Pilih repository Ghazy Portofolio/i,
		});
		fireEvent.click(checkbox);

		expect(readPlanCodebasePointer()).toBeNull();
		expect((checkbox as HTMLInputElement).checked).toBe(true);
	});

	it("selects multiple items and updates count accordingly", () => {
		const items = [
			makeItem("cb-1", "Repo 1"),
			makeItem("cb-2", "Repo 2"),
			makeItem("cb-3", "Repo 3"),
		];
		render(<CodebaseLibraryView items={items} />);

		fireEvent.click(
			screen.getByRole("checkbox", { name: /Pilih repository Repo 1/i }),
		);
		expect(screen.getByText("1 repository dipilih")).toBeDefined();

		fireEvent.click(
			screen.getByRole("checkbox", { name: /Pilih repository Repo 2/i }),
		);
		expect(screen.getByText("2 repository dipilih")).toBeDefined();

		fireEvent.click(
			screen.getByRole("checkbox", { name: /Pilih repository Repo 1/i }),
		);
		expect(screen.getByText("1 repository dipilih")).toBeDefined();
	});

	it("selects all visible items on current page and displays indeterminate checkbox when partially selected", () => {
		const items = [makeItem("cb-1", "Repo 1"), makeItem("cb-2", "Repo 2")];
		render(<CodebaseLibraryView items={items} />);

		// Select one item
		fireEvent.click(
			screen.getByRole("checkbox", { name: /Pilih repository Repo 1/i }),
		);

		// The page select-all checkbox should be indeterminate
		const pageCheckbox = screen.getByRole("checkbox", {
			name: /Pilih semua di halaman ini/i,
		}) as HTMLInputElement;
		expect(pageCheckbox.indeterminate).toBe(true);
		expect(pageCheckbox.checked).toBe(false);

		// Click select all on page
		fireEvent.click(pageCheckbox);
		expect(screen.getByText("2 repository dipilih")).toBeDefined();
		expect(pageCheckbox.indeterminate).toBe(false);
		expect(pageCheckbox.checked).toBe(true);
	});

	it("supports selecting across pages without losing prior selections", () => {
		const items = Array.from({ length: 15 }, (_, i) =>
			makeItem(`cb-${i + 1}`, `Project ${i + 1}`),
		);
		render(<CodebaseLibraryView items={items} />);

		// Select row on page 1
		fireEvent.click(
			screen.getByRole("checkbox", { name: /^Pilih repository Project 1$/i }),
		);
		expect(screen.getByText("1 repository dipilih")).toBeDefined();

		// Go to page 2
		fireEvent.click(screen.getByRole("button", { name: /Selanjutnya/i }));
		expect(screen.getByText("Halaman 2 dari 2")).toBeDefined();

		// Selection is preserved
		expect(screen.getByText("1 repository dipilih")).toBeDefined();

		// Select row on page 2
		fireEvent.click(
			screen.getByRole("checkbox", { name: /Pilih repository Project 11/i }),
		);
		expect(screen.getByText("2 repository dipilih")).toBeDefined();
	});

	it("resets filtered scope explicitly when the filter changes", () => {
		const items = Array.from({ length: 15 }, (_, i) =>
			makeItem(`cb-${i + 1}`, `Project ${i + 1}`),
		);
		render(<CodebaseLibraryView items={items} />);

		// Select all on page
		fireEvent.click(
			screen.getByRole("checkbox", { name: /Pilih semua di halaman ini/i }),
		);

		// Extend to all filtered results
		const selectAllFilteredBtn = screen.getByRole("button", {
			name: /Pilih semua 15 repository sesuai filter/i,
		});
		fireEvent.click(selectAllFilteredBtn);
		expect(screen.getByText("15 repository dipilih")).toBeDefined();

		// Change search query
		fireEvent.change(screen.getByPlaceholderText(/Cari project/i), {
			target: { value: "Project 1" },
		});

		// Scope resets and notice appears
		expect(
			screen.getByText(/Filter berubah, pilihan dibersihkan/i),
		).toBeDefined();
	});

	it("clears selection when Batalkan Pilihan is clicked", () => {
		const items = [makeItem("cb-1", "Repo 1"), makeItem("cb-2", "Repo 2")];
		render(<CodebaseLibraryView items={items} />);

		fireEvent.click(
			screen.getByRole("checkbox", { name: /Pilih repository Repo 1/i }),
		);
		expect(screen.getByText("1 repository dipilih")).toBeDefined();

		fireEvent.click(screen.getByRole("button", { name: "Batalkan Pilihan" }));
		expect(screen.queryByText(/repository dipilih/i)).toBeNull();
		const box = screen.getByRole("checkbox", {
			name: /Pilih repository Repo 1/i,
		}) as HTMLInputElement;
		expect(box.checked).toBe(false);
	});

	it("confirms and executes bulk delete of selected items", async () => {
		storePlanCodebasePointer("cb-1", "Repo 1");
		const items = [makeItem("cb-1", "Repo 1"), makeItem("cb-2", "Repo 2")];
		render(<CodebaseLibraryView items={items} />);

		fireEvent.click(
			screen.getByRole("checkbox", { name: /Pilih repository Repo 1/i }),
		);
		fireEvent.click(screen.getByRole("button", { name: "Hapus Terpilih" }));

		// Confirmation dialog appears
		const dialog = screen.getByRole("dialog");
		expect(within(dialog).getByText("Hapus 1 repository?")).toBeDefined();
		expect(
			within(dialog).getByText(
				"Repository dan planning terkait akan dihapus. Tindakan ini tidak dapat dibatalkan.",
			),
		).toBeDefined();

		// Confirm delete
		fireEvent.click(within(dialog).getByRole("button", { name: "Hapus 1" }));

		await waitFor(() => {
			expect(bulkDeleteCalls).toEqual([["cb-1"]]);
		});
		await waitFor(() => {
			expect(screen.queryByText("Repo 1")).toBeNull();
		});
		expect(screen.getByText("Repo 2")).toBeDefined();
		expect(readPlanCodebasePointer()).toBeNull();
	});

	it("confirms and executes delete all repositories", async () => {
		const items = [makeItem("cb-1", "Repo 1"), makeItem("cb-2", "Repo 2")];
		render(<CodebaseLibraryView items={items} />);

		fireEvent.click(screen.getByRole("button", { name: "Hapus semua" }));

		// Confirmation dialog appears
		const dialog = screen.getByRole("dialog");
		expect(within(dialog).getByText("Hapus seluruh History?")).toBeDefined();
		expect(
			within(dialog).getByText(
				"2 repository beserta planning terkait akan dihapus permanen.",
			),
		).toBeDefined();

		// Confirm delete
		fireEvent.click(
			within(dialog).getByRole("button", { name: "Hapus Semua" }),
		);

		await waitFor(() => {
			expect(bulkDeleteCalls).toEqual([["cb-1", "cb-2"]]);
		});
		await waitFor(() => {
			expect(screen.getByText("Belum ada repository terhubung")).toBeDefined();
		});
	});

	it("handles partial success honestly when some repositories were already removed", async () => {
		mockApi((ids) => ({
			deleted: 1,
			skipped: 1,
			deletedIds: [ids[0]],
		}));
		const items = [makeItem("cb-1", "Repo 1"), makeItem("cb-2", "Repo 2")];
		render(<CodebaseLibraryView items={items} />);

		fireEvent.click(
			screen.getByRole("checkbox", { name: /Pilih repository Repo 1/i }),
		);
		fireEvent.click(
			screen.getByRole("checkbox", { name: /Pilih repository Repo 2/i }),
		);
		fireEvent.click(screen.getByRole("button", { name: "Hapus Terpilih" }));

		const dialog = screen.getByRole("dialog");
		fireEvent.click(within(dialog).getByRole("button", { name: "Hapus 2" }));

		await waitFor(() => {
			expect(screen.getByText("1 repository dipilih")).toBeDefined();
		});
	});
});
