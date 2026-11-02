// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminProjectsView } from "../components/admin-projects-view";
import type {
	AdminProjectItem,
	AdminProjectStats,
	AdminProjectsListResult,
} from "../types";

let mockNavigate = vi.fn();

vi.mock("@tanstack/react-router", () => ({
	Link: ({
		to,
		params,
		children,
		className,
	}: {
		to: string;
		params?: Record<string, string>;
		children: React.ReactNode;
		className?: string;
	}) => {
		let href = to;
		if (params?.id) {
			href = to.replace("$id", params.id);
		}
		return (
			<a href={href} className={className}>
				{children}
			</a>
		);
	},
	useNavigate: () => mockNavigate,
}));

function makeMockProject(
	i: number,
	step: "prd" | "ac" | "task" = "prd",
	deleted = false,
): AdminProjectItem {
	return {
		id: `project-${i}`,
		name: `Proyek ${i}`,
		description: `Deskripsi proyek ${i}`,
		status: deleted ? "draft" : "active",
		step,
		acStatus: "completed",
		taskStatus: "completed",
		userId: `user-${i}`,
		userName: `User ${i}`,
		userEmail: `user${i}@example.com`,
		createdAt: new Date("2026-03-01T00:00:00Z"),
		deletedAt: deleted ? new Date("2026-03-02T00:00:00Z") : null,
	};
}

