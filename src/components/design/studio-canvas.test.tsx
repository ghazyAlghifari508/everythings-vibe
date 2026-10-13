// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	STUDIO_CANVAS_HEADER_INSET_PX,
	STUDIO_CANVAS_MAX_ZOOM,
	STUDIO_CANVAS_MIN_ZOOM,
} from "@/lib/constants";
import { computeCanvasFit, StudioCanvas } from "./studio-canvas";

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
		designBlueprint: null,
		designBlueprintVersion: 1,
		designSkillVersion: null,
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
			attempts: 0,
			visualHash: null,
			promptHash: null,
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
			attempts: 0,
			visualHash: null,
			promptHash: null,
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
			claimedBy: null,
			attempts: 0,
			claimedAt: null,
			leaseExpiresAt: null,
			startedAt: null,
			finishedAt: null,
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
			claimedBy: null,
			attempts: 1,
			claimedAt: null,
			leaseExpiresAt: null,
			startedAt: null,
			finishedAt: null,
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

	describe("computeCanvasFit", () => {
		const limits = {
			minZoom: STUDIO_CANVAS_MIN_ZOOM,
			maxZoom: STUDIO_CANVAS_MAX_ZOOM,
		};

		it("keeps every artboard inside the usable band left by the overlays", () => {
			const bounds = [
				{ width: 390, height: 1765 },
				{ width: 390, height: 844 },
			];
			const available = { width: 1440, height: 900 };
			const { zoom, pan } = computeCanvasFit({
				bounds,
				available,
				...limits,
			});
			// The tallest artboard plus the frame header row must fit below the
			// header band and above the composer band.
			const tallest = Math.max(...bounds.map((frame) => frame.height));
			const top = pan.y;
			const bottom = pan.y + (tallest + 28) * zoom;
			expect(top).toBeGreaterThanOrEqual(STUDIO_CANVAS_HEADER_INSET_PX);
			expect(bottom).toBeLessThanOrEqual(available.height);
		});

		it("never exceeds the canonical zoom bounds", () => {
			const huge = computeCanvasFit({
				bounds: [{ width: 1440, height: 30000 }],
				available: { width: 320, height: 320 },
				...limits,
			});
			const tiny = computeCanvasFit({
				bounds: [{ width: 390, height: 200 }],
				available: { width: 4000, height: 3000 },
				...limits,
			});
			expect(huge.zoom).toBe(STUDIO_CANVAS_MIN_ZOOM);
			expect(tiny.zoom).toBe(STUDIO_CANVAS_MAX_ZOOM);
		});

		it("falls back to the minimum scale when there is nothing to fit", () => {
			expect(
				computeCanvasFit({
					bounds: [],
					available: { width: 1000, height: 800 },
					...limits,
				}),
			).toEqual({ zoom: STUDIO_CANVAS_MIN_ZOOM, pan: { x: 0, y: 0 } });
		});

		it("centres a single artboard horizontally", () => {
			const { zoom, pan } = computeCanvasFit({
				bounds: [{ width: 390, height: 844 }],
				available: { width: 1200, height: 900 },
				...limits,
			});
			const trackWidth = 390 + 192;
			expect(pan.x).toBeCloseTo((1200 - trackWidth * zoom) / 2, 6);
		});
	});

	it("stops panning when pointer capture is lost mid-drag", () => {
		render(
			<StudioCanvas
				project={mockProject}
				frames={mockFrames}
				selectedFrameId={null}
				onSelectFrame={vi.fn()}
			/>,
		);
		fireEvent.click(screen.getByRole("button", { name: "Hand" }));
		const canvas = screen.getByTestId("studio-canvas");
		fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 10, clientY: 10 });
		fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 40, clientY: 40 });
		// Losing capture (OS gesture, element removal) must end the gesture.
		fireEvent.lostPointerCapture(canvas, { pointerId: 1 });
		fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 400, clientY: 400 });
		expect(canvas.style.cursor).toBe("grab");
	});

	it("does not start a pan when a floating overlay receives the pointer", () => {
		render(
			<StudioCanvas
				project={mockProject}
				frames={mockFrames}
				selectedFrameId={null}
				onSelectFrame={vi.fn()}
			/>,
		);
		fireEvent.click(screen.getByRole("button", { name: "Hand" }));
		const canvas = screen.getByTestId("studio-canvas");
		expect(canvas.style.cursor).toBe("grab");
		// Overlay pointerdown must be isolated from the canvas gesture.
		fireEvent.pointerDown(screen.getByRole("button", { name: "Perbesar" }), {
			pointerId: 2,
		});
		fireEvent.pointerMove(canvas, { pointerId: 2, clientX: 500, clientY: 500 });
		expect(canvas.style.cursor).toBe("grab");
	});

	it("pans with arrow keys while focus is not inside a control", () => {
		render(
			<StudioCanvas
				project={mockProject}
				frames={mockFrames}
				selectedFrameId={null}
				onSelectFrame={vi.fn()}
			/>,
		);
		const surface = screen.getByTestId("studio-canvas-surface");
		const before = surface.style.transform;
		fireEvent.keyDown(document.body, { key: "ArrowRight" });
		expect(surface.style.transform).not.toBe(before);
	});

	it("ignores arrow keys while focus is inside a control", () => {
		render(
			<StudioCanvas
				project={mockProject}
				frames={mockFrames}
				selectedFrameId={null}
				onSelectFrame={vi.fn()}
			/>,
		);
		const surface = screen.getByTestId("studio-canvas-surface");
		const before = surface.style.transform;
		const hand = screen.getByRole("button", { name: "Hand" });
		fireEvent.keyDown(hand, { key: "ArrowRight" });
		expect(surface.style.transform).toBe(before);
	});

	it("ignores the V/H/Space shortcuts while focus is on a button", () => {
		render(
			<StudioCanvas
				project={mockProject}
				frames={mockFrames}
				selectedFrameId={null}
				onSelectFrame={vi.fn()}
			/>,
		);
		const hand = screen.getByRole("button", { name: "Hand" });
		hand.focus();
		fireEvent.keyDown(hand, { key: "v" });
		expect(hand.getAttribute("aria-pressed")).toBe("false");
	});
});
