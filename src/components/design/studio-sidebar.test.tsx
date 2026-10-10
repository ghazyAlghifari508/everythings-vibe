// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StudioSidebar } from "./studio-sidebar";

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

describe("StudioSidebar", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		cleanup();
	});

	it("renders project history list with title and badges", () => {
		render(<StudioSidebar history={mockProjects} onSelectProject={vi.fn()} />);

		expect(screen.getByText("My Projects")).toBeDefined();
		expect(screen.getByText("3")).toBeDefined();
		expect(screen.getByText("Dashboard SIMRS Pasien Rawat Inap")).toBeDefined();
		expect(screen.getByText("Aplikasi Kasir Mobile POS")).toBeDefined();
		expect(screen.getByText("Landing Page Event Musik Jakarta")).toBeDefined();
	});

	it("filters projects case-insensitively while typing", () => {
		render(<StudioSidebar history={mockProjects} onSelectProject={vi.fn()} />);

		const searchInput = screen.getByLabelText("Cari project studio");
		fireEvent.change(searchInput, { target: { value: "kasir" } });

		expect(screen.getByText("Aplikasi Kasir Mobile POS")).toBeDefined();
		expect(screen.queryByText("Dashboard SIMRS Pasien Rawat Inap")).toBeNull();
		expect(screen.queryByText("Landing Page Event Musik Jakarta")).toBeNull();
	});

	it("displays no-results state when search does not match", () => {
		render(<StudioSidebar history={mockProjects} onSelectProject={vi.fn()} />);

		const searchInput = screen.getByLabelText("Cari project studio");
		fireEvent.change(searchInput, { target: { value: "xyznotfound" } });

		expect(screen.getByText(/Tidak ada project yang cocok/i)).toBeDefined();
	});

	it("displays empty state when history is empty", () => {
		render(<StudioSidebar history={[]} onSelectProject={vi.fn()} />);

		expect(screen.getByText("Belum ada project studio.")).toBeDefined();
	});

	it("calls onSelectProject when clicking a project item", () => {
		const onSelectProject = vi.fn();
		render(
			<StudioSidebar
				history={mockProjects}
				onSelectProject={onSelectProject}
			/>,
		);

		fireEvent.click(screen.getByText("Dashboard SIMRS Pasien Rawat Inap"));
		expect(onSelectProject).toHaveBeenCalledWith("p1");
	});

	it("does NOT contain Shared with me UI", () => {
		render(<StudioSidebar history={mockProjects} onSelectProject={vi.fn()} />);

		expect(screen.queryByText(/Shared with me/i)).toBeNull();
		expect(screen.queryByText(/Dibagikan ke saya/i)).toBeNull();
	});
});