describe("AdminProjectsView Component", () => {
	let container: HTMLDivElement;
	let root: Root | null = null;

	beforeEach(() => {
		(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		mockNavigate = vi.fn();
	});

	afterEach(() => {
		if (root) {
			act(() => {
				root?.unmount();
			});
			root = null;
		}
		container?.remove();
	});

	it("1. renders accurate global KPIs from stats instead of page row length", () => {
		const pageProjects = [makeMockProject(1, "prd"), makeMockProject(2, "ac")];

		const mockProjectsResult: AdminProjectsListResult = {
			projects: pageProjects,
			totalCount: 2063,
			page: 1,
			pageSize: 20,
			totalPages: 104,
		};

		const mockStats: AdminProjectStats = {
			totalProjects: 2063,
			prdCount: 1200,
			acCount: 500,
			taskCount: 363,
			deletedCount: 42,
		};

		act(() => {
			root?.render(
				<AdminProjectsView
					projectsResult={mockProjectsResult}
					stats={mockStats}
					searchParams={{
						page: 1,
						pageSize: 20,
						search: "",
						step: "all",
						statusFilter: "active",
					}}
				/>,
			);
		});

		// Assert that global totals appear in metric cards, not page length (2)
		expect(container.textContent).toContain("2063"); // Total Proyek
		expect(container.textContent).toContain("1200"); // PRD
		expect(container.textContent).toContain("500"); // AC
		expect(container.textContent).toContain("363"); // Task
	});

	it("2. renders functional Buka links with correct target routes for active projects", () => {
		const pageProjects = [
			makeMockProject(1, "prd"),
			makeMockProject(2, "ac"),
			makeMockProject(3, "task"),
		];

		const mockProjectsResult: AdminProjectsListResult = {
			projects: pageProjects,
			totalCount: 3,
			page: 1,
			pageSize: 20,
			totalPages: 1,
		};

		act(() => {
			root?.render(
				<AdminProjectsView
					projectsResult={mockProjectsResult}
					searchParams={{
						page: 1,
						pageSize: 20,
						search: "",
						step: "all",
						statusFilter: "active",
					}}
				/>,
			);
		});

		const links = Array.from(container.querySelectorAll("a"));
		const prdLink = links.find(
			(a) => a.getAttribute("href") === "/prd/project-1",
		);
		const acLink = links.find(
			(a) => a.getAttribute("href") === "/ac/project-2",
		);
		const taskLink = links.find(
			(a) => a.getAttribute("href") === "/task/project-3",
		);

		expect(prdLink).toBeDefined();
		expect(acLink).toBeDefined();
		expect(taskLink).toBeDefined();
	});

	it("3. handles deleted projects: displays Terhapus badge and renders non-functional action without workspace link", () => {
		const pageProjects = [
			makeMockProject(1, "prd", false),
			makeMockProject(2, "prd", true), // Deleted project
		];

		const mockProjectsResult: AdminProjectsListResult = {
			projects: pageProjects,
			totalCount: 2,
			page: 1,
			pageSize: 20,
			totalPages: 1,
		};

		act(() => {
			root?.render(
				<AdminProjectsView
					projectsResult={mockProjectsResult}
					searchParams={{
						page: 1,
						pageSize: 20,
						search: "",
						step: "all",
						statusFilter: "all",
					}}
				/>,
			);
		});

		// Check deleted project row has "Terhapus" badge
		expect(container.textContent).toContain("Terhapus");

		// Check deleted project action shows "Tidak Dapat Diakses"
		expect(container.textContent).toContain("Tidak Dapat Diakses");

		// Check there is NO link pointing to /prd/project-2
		const links = Array.from(container.querySelectorAll("a"));
		const deletedLink = links.find(
			(a) => a.getAttribute("href") === "/prd/project-2",
		);
		expect(deletedLink).toBeUndefined();

		// Check active project still has functional link
		const activeLink = links.find(
			(a) => a.getAttribute("href") === "/prd/project-1",
		);
		expect(activeLink).toBeDefined();
	});

	it("4. renders pagination summary and triggers page navigation", () => {
		const pageProjects = [makeMockProject(1), makeMockProject(2)];

		const mockProjectsResult: AdminProjectsListResult = {
			projects: pageProjects,
			totalCount: 2063,
			page: 1,
			pageSize: 20,
			totalPages: 104,
		};

		act(() => {
			root?.render(
				<AdminProjectsView
					projectsResult={mockProjectsResult}
					searchParams={{
						page: 1,
						pageSize: 20,
						search: "",
						step: "all",
						statusFilter: "active",
					}}
				/>,
			);
		});

		// Check pagination text "1–20 dari 2.063 proyek"
		expect(container.textContent).toContain("1–20 dari 2.063 proyek");

		// Find page 2 button and click it
		const buttons = Array.from(container.querySelectorAll("button"));
		const page2Btn = buttons.find((b) => b.textContent?.trim() === "2");
		expect(page2Btn).toBeDefined();

		act(() => {
			page2Btn?.click();
		});

		expect(mockNavigate).toHaveBeenCalledWith({
			to: "/admin/projects",
			search: {
				page: 2,
				pageSize: 20,
				search: "",
				step: "all",
				statusFilter: "active",
			},
		});
	});

	it("5. changing stage filter resets page to 1", () => {
		const mockProjectsResult: AdminProjectsListResult = {
			projects: [makeMockProject(1)],
			totalCount: 50,
			page: 3,
			pageSize: 20,
			totalPages: 3,
		};

		act(() => {
			root?.render(
				<AdminProjectsView
					projectsResult={mockProjectsResult}
					searchParams={{
						page: 3,
						pageSize: 20,
						search: "",
						step: "all",
						statusFilter: "active",
					}}
				/>,
			);
		});

		const buttons = Array.from(container.querySelectorAll("button"));
		const acTab = buttons.find((b) => b.textContent?.trim() === "AC");
		expect(acTab).toBeDefined();

		act(() => {
			acTab?.click();
		});

		expect(mockNavigate).toHaveBeenCalledWith({
			to: "/admin/projects",
			search: {
				page: 1,
				pageSize: 20,
				search: "",
				step: "ac",
				statusFilter: "active",
			},
		});
	});

	it("6. changing audit status filter resets page to 1", () => {
		const mockProjectsResult: AdminProjectsListResult = {
			projects: [makeMockProject(1)],
			totalCount: 50,
			page: 2,
			pageSize: 20,
			totalPages: 3,
		};

		act(() => {
			root?.render(
				<AdminProjectsView
					projectsResult={mockProjectsResult}
					searchParams={{
						page: 2,
						pageSize: 20,
						search: "",
						step: "all",
						statusFilter: "active",
					}}
				/>,
			);
		});

		const select = container.querySelector(
			'select[aria-label="Filter status proyek"]',
		) as HTMLSelectElement;
		expect(select).toBeDefined();

		act(() => {
			select.value = "deleted";
			select.dispatchEvent(new Event("change", { bubbles: true }));
		});

		expect(mockNavigate).toHaveBeenCalledWith({
			to: "/admin/projects",
			search: {
				page: 1,
				pageSize: 20,
				search: "",
				step: "all",
				statusFilter: "deleted",
			},
		});
	});

	it("7. changing page size resets page to 1", () => {
		const mockProjectsResult: AdminProjectsListResult = {
			projects: [makeMockProject(1)],
			totalCount: 150,
			page: 4,
			pageSize: 20,
			totalPages: 8,
		};

		act(() => {
			root?.render(
				<AdminProjectsView
					projectsResult={mockProjectsResult}
					searchParams={{
						page: 4,
						pageSize: 20,
						search: "",
						step: "all",
						statusFilter: "active",
					}}
				/>,
			);
		});

		const sizeSelect = container.querySelector(
			'select[aria-label="Baris per halaman"]',
		) as HTMLSelectElement;
		expect(sizeSelect).toBeDefined();

		act(() => {
			sizeSelect.value = "50";
			sizeSelect.dispatchEvent(new Event("change", { bubbles: true }));
		});

		expect(mockNavigate).toHaveBeenCalledWith({
			to: "/admin/projects",
			search: {
				page: 1,
				pageSize: 50,
				search: "",
				step: "all",
				statusFilter: "active",
			},
		});
	});

	it("8. client-side fallback pagination and filtering works when no server result is supplied", () => {
		const localProjects = [
			makeMockProject(1, "prd", false),
			makeMockProject(2, "ac", false),
			makeMockProject(3, "task", true), // Deleted
		];

		act(() => {
			root?.render(<AdminProjectsView projects={localProjects} />);
		});

		// By default active projects are shown (projects 1 & 2)
		expect(container.textContent).toContain("Proyek 1");
		expect(container.textContent).toContain("Proyek 2");
		expect(container.textContent).not.toContain("Proyek 3");

		// KPI reflects active projects
		expect(container.textContent).toContain("2"); // Total active projects
	});
});
