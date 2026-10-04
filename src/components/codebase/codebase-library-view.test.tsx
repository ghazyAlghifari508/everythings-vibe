// @vitest-environment jsdom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CodebaseLibraryItem } from "@/lib/codebase-library";
import {
	readPlanCodebasePointer,
	readPlanCodebaseProjectPointer,
	storePlanCodebasePointer,
	storePlanCodebaseProjectPointer,
} from "@/lib/codebase-plan-storage";
import { CODEBASE_LIBRARY_PAGE_SIZE } from "@/lib/constants";
import { useUIStore } from "@/store";
import { CodebaseLibraryView } from "./codebase-library-view";

vi.mock("@tanstack/react-router", () => ({
	useRouter: () => ({ invalidate: vi.fn() }),
	Link: ({
		children,
		to,
		params,
		className,
	}: {
		children: React.ReactNode;
		to: string;
		params?: { id: string };
		className?: string;
	}) => {
		const href = params?.id ? `${to.replace("$id", params.id)}` : to;
		return (
			<a href={href} className={className}>
				{children}
			</a>
		);
	},
}));

function mockCodebaseApi() {
	const calls: Array<{ url: string; method: string; body: unknown }> = [];
	const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
		const url = String(input);
		const method = init?.method ?? "GET";
		const body: unknown = init?.body
			? JSON.parse(String(init.body))
			: undefined;
		calls.push({ url, method, body });
		if (method === "PATCH" && url.includes("/api/codebases/cb-1")) {
			return {
				ok: true,
				status: 200,
				json: async () => ({ success: true, id: "cb-1", name: "Movie App" }),
			};
		}
		if (method === "DELETE" && url.includes("/api/codebases/cb-1")) {
			return {
				ok: true,
				status: 200,
				json: async () => ({ success: true, deleted: true }),
			};
		}
		throw new Error(`unexpected fetch ${method} ${url}`);
	});
	vi.stubGlobal("fetch", fetchMock);
	return calls;
}

function makeItem(
	overrides: Partial<CodebaseLibraryItem> = {},
): CodebaseLibraryItem {
	return {
		id: "cb-1",
		name: "<sample codebase>",
		updatedAt: "2026-10-04T22:40:00.000Z",
		fileCount: 37,
		snapshotCreatedAt: "2026-10-04T22:40:00.000Z",
		snapshotStatus: "uploaded",
		summary: null,
		framework: null,
		language: null,
		packageManager: null,
		hasReadyAnalysis: false,
		...overrides,
	};
}

function makeItems(count: number): CodebaseLibraryItem[] {
	return Array.from({ length: count }, (_, index) =>
		makeItem({
			id: `cb-${index + 1}`,
			name: `<sample project ${index + 1}>`,
			updatedAt: new Date(Date.UTC(2026, 9, 4, 22, 40 - index)).toISOString(),
		}),
	);
}

