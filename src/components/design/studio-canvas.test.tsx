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
		designSkillId: "none" as const,
		initialPageCount: null,
		designReference: null,
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

	it("places the cursor/hand tools at the right edge, vertically centred", () => {
		render(
			<StudioCanvas
				project={mockProject}
				frames={mockFrames}
				selectedFrameId={null}
				onSelectFrame={vi.fn()}
			/>,
		);

		const cursor = screen.getByRole("button", { name: "Cursor" });
		const hand = screen.getByRole("button", { name: "Hand" });
		// Both tools live in one compact vertical group on the right edge.
		const toolbar = cursor.parentElement;
		expect(toolbar).toBe(hand.parentElement);
		expect(toolbar?.className).toContain("right-3");
		expect(toolbar?.className).toContain("top-1/2");
		expect(toolbar?.className).toContain("-translate-y-1/2");
		expect(toolbar?.className).toContain("flex-col");
		// Cursor stays on top of the group.
		expect(
			cursor.compareDocumentPosition(hand) & Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy();
	});

	it("places the zoom controls in the bottom-right corner", () => {
		render(
			<StudioCanvas
				project={mockProject}
				frames={mockFrames}
				selectedFrameId={null}
				onSelectFrame={vi.fn()}
			/>,
		);

		const zoomOut = screen.getByRole("button", { name: /Perkecil/i });
		// The positioning wrapper is the element that anchors the group.
		const group = zoomOut.parentElement?.parentElement;
		expect(group?.className).toContain("bottom-3");
		expect(group?.className).toContain("right-3");
		// The tools must not share the zoom group's anchor.
		const cursorToolbar = screen.getByRole("button", {
			name: "Cursor",
		}).parentElement;
		expect(cursorToolbar?.className).not.toContain("bottom-3");
	});

	it("provides active/inactive tool state and shortcuts in tooltips", () => {
		render(
			<StudioCanvas
				project={mockProject}
				frames={mockFrames}
				selectedFrameId={null}
				onSelectFrame={vi.fn()}
			/>,
		);

		const cursor = screen.getByRole("button", { name: "Cursor" });
		const hand = screen.getByRole("button", { name: "Hand" });
		expect(cursor.getAttribute("aria-pressed")).toBe("true");
		expect(hand.getAttribute("aria-pressed")).toBe("false");
		expect(cursor.getAttribute("title")).toContain("V");
		expect(hand.getAttribute("title")).toContain("H");

		fireEvent.click(hand);
		expect(hand.getAttribute("aria-pressed")).toBe("true");
		expect(cursor.getAttribute("aria-pressed")).toBe("false");
	});

	it("does not let the V/H shortcuts fire while typing in an input", () => {
		render(
			<StudioCanvas
				project={mockProject}
				frames={mockFrames}
				selectedFrameId={null}
				onSelectFrame={vi.fn()}
			/>,
		);

		const input = document.createElement("textarea");
		document.body.appendChild(input);
		input.focus();
		fireEvent.keyDown(input, { key: "h" });
		expect(
			screen
				.getByRole("button", { name: "Cursor" })
				.getAttribute("aria-pressed"),
		).toBe("true");
		input.remove();
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
