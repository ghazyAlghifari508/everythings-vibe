// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioMobileHistoryDrawer } from "@/features/studio/components/workspace/studio-mobile-history-drawer";

describe("StudioMobileHistoryDrawer", () => {
	const mockProjects = [
		{
			id: "proj-1",
			title: "SIMRS Dashboard",
			designMode: "web" as const,
			hasDesignMd: false,
			hasLogo: false,
			createdAt: "2026-03-01T00:00:00Z",
		},
	];

	afterEach(() => {
		cleanup();
	});

	it("renders drawer dialog content and project list when open", () => {
		const onOpenChange = vi.fn();
		const onSelectProject = vi.fn();
		const onDeleteProject = vi.fn();

		render(
			<StudioMobileHistoryDrawer
				open={true}
				onOpenChange={onOpenChange}
				history={mockProjects}
				onSelectProject={onSelectProject}
				onDeleteProject={onDeleteProject}
			/>,
		);

		expect(screen.getAllByText("My Projects").length).toBeGreaterThan(0);
		expect(screen.getByText("SIMRS Dashboard")).toBeDefined();
		expect(screen.getByRole("dialog")).toBeDefined();
	});

	it("calls onOpenChange(false) when close button is clicked", () => {
		const onOpenChange = vi.fn();
		const onSelectProject = vi.fn();
		const onDeleteProject = vi.fn();

		render(
			<StudioMobileHistoryDrawer
				open={true}
				onOpenChange={onOpenChange}
				history={mockProjects}
				onSelectProject={onSelectProject}
				onDeleteProject={onDeleteProject}
			/>,
		);

		const closeButton = screen.getByRole("button", { name: "Tutup riwayat" });
		fireEvent.click(closeButton);

		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	it("invokes onSelectProject when clicking a project item", () => {
		const onOpenChange = vi.fn();
		const onSelectProject = vi.fn();
		const onDeleteProject = vi.fn();

		render(
			<StudioMobileHistoryDrawer
				open={true}
				onOpenChange={onOpenChange}
				history={mockProjects}
				onSelectProject={onSelectProject}
				onDeleteProject={onDeleteProject}
			/>,
		);

		const projectButton = screen.getByRole("button", {
			name: /^SIMRS Dashboard/,
		});
		fireEvent.click(projectButton);

		expect(onSelectProject).toHaveBeenCalledWith("proj-1");
	});
});