// Radix menus open on pointerdown and read layout through ResizeObserver /
// element rects, none of which jsdom implements. Without these the real
// primitive cannot be exercised in a component test.
function installRadixDomPolyfills() {
	class ResizeObserverStub {
		observe() {}
		unobserve() {}
		disconnect() {}
	}
	vi.stubGlobal("ResizeObserver", ResizeObserverStub);
	vi.stubGlobal(
		"DOMRect",
		class {
			constructor(
				public x = 0,
				public y = 0,
				public width = 0,
				public height = 0,
			) {}
			get top() {
				return this.y;
			}
			get left() {
				return this.x;
			}
			get right() {
				return this.x + this.width;
			}
			get bottom() {
				return this.y + this.height;
			}
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

function openActionsMenu(index = 0) {
	const triggers = screen.getAllByRole("button", { name: /Aksi project/i });
	fireEvent.pointerDown(triggers[index], {
		button: 0,
		ctrlKey: false,
		pointerType: "mouse",
	});
}

beforeEach(() => {
	mockCodebaseApi();
	installRadixDomPolyfills();
	sessionStorage.clear();
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	sessionStorage.clear();
});

describe("CodebaseLibraryView", () => {
	it("links Hubungkan repository to the new sync wizard", () => {
		render(<CodebaseLibraryView items={[]} />);
		const ctas = screen.getAllByRole("link", {
			name: /Hubungkan repository/i,
		});
		expect(ctas.length).toBeGreaterThan(0);
		for (const cta of ctas) {
			expect(cta.getAttribute("href")).toBe("/plan/codebase");
		}
	});

	it("explains projects persist automatically in the empty state", () => {
		render(<CodebaseLibraryView items={[]} />);
		expect(screen.getByText(/otomatis muncul di sini/i)).toBeDefined();
	});

	it("links each existing project card to its workspace", () => {
		render(
			<CodebaseLibraryView
				items={[makeItem({ id: "cb-react", name: "<sample react>" })]}
			/>,
		);
		const card = screen.getByText("<sample react>").closest("a");
		expect(card?.getAttribute("href")).toBe("/codebases/cb-react");
	});

	it("uses persisted analysis summary when available", () => {
		render(
			<CodebaseLibraryView
				items={[makeItem({ summary: "<sample persisted summary>" })]}
			/>,
		);
		expect(screen.getByText("<sample persisted summary>")).toBeDefined();
	});

	it("renders graceful fallback without fabricated stack", () => {
		render(<CodebaseLibraryView items={[makeItem()]} />);
		expect(screen.queryByText("React")).toBeNull();
		expect(screen.getByText(/37 file/i)).toBeDefined();
	});

	it("keeps a re-synced project out of Siap until its own snapshot is analyzed", () => {
		render(
			<CodebaseLibraryView
				items={[
					makeItem({
						framework: "React",
						snapshotStatus: "uploaded",
						hasReadyAnalysis: false,
					}),
				]}
			/>,
		);
		expect(screen.queryByText("Siap")).toBeNull();
		expect(screen.getByText("Tersinkron")).toBeDefined();
	});

	it("maps snapshot status to product language", () => {
		render(
			<CodebaseLibraryView
				items={[
					makeItem({
						id: "cb-ready",
						name: "<sample ready>",
						snapshotStatus: "ready",
					}),
					makeItem({
						id: "cb-failed",
						name: "<sample failed>",
						snapshotStatus: "failed",
					}),
				]}
			/>,
		);
		expect(screen.getByText("Siap")).toBeDefined();
		expect(screen.getByText("Perlu perhatian")).toBeDefined();
	});

	it("filters cards by search query", () => {
		render(
			<CodebaseLibraryView
				items={[
					makeItem({ id: "cb-a", name: "<sample alpha>" }),
					makeItem({ id: "cb-b", name: "<sample beta>" }),
				]}
			/>,
		);
		fireEvent.change(screen.getByPlaceholderText(/Cari project/i), {
			target: { value: "beta" },
		});
		expect(screen.queryByText("<sample alpha>")).toBeNull();
		expect(screen.getByText("<sample beta>")).toBeDefined();
	});

	it("exposes a single semantic target per card without nested links", () => {
		const { container } = render(
			<CodebaseLibraryView items={[makeItem({ id: "cb-1" })]} />,
		);
		const cardLinks = container.querySelectorAll(
			'[data-testid="codebase-library-list"] a',
		);
		expect(cardLinks.length).toBe(1);
	});

	it("keeps the action menu outside the card link", () => {
		render(<CodebaseLibraryView items={[makeItem({ id: "cb-1" })]} />);
		const trigger = screen.getByRole("button", { name: /Aksi project/i });
		expect(trigger.closest("a")).toBeNull();
	});

	it("uses the canonical primary button token for the CTA instead of theme-inverted pairs", () => {
		render(<CodebaseLibraryView items={[]} />);
		const cta = screen.getAllByRole("link", {
			name: /Hubungkan repository/i,
		})[0];
		expect(cta.className).toContain("btn-primary");
		expect(cta.className).not.toMatch(/bg-snow/);
		expect(cta.className).not.toMatch(/text-onyx/);
	});

	it("offers Home and VibePlan breadcrumb context", () => {
		render(<CodebaseLibraryView items={[]} />);
		const crumbs = screen.getByRole("navigation", { name: "Breadcrumb" });
		expect(crumbs.querySelector('a[href="/"]')).not.toBeNull();
		expect(crumbs.querySelector('a[href="/plan"]')).not.toBeNull();
		expect(crumbs.textContent).toContain("Project Tersimpan");
	});
});

describe("CodebaseLibraryView rename", () => {
	it("renames through the server and shows the persisted name", async () => {
		render(<CodebaseLibraryView items={[makeItem({ id: "cb-1" })]} />);

		openActionsMenu();
		fireEvent.click(screen.getByRole("menuitem", { name: /Ganti nama/i }));
		const input = screen.getByRole("textbox", { name: /Nama project/i });
		fireEvent.change(input, { target: { value: "Movie App" } });
		fireEvent.click(screen.getByRole("button", { name: /^Simpan$/i }));

		await waitFor(() => {
			expect(screen.getByText("Movie App")).toBeDefined();
		});
		expect(screen.queryByText("<sample codebase>")).toBeNull();
	});

	it("refuses to submit a blank name", () => {
		render(<CodebaseLibraryView items={[makeItem({ id: "cb-1" })]} />);

		openActionsMenu();
		fireEvent.click(screen.getByRole("menuitem", { name: /Ganti nama/i }));
		fireEvent.change(screen.getByRole("textbox", { name: /Nama project/i }), {
			target: { value: "   " },
		});
		fireEvent.click(screen.getByRole("button", { name: /^Simpan$/i }));

		expect(screen.getByRole("alert")).toBeDefined();
	});

	it("keeps the previous name and surfaces an error when the server rejects the rename", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => ({
				ok: false,
				status: 400,
				json: async () => ({ error: "Gagal", code: "CODEBASE_NAME_INVALID" }),
			})),
		);
		render(<CodebaseLibraryView items={[makeItem({ id: "cb-1" })]} />);

		openActionsMenu();
		fireEvent.click(screen.getByRole("menuitem", { name: /Ganti nama/i }));
		fireEvent.change(screen.getByRole("textbox", { name: /Nama project/i }), {
			target: { value: "Movie App" },
		});
		fireEvent.click(screen.getByRole("button", { name: /^Simpan$/i }));

		await waitFor(() => {
			expect(screen.getByRole("alert")).toBeDefined();
		});
		expect(screen.getByText("<sample codebase>")).toBeDefined();
	});
});

