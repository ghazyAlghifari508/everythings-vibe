// @vitest-environment jsdom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StudioSidebar } from "@/features/studio/components/workspace/studio-sidebar";

const mockProjects = [
	{
		id: "p1",
		title: "Dashboard SIMRS Pasien Rawat Inap",
		designMode: "web",
		hasDesignMd: true,
		hasLogo: true,
		createdAt: "2026-03-01T08:00:00Z",
	},
	{
		id: "p2",
		title: "Aplikasi Kasir Mobile POS",
		designMode: "mobile",
		hasDesignMd: false,
		hasLogo: false,
		createdAt: "2026-03-02T10:00:00Z",
	},
	{
		id: "p3",
		title: "Landing Page Event Musik Jakarta",
		designMode: "web",
		hasDesignMd: true,
		hasLogo: false,
		createdAt: "2026-03-03T12:00:00Z",
	},
];

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
	if (!Element.prototype.hasPointerCapture) {
		Element.prototype.hasPointerCapture = () => false;
		Element.prototype.setPointerCapture = () => {};
		Element.prototype.releasePointerCapture = () => {};
	}
	if (!Element.prototype.scrollIntoView) {
		Element.prototype.scrollIntoView = () => {};
	}
}

function openActionsMenu(title = mockProjects[0].title) {
	fireEvent.pointerDown(
		screen.getByRole("button", { name: `Aksi project ${title}` }),
		{ button: 0, ctrlKey: false, pointerType: "mouse" },
	);
}

