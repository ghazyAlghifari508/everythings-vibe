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
		expect(onSelectFrame).toHaveBeenCalledWith("f-1", false);
		fireEvent.click(dashboardBtn, { shiftKey: true });
		expect(onSelectFrame).toHaveBeenLastCalledWith("f-1", true);
		fireEvent.click(screen.getByRole("button", { name: "Hand" }));
		fireEvent.click(dashboardBtn);
		expect(onSelectFrame).toHaveBeenCalledTimes(2);
	});

	it("renders a clean, navigable canvas with no oversized loading card while planning", () => {
		const planningJob = {
			id: "j-2",
			projectId: "p-1",
			userId: "u-1",
			prompt: "Test",
			jobType: "initial",
			targetFrameId: null,
			status: "planning",
			error: null,
			createdAt: new Date(),
			updatedAt: new Date(),
		};

		const { container } = render(
			<StudioCanvas
				project={mockProject}
				frames={[]}
				activeJob={planningJob}
				onSelectFrame={vi.fn()}
			/>,
		);

		// The removed loading block and its copy must not come back.
		expect(screen.queryByText(/Menyiapkan Kanvas/i)).toBeNull();
		expect(screen.queryByText(/Layar sedang direncanakan oleh AI/i)).toBeNull();
		// No placeholder frame may be fabricated before real frames exist.
		expect(container.querySelector('[data-testid$="-shimmer"]')).toBeNull();
		// The canvas surface and its controls stay available immediately.
		expect(screen.getByTestId("studio-canvas")).toBeDefined();
		expect(screen.getByRole("button", { name: "Cursor" })).toBeDefined();
		expect(screen.getByRole("button", { name: "Hand" })).toBeDefined();
		expect(screen.getByRole("button", { name: /Perbesar/i })).toBeDefined();
		// One honest, factual status line derived from the persisted job.
		expect(screen.getByText("Menyusun rencana layar")).toBeDefined();
	});

	it("renders planning failure state with a retry action when activeJob failed", () => {
		const onRetryPlanning = vi.fn();
		const failedJob = {
			id: "j-1",
			projectId: "p-1",
			userId: "u-1",
			prompt: "Test",
			jobType: "initial",
			targetFrameId: null,
			status: "failed",
			error: "AI rate limit reached",
			createdAt: new Date(),
			updatedAt: new Date(),
		};

		render(
			<StudioCanvas
				project={mockProject}
				frames={[]}
				activeJob={failedJob}
				onRetryPlanning={onRetryPlanning}
			/>,
		);

		expect(screen.getByText("Perencanaan layar gagal")).toBeDefined();
		expect(screen.getByText("AI rate limit reached")).toBeDefined();

		const retryBtn = screen.getByRole("button", {
			name: /Coba lagi/i,
		});
		fireEvent.click(retryBtn);
		expect(onRetryPlanning).toHaveBeenCalled();
	});
});