describe("CodebaseLibraryView delete", () => {
	it("requires confirmation before removing the project", async () => {
		render(<CodebaseLibraryView items={[makeItem({ id: "cb-1" })]} />);

		openActionsMenu();
		fireEvent.click(screen.getByRole("menuitem", { name: /Hapus project/i }));

		expect(screen.getByRole("dialog")).toBeDefined();
		expect(screen.getByText("<sample codebase>")).toBeDefined();
		expect(fetch).not.toHaveBeenCalled();
	});

	it("removes the project after confirmed deletion", async () => {
		render(<CodebaseLibraryView items={[makeItem({ id: "cb-1" })]} />);

		openActionsMenu();
		fireEvent.click(screen.getByRole("menuitem", { name: /Hapus project/i }));
		fireEvent.click(screen.getByRole("button", { name: /^Hapus project$/i }));

		await waitFor(() => {
			expect(screen.queryByText("<sample codebase>")).toBeNull();
		});
	});

	it("keeps the project visible when deletion fails", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => ({
				ok: false,
				status: 500,
				json: async () => ({ error: "Gagal", code: "CODEBASE_DELETE_FAILED" }),
			})),
		);
		render(<CodebaseLibraryView items={[makeItem({ id: "cb-1" })]} />);

		openActionsMenu();
		fireEvent.click(screen.getByRole("menuitem", { name: /Hapus project/i }));
		fireEvent.click(screen.getByRole("button", { name: /^Hapus project$/i }));

		await waitFor(() => {
			expect(useUIStore.getState().toastType).toBe("error");
		});
		expect(screen.getByText("<sample codebase>")).toBeDefined();
	});

	it("clears the onboarding pointers of the codebase it just deleted", async () => {
		// The delete invalidates any /plan/codebase pointer to this codebase.
		// Leaving it behind makes the next onboarding visit poll a status
		// endpoint for a codebase that no longer exists.
		storePlanCodebasePointer("cb-1", "<sample codebase>");
		storePlanCodebaseProjectPointer("proj-1");
		render(<CodebaseLibraryView items={[makeItem({ id: "cb-1" })]} />);

		openActionsMenu();
		fireEvent.click(screen.getByRole("menuitem", { name: /Hapus project/i }));
		fireEvent.click(screen.getByRole("button", { name: /^Hapus project$/i }));

		await waitFor(() => {
			expect(readPlanCodebasePointer()).toBeNull();
		});
		expect(readPlanCodebaseProjectPointer()).toBeNull();
	});

	it("keeps onboarding pointers that belong to a different codebase", async () => {
		storePlanCodebasePointer("cb-2", "<sample other>");
		storePlanCodebaseProjectPointer("proj-2");
		render(<CodebaseLibraryView items={[makeItem({ id: "cb-1" })]} />);

		openActionsMenu();
		fireEvent.click(screen.getByRole("menuitem", { name: /Hapus project/i }));
		fireEvent.click(screen.getByRole("button", { name: /^Hapus project$/i }));

		await waitFor(() => {
			expect(screen.queryByText("<sample codebase>")).toBeNull();
		});
		expect(readPlanCodebasePointer()).toEqual({
			id: "cb-2",
			name: "<sample other>",
		});
		expect(readPlanCodebaseProjectPointer()).toBe("proj-2");
	});

	it("keeps the onboarding pointers when the deletion is rejected", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => ({
				ok: false,
				status: 409,
				json: async () => ({ error: "Konfirmasi diperlukan." }),
			})),
		);
		storePlanCodebasePointer("cb-1", "<sample codebase>");
		storePlanCodebaseProjectPointer("proj-1");
		render(<CodebaseLibraryView items={[makeItem({ id: "cb-1" })]} />);

		openActionsMenu();
		fireEvent.click(screen.getByRole("menuitem", { name: /Hapus project/i }));
		fireEvent.click(screen.getByRole("button", { name: /^Hapus project$/i }));

		await waitFor(() => {
			expect(useUIStore.getState().toastType).toBe("error");
		});
		// The row still exists server-side, so its pointer must survive.
		expect(readPlanCodebasePointer()).toEqual({
			id: "cb-1",
			name: "<sample codebase>",
		});
		expect(readPlanCodebaseProjectPointer()).toBe("proj-1");
	});

	it("never touches unrelated application storage on delete", async () => {
		sessionStorage.setItem("unrelated:key", "keep-me");
		storePlanCodebasePointer("cb-1", "<sample codebase>");
		render(<CodebaseLibraryView items={[makeItem({ id: "cb-1" })]} />);

		openActionsMenu();
		fireEvent.click(screen.getByRole("menuitem", { name: /Hapus project/i }));
		fireEvent.click(screen.getByRole("button", { name: /^Hapus project$/i }));

		await waitFor(() => {
			expect(readPlanCodebasePointer()).toBeNull();
		});
		expect(sessionStorage.getItem("unrelated:key")).toBe("keep-me");
	});
});