describe("StudioSidebar", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		installRadixDomPolyfills();
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});

	it("renders project history list with title and badges", () => {
		render(
			<StudioSidebar
				history={mockProjects}
				onSelectProject={vi.fn()}
				onDeleteProject={vi.fn(async () => {})}
			/>,
		);

		expect(screen.getByText("My Projects")).toBeDefined();
		expect(screen.getByText("3")).toBeDefined();
		expect(screen.getByText("Dashboard SIMRS Pasien Rawat Inap")).toBeDefined();
		expect(screen.getByText("Aplikasi Kasir Mobile POS")).toBeDefined();
		expect(screen.getByText("Landing Page Event Musik Jakarta")).toBeDefined();
	});

	it("filters projects case-insensitively while typing", () => {
		render(
			<StudioSidebar
				history={mockProjects}
				onSelectProject={vi.fn()}
				onDeleteProject={vi.fn(async () => {})}
			/>,
		);

		const searchInput = screen.getByLabelText("Cari project studio");
		fireEvent.change(searchInput, { target: { value: "kasir" } });

		expect(screen.getByText("Aplikasi Kasir Mobile POS")).toBeDefined();
		expect(screen.queryByText("Dashboard SIMRS Pasien Rawat Inap")).toBeNull();
		expect(screen.queryByText("Landing Page Event Musik Jakarta")).toBeNull();
	});

	it("displays no-results state when search does not match", () => {
		render(
			<StudioSidebar
				history={mockProjects}
				onSelectProject={vi.fn()}
				onDeleteProject={vi.fn(async () => {})}
			/>,
		);

		const searchInput = screen.getByLabelText("Cari project studio");
		fireEvent.change(searchInput, { target: { value: "xyznotfound" } });

		expect(screen.getByText(/Tidak ada project yang cocok/i)).toBeDefined();
	});

	it("displays empty state when history is empty", () => {
		render(
			<StudioSidebar
				history={[]}
				onSelectProject={vi.fn()}
				onDeleteProject={vi.fn(async () => {})}
			/>,
		);

		expect(screen.getByText("Belum ada project studio.")).toBeDefined();
	});

	it("calls onSelectProject when clicking a project item", () => {
		const onSelectProject = vi.fn();
		render(
			<StudioSidebar
				history={mockProjects}
				onSelectProject={onSelectProject}
				onDeleteProject={vi.fn(async () => {})}
			/>,
		);

		fireEvent.click(screen.getByText("Dashboard SIMRS Pasien Rawat Inap"));
		expect(onSelectProject).toHaveBeenCalledWith("p1");
	});

	it("does NOT contain Shared with me UI", () => {
		render(
			<StudioSidebar
				history={mockProjects}
				onSelectProject={vi.fn()}
				onDeleteProject={vi.fn(async () => {})}
			/>,
		);

		expect(screen.queryByText(/Shared with me/i)).toBeNull();
		expect(screen.queryByText(/Dibagikan ke saya/i)).toBeNull();
	});

	it("offers a discreet per-project action menu with a destructive delete action", async () => {
		render(
			<StudioSidebar
				history={mockProjects}
				onSelectProject={vi.fn()}
				onDeleteProject={vi.fn(async () => {})}
			/>,
		);

		expect(
			screen.getAllByRole("button", { name: /Aksi project/i }),
		).toHaveLength(mockProjects.length);

		openActionsMenu();

		const deleteItem = await screen.findByRole("menuitem", {
			name: /Hapus project/i,
		});
		expect(deleteItem).toBeDefined();
	});

	it("confirms deletion in an accessible dialog before calling the server action", async () => {
		const onDeleteProject = vi.fn(async () => {});
		render(
			<StudioSidebar
				history={mockProjects}
				onSelectProject={vi.fn()}
				onDeleteProject={onDeleteProject}
			/>,
		);

		openActionsMenu();
		fireEvent.click(
			await screen.findByRole("menuitem", { name: /Hapus project/i }),
		);

		const dialog = await screen.findByRole("dialog");
		expect(dialog).toBeDefined();
		expect(screen.getByText(/tidak dapat dibatalkan/i)).toBeDefined();
		expect(dialog.textContent).toContain("Dashboard SIMRS Pasien Rawat Inap");
		expect(onDeleteProject).not.toHaveBeenCalled();

		fireEvent.click(screen.getByRole("button", { name: "Hapus project" }));
		await waitFor(() => expect(onDeleteProject).toHaveBeenCalledWith("p1"));
	});

	it("cancels deletion without calling the server action", async () => {
		const onDeleteProject = vi.fn(async () => {});
		render(
			<StudioSidebar
				history={mockProjects}
				onSelectProject={vi.fn()}
				onDeleteProject={onDeleteProject}
			/>,
		);

		openActionsMenu();
		fireEvent.click(
			await screen.findByRole("menuitem", { name: /Hapus project/i }),
		);
		await screen.findByRole("dialog");
		fireEvent.click(screen.getByRole("button", { name: "Batal" }));

		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		expect(onDeleteProject).not.toHaveBeenCalled();
	});

	it("keeps the project listed and reports a retryable error when deletion fails", async () => {
		const onDeleteProject = vi.fn(async () => {
			throw new Error("Gagal menghapus project. Coba lagi.");
		});
		render(
			<StudioSidebar
				history={mockProjects}
				onSelectProject={vi.fn()}
				onDeleteProject={onDeleteProject}
			/>,
		);

		openActionsMenu();
		fireEvent.click(
			await screen.findByRole("menuitem", { name: /Hapus project/i }),
		);
		await screen.findByRole("dialog");
		fireEvent.click(screen.getByRole("button", { name: "Hapus project" }));

		await waitFor(() =>
			expect(screen.getByRole("alert").textContent).toContain(
				"Gagal menghapus project. Coba lagi.",
			),
		);
		expect(screen.getByText("Dashboard SIMRS Pasien Rawat Inap")).toBeDefined();
	});

	it("aligns the platform icon and vertical ellipsis menu in one action area", () => {
		render(
			<StudioSidebar
				history={mockProjects}
				onSelectProject={vi.fn()}
				onDeleteProject={vi.fn(async () => {})}
			/>,
		);

		const actionBtn = screen.getByRole("button", {
			name: `Aksi project ${mockProjects[0].title}`,
		});
		const actionGroup = actionBtn.parentElement;
		expect(actionGroup).not.toBeNull();
		const webIndicator = actionGroup?.querySelector('[title="Web Design"]');
		expect(webIndicator).not.toBeNull();
	});

	it("renders platform indicators correctly for web and mobile projects", () => {
		render(
			<StudioSidebar
				history={mockProjects}
				onSelectProject={vi.fn()}
				onDeleteProject={vi.fn(async () => {})}
			/>,
		);

		expect(screen.getAllByTitle("Web Design")).toHaveLength(2);
		expect(screen.getAllByTitle("Mobile Design")).toHaveLength(1);
	});

	it("preserves user-entered project titles containing em dashes without mutation", () => {
		const projectsWithEmDash = [
			{
				id: "custom-1",
				title: "E-Commerce — Toko Baju & Fashion Brand",
				designMode: "web",
				hasDesignMd: false,
				hasLogo: false,
				createdAt: "2026-03-01T08:00:00Z",
			},
		];
		render(
			<StudioSidebar
				history={projectsWithEmDash}
				onSelectProject={vi.fn()}
				onDeleteProject={vi.fn(async () => {})}
			/>,
		);

		expect(
			screen.getByText("E-Commerce — Toko Baju & Fashion Brand"),
		).toBeDefined();
	});

	it("ensures public-facing UI labels and copy do not contain em dashes", () => {
		const { container } = render(
			<StudioSidebar
				history={mockProjects}
				onSelectProject={vi.fn()}
				onDeleteProject={vi.fn(async () => {})}
			/>,
		);

		const searchInput = screen.getByLabelText("Cari project studio");
		expect(searchInput.getAttribute("placeholder")).not.toContain("—");
		const aside = container.querySelector("aside");
		expect(aside?.getAttribute("aria-label")).not.toContain("—");
		const spans = container.querySelectorAll("span");
		const hasEmDash = Array.from(spans).some(
			(s) => s.textContent?.trim() === "—",
		);
		expect(hasEmDash).toBe(false);
	});
});
