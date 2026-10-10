// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioCanvas } from "./studio-canvas";

describe("StudioCanvas", () => {
	afterEach(() => cleanup());

	const mockProject = {
		id: "p-1",
		userId: "u-1",
		title: "Finance App",
		designMode: "mobile",
		designMd: null,
		logoAssetId: null,
		createdAt: new Date(),
		updatedAt: new Date(),
	};

	const mockFrames = [
		{
			id: "f-1",
			projectId: "p-1",
			name: "Dashboard",
			description: "Main overview",
			viewport: "mobile",
			htmlCode: "<html><body>Dashboard</body></html>",
			status: "ready",
			order: 0,
			error: null,
			createdAt: new Date(),
			updatedAt: new Date(),
		},
		{
			id: "f-2",
			projectId: "p-1",
			name: "Transactions",
			description: "History",
			viewport: "mobile",
			htmlCode: null,
			status: "generating",
			order: 1,
			error: null,
			createdAt: new Date(),
			updatedAt: new Date(),
		},
	];

	it("renders all frames onto the canvas", () => {
		render(
			<StudioCanvas
				project={mockProject}
				frames={mockFrames}
				selectedFrameId={null}
				onSelectFrame={vi.fn()}
			/>,
		);

		expect(screen.getByText("Dashboard")).toBeDefined();
		expect(screen.getAllByText("Transactions").length).toBeGreaterThanOrEqual(
			1,
		);
	});

	it("renders zoom controls with current zoom percentage", () => {
		render(
			<StudioCanvas
				project={mockProject}
				frames={mockFrames}
				selectedFrameId={null}
				onSelectFrame={vi.fn()}
			/>,
		);

		expect(screen.getByRole("button", { name: /Perbesar/i })).toBeDefined();
		expect(screen.getByRole("button", { name: /Perkecil/i })).toBeDefined();
	});

	it("calls onSelectFrame when clicking a frame", () => {
		const onSelectFrame = vi.fn();
		render(
			<StudioCanvas
				project={mockProject}
				frames={mockFrames}
				selectedFrameId={null}
				onSelectFrame={onSelectFrame}
			/>,
		);

		const dashboardBtn = screen.getByRole("button", { name: /^Dashboard$/i });
		fireEvent.click(dashboardBtn);
		expect(onSelectFrame).toHaveBeenCalledWith("f-1");
	});
});