describe("CodebaseLibraryView pagination", () => {
	it("renders one page of items and no footer below the page size", () => {
		render(
			<CodebaseLibraryView items={makeItems(CODEBASE_LIBRARY_PAGE_SIZE)} />,
		);
		expect(
			screen.queryByRole("navigation", { name: /Pagination/i }),
		).toBeNull();
	});

	it("paginates beyond the page size and reports the page count", () => {
		render(<CodebaseLibraryView items={makeItems(25)} />);
		expect(screen.getByText("Halaman 1 dari 3")).toBeDefined();
		expect(
			screen.getByText(`<sample project ${CODEBASE_LIBRARY_PAGE_SIZE}>`),
		).toBeDefined();
		expect(
			screen.queryByText(`<sample project ${CODEBASE_LIBRARY_PAGE_SIZE + 1}>`),
		).toBeNull();
	});

	it("disables previous on the first page and next on the last", () => {
		render(<CodebaseLibraryView items={makeItems(25)} />);
		expect(
			screen
				.getByRole("button", { name: /Sebelumnya/i })
				.hasAttribute("disabled"),
		).toBe(true);

		fireEvent.click(screen.getByRole("button", { name: /Selanjutnya/i }));
		expect(
			screen
				.getByRole("button", { name: /Sebelumnya/i })
				.hasAttribute("disabled"),
		).toBe(false);

		fireEvent.click(screen.getByRole("button", { name: /Selanjutnya/i }));
		expect(
			screen
				.getByRole("button", { name: /Selanjutnya/i })
				.hasAttribute("disabled"),
		).toBe(true);
	});

	it("keeps a multi-page result paginated by the filtered count", () => {
		render(<CodebaseLibraryView items={makeItems(100)} />);
		expect(screen.getByText("Halaman 1 dari 10")).toBeDefined();

		fireEvent.change(screen.getByPlaceholderText(/Cari project/i), {
			target: { value: "project 1" },
		});
		// "project 1", 10-19, 100 => 12 rows => 2 pages, not the unfiltered 10.
		expect(screen.getByText("Halaman 1 dari 2")).toBeDefined();
	});

	it("resets to page one when the search query changes", () => {
		render(<CodebaseLibraryView items={makeItems(25)} />);
		fireEvent.click(screen.getByRole("button", { name: /Selanjutnya/i }));
		expect(screen.getByText("Halaman 2 dari 3")).toBeDefined();

		// The new query keeps 12 rows, so a footer still renders; a reset to
		// page one is proven by page 1 replacing the previous page 2.
		fireEvent.change(screen.getByPlaceholderText(/Cari project/i), {
			target: { value: "project 1" },
		});
		expect(screen.getByText("Halaman 1 dari 2")).toBeDefined();
	});

	it("clamps the page after a delete reduces the page count", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => ({
				ok: true,
				status: 200,
				json: async () => ({ success: true, deleted: true }),
			})),
		);
		render(<CodebaseLibraryView items={makeItems(21)} />);
		fireEvent.click(screen.getByRole("button", { name: /Selanjutnya/i }));
		fireEvent.click(screen.getByRole("button", { name: /Selanjutnya/i }));
		expect(screen.getByText("Halaman 3 dari 3")).toBeDefined();

		openActionsMenu(0);
		fireEvent.click(screen.getByRole("menuitem", { name: /Hapus project/i }));
		fireEvent.click(screen.getByRole("button", { name: /^Hapus project$/i }));

		await waitFor(() => {
			expect(screen.getByText("Halaman 2 dari 2")).toBeDefined();
		});
	});

	it("shows a search-specific empty state without offering pagination", () => {
		render(<CodebaseLibraryView items={makeItems(3)} />);
		fireEvent.change(screen.getByPlaceholderText(/Cari project/i), {
			target: { value: "tidak-ada-hasil" },
		});
		expect(screen.getByText(/Tidak ada project yang cocok/i)).toBeDefined();
		expect(
			screen.queryByRole("navigation", { name: /Pagination/i }),
		).toBeNull();
	});
});
