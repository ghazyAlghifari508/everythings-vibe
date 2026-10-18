// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	computeCanvasFit,
	StudioCanvas,
} from "@/features/studio/components/canvas/studio-canvas";
import {
	STUDIO_CANVAS_COMPOSER_MAX_WIDTH_PX,
	STUDIO_CANVAS_COMPOSER_SIDE_CLEARANCE_PX,
	STUDIO_CANVAS_HEADER_INSET_PX,
	STUDIO_CANVAS_MAX_ZOOM,
	STUDIO_CANVAS_MIN_ZOOM,
	STUDIO_CANVAS_OVERLAY_GAP_PX,
	STUDIO_CANVAS_ZOOM_BOTTOM_PX,
	STUDIO_CANVAS_ZOOM_ROW_HEIGHT_PX,
} from "@/features/studio/types/studio-constants";
import {
	canvasComposerBottomCss,
	canvasComposerWidthCss,
	canvasZoomRowBottomCss,
} from "@/features/studio/utils/studio-canvas-layout";

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
		prdContent: null,
		prdFilename: null,
		prdContentHash: null,
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
		expect(group?.className).toContain("right-3");
		// The bottom anchor comes from the shared overlay geometry so the
		// composer can reserve exactly the same band.
		expect(group?.style.bottom).toBe(canvasZoomRowBottomCss());
		// The tools must not share the zoom group's anchor.
		const cursorToolbar = screen.getByRole("button", {
			name: "Cursor",
		}).parentElement;
		expect(cursorToolbar?.style.bottom).toBe("");
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

	describe("floating overlay geometry", () => {
		it("caps the composer so it never reaches the zoom row", () => {
			expect(canvasComposerWidthCss()).toContain(
				`${STUDIO_CANVAS_COMPOSER_MAX_WIDTH_PX}px`,
			);
			expect(canvasComposerWidthCss()).toContain(
				`${STUDIO_CANVAS_COMPOSER_SIDE_CLEARANCE_PX * 2}px`,
			);
		});

		it("keeps the composer clear of the zoom row and the safe area", () => {
			const bottom = canvasComposerBottomCss();
			expect(bottom).toContain("env(safe-area-inset-bottom)");
			// The composer must sit at or above the zoom row's top edge plus the
			// breathing gap, so the two overlays can never share pixels.
			const zoomRowTop =
				STUDIO_CANVAS_ZOOM_BOTTOM_PX +
				STUDIO_CANVAS_ZOOM_ROW_HEIGHT_PX +
				STUDIO_CANVAS_OVERLAY_GAP_PX;
			expect(bottom).toContain(`${zoomRowTop}px`);
		});

		it("honours the safe area for the zoom row too", () => {
			expect(canvasZoomRowBottomCss()).toContain("env(safe-area-inset-bottom)");
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

	it("registers the wheel listener non-passively so ctrl+wheel stays on the canvas", () => {
		const addEventListener = vi.spyOn(
			HTMLElement.prototype,
			"addEventListener",
		);
		render(
			<StudioCanvas
				project={mockProject}
				frames={mockFrames}
				selectedFrameId={null}
				onSelectFrame={vi.fn()}
			/>,
		);
		const registrations = addEventListener.mock.calls.filter(
			([type]) => type === "wheel",
		);
		// React attaches wheel passively, which is why the canvas registers its
		// own listener: without passive:false the browser also zooms the page.
		expect(
			registrations.some(
				([, , options]) =>
					typeof options === "object" &&
					options !== null &&
					"passive" in options &&
					options.passive === false,
			),
		).toBe(true);
		addEventListener.mockRestore();
	});

	it("does not move the view again once the user has positioned it", () => {
		const { rerender } = render(
			<StudioCanvas
				project={mockProject}
				frames={mockFrames}
				selectedFrameId={null}
				onSelectFrame={vi.fn()}
			/>,
		);
		const surface = screen.getByTestId("studio-canvas-surface");
		fireEvent.click(screen.getByRole("button", { name: "Perbesar" }));
		const afterUserZoom = surface.style.transform;
		// A later measurement must not yank the view the user is working in.
		rerender(
			<StudioCanvas
				project={mockProject}
				frames={[...mockFrames]}
				selectedFrameId={null}
				onSelectFrame={vi.fn()}
			/>,
		);
		expect(screen.getByTestId("studio-canvas-surface").style.transform).toBe(
			afterUserZoom,
		);
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

	describe("marquee selection", () => {
		// jsdom reports zeroed layout boxes, so each test supplies the real
		// rectangles the canvas would read from the browser: the canvas origin
		// and the two frame artboards, all in the shared canvas-local space.
		const canvasRect = {
			left: 0,
			top: 0,
			width: 1000,
			height: 800,
			right: 1000,
			bottom: 800,
			x: 0,
			y: 0,
			toJSON: () => ({}),
		};
		const frameRects: Record<string, DOMRect> = {
			"f-1": {
				left: 100,
				top: 100,
				width: 200,
				height: 300,
				right: 300,
				bottom: 400,
				x: 100,
				y: 100,
				toJSON: () => ({}),
			},
			"f-2": {
				left: 400,
				top: 100,
				width: 200,
				height: 300,
				right: 600,
				bottom: 400,
				x: 400,
				y: 100,
				toJSON: () => ({}),
			},
		};

		function installLayout() {
			const canvas = screen.getByTestId("studio-canvas");
			canvas.getBoundingClientRect = () => canvasRect;
			for (const [id, rect] of Object.entries(frameRects)) {
				const node = canvas.querySelector(`[data-frame-id="${id}"]`);
				if (node instanceof HTMLElement)
					node.getBoundingClientRect = () => rect;
			}
			return canvas;
		}

		function drag(
			canvas: HTMLElement,
			from: { x: number; y: number },
			to: { x: number; y: number },
			init: { shiftKey?: boolean } = {},
		) {
			fireEvent.pointerDown(canvas, {
				pointerId: 7,
				button: 0,
				clientX: from.x,
				clientY: from.y,
				shiftKey: init.shiftKey,
			});
			fireEvent.pointerMove(canvas, {
				pointerId: 7,
				clientX: to.x,
				clientY: to.y,
			});
			fireEvent.pointerUp(canvas, { pointerId: 7 });
		}

		it("selects every frame the rectangle touches", () => {
			const onSelectFrames = vi.fn();
			render(
				<StudioCanvas
					project={mockProject}
					frames={mockFrames}
					selectedFrameIds={[]}
					onSelectFrame={vi.fn()}
					onSelectFrames={onSelectFrames}
				/>,
			);
			const canvas = installLayout();
			// A rectangle spanning both artboards.
			drag(canvas, { x: 50, y: 50 }, { x: 650, y: 450 });
			expect(onSelectFrames).toHaveBeenLastCalledWith(["f-1", "f-2"]);
		});

		it("selects only the frame the rectangle reaches", () => {
			const onSelectFrames = vi.fn();
			render(
				<StudioCanvas
					project={mockProject}
					frames={mockFrames}
					selectedFrameIds={[]}
					onSelectFrame={vi.fn()}
					onSelectFrames={onSelectFrames}
				/>,
			);
			const canvas = installLayout();
			drag(canvas, { x: 50, y: 50 }, { x: 250, y: 250 });
			expect(onSelectFrames).toHaveBeenLastCalledWith(["f-1"]);
		});

		it("keeps the existing selection on a shift+drag and appends new frames", () => {
			const onSelectFrames = vi.fn();
			render(
				<StudioCanvas
					project={mockProject}
					frames={mockFrames}
					selectedFrameIds={["f-1"]}
					onSelectFrame={vi.fn()}
					onSelectFrames={onSelectFrames}
				/>,
			);
			const canvas = installLayout();
			// Drag across only the second artboard while holding shift.
			drag(canvas, { x: 380, y: 50 }, { x: 650, y: 450 }, { shiftKey: true });
			expect(onSelectFrames).toHaveBeenLastCalledWith(["f-1", "f-2"]);
		});

		it("paints a visible rectangle during the drag and hides it on release", () => {
			render(
				<StudioCanvas
					project={mockProject}
					frames={mockFrames}
					selectedFrameIds={[]}
					onSelectFrame={vi.fn()}
					onSelectFrames={vi.fn()}
				/>,
			);
			const canvas = installLayout();
			const marquee = screen.getByTestId("studio-marquee");
			expect(marquee.style.display).toBe("none");

			fireEvent.pointerDown(canvas, {
				pointerId: 7,
				button: 0,
				clientX: 50,
				clientY: 50,
			});
			fireEvent.pointerMove(canvas, {
				pointerId: 7,
				clientX: 260,
				clientY: 210,
			});
			expect(marquee.style.display).toBe("block");
			expect(marquee.style.left).toBe("50px");
			expect(marquee.style.width).toBe("210px");

			fireEvent.pointerUp(canvas, { pointerId: 7 });
			expect(marquee.style.display).toBe("none");
		});

		it("does not start a marquee below the drag threshold", () => {
			const onSelectFrames = vi.fn();
			render(
				<StudioCanvas
					project={mockProject}
					frames={mockFrames}
					selectedFrameIds={["f-1"]}
					onSelectFrame={vi.fn()}
					onSelectFrames={onSelectFrames}
				/>,
			);
			const canvas = installLayout();
			// A sub-threshold move is a click, not a marquee.
			fireEvent.pointerDown(canvas, {
				pointerId: 7,
				button: 0,
				clientX: 50,
				clientY: 50,
			});
			fireEvent.pointerMove(canvas, { pointerId: 7, clientX: 51, clientY: 51 });
			fireEvent.pointerUp(canvas, { pointerId: 7 });
			expect(onSelectFrames).toHaveBeenLastCalledWith([]);
		});

		it("clears the selection on an empty-canvas click with no drag", () => {
			const onSelectFrames = vi.fn();
			render(
				<StudioCanvas
					project={mockProject}
					frames={mockFrames}
					selectedFrameIds={["f-1"]}
					onSelectFrame={vi.fn()}
					onSelectFrames={onSelectFrames}
				/>,
			);
			const canvas = installLayout();
			fireEvent.pointerDown(canvas, {
				pointerId: 7,
				button: 0,
				clientX: 900,
				clientY: 700,
			});
			fireEvent.pointerUp(canvas, { pointerId: 7 });
			expect(onSelectFrames).toHaveBeenLastCalledWith([]);
		});

		it("does not start a marquee from a frame or a control", () => {
			const onSelectFrames = vi.fn();
			render(
				<StudioCanvas
					project={mockProject}
					frames={mockFrames}
					selectedFrameIds={[]}
					onSelectFrame={vi.fn()}
					onSelectFrames={onSelectFrames}
				/>,
			);
			installLayout();
			const frame = screen
				.getByTestId("studio-canvas")
				.querySelector('[data-frame-id="f-1"]');
			expect(frame).not.toBeNull();
			if (frame)
				fireEvent.pointerDown(frame, {
					pointerId: 7,
					button: 0,
					clientX: 150,
					clientY: 150,
				});
			fireEvent.pointerMove(screen.getByTestId("studio-canvas"), {
				pointerId: 7,
				clientX: 650,
				clientY: 450,
			});
			expect(onSelectFrames).not.toHaveBeenCalled();
			expect(screen.getByTestId("studio-marquee").style.display).toBe("none");
		});

		it("cancels and restores the selection on Escape", () => {
			const onSelectFrames = vi.fn();
			render(
				<StudioCanvas
					project={mockProject}
					frames={mockFrames}
					selectedFrameIds={["f-1"]}
					onSelectFrame={vi.fn()}
					onSelectFrames={onSelectFrames}
				/>,
			);
			const canvas = installLayout();
			fireEvent.pointerDown(canvas, {
				pointerId: 7,
				button: 0,
				clientX: 50,
				clientY: 50,
			});
			fireEvent.pointerMove(canvas, {
				pointerId: 7,
				clientX: 650,
				clientY: 450,
			});
			expect(onSelectFrames).toHaveBeenLastCalledWith(["f-1", "f-2"]);
			fireEvent.keyDown(document.body, { key: "Escape" });
			// The pre-drag selection is restored and the rectangle disappears.
			expect(onSelectFrames).toHaveBeenLastCalledWith(["f-1"]);
			expect(screen.getByTestId("studio-marquee").style.display).toBe("none");
		});

		it("cancels and restores the selection when pointer capture is lost", () => {
			const onSelectFrames = vi.fn();
			render(
				<StudioCanvas
					project={mockProject}
					frames={mockFrames}
					selectedFrameIds={["f-1"]}
					onSelectFrame={vi.fn()}
					onSelectFrames={onSelectFrames}
				/>,
			);
			const canvas = installLayout();
			fireEvent.pointerDown(canvas, {
				pointerId: 7,
				button: 0,
				clientX: 50,
				clientY: 50,
			});
			fireEvent.pointerMove(canvas, {
				pointerId: 7,
				clientX: 650,
				clientY: 450,
			});
			fireEvent.lostPointerCapture(canvas, { pointerId: 7 });
			expect(onSelectFrames).toHaveBeenLastCalledWith(["f-1"]);
			expect(screen.getByTestId("studio-marquee").style.display).toBe("none");
		});

		it("cancels the marquee on pointercancel without leaving a stuck rectangle", () => {
			const onSelectFrames = vi.fn();
			render(
				<StudioCanvas
					project={mockProject}
					frames={mockFrames}
					selectedFrameIds={["f-1"]}
					onSelectFrame={vi.fn()}
					onSelectFrames={onSelectFrames}
				/>,
			);
			const canvas = installLayout();
			fireEvent.pointerDown(canvas, {
				pointerId: 7,
				button: 0,
				clientX: 50,
				clientY: 50,
			});
			fireEvent.pointerMove(canvas, {
				pointerId: 7,
				clientX: 650,
				clientY: 450,
			});
			fireEvent.pointerCancel(canvas, { pointerId: 7 });
			expect(onSelectFrames).toHaveBeenLastCalledWith(["f-1"]);
			expect(screen.getByTestId("studio-marquee").style.display).toBe("none");
		});

		it("never starts a marquee in hand mode", () => {
			const onSelectFrames = vi.fn();
			render(
				<StudioCanvas
					project={mockProject}
					frames={mockFrames}
					selectedFrameIds={[]}
					onSelectFrame={vi.fn()}
					onSelectFrames={onSelectFrames}
				/>,
			);
			const canvas = installLayout();
			fireEvent.click(screen.getByRole("button", { name: "Hand" }));
			drag(canvas, { x: 50, y: 50 }, { x: 650, y: 450 });
			expect(onSelectFrames).not.toHaveBeenCalled();
			expect(screen.getByTestId("studio-marquee").style.display).toBe("none");
		});

		it("lets space-pan temporarily override marquee selection", () => {
			const onSelectFrames = vi.fn();
			render(
				<StudioCanvas
					project={mockProject}
					frames={mockFrames}
					selectedFrameIds={[]}
					onSelectFrame={vi.fn()}
					onSelectFrames={onSelectFrames}
				/>,
			);
			const canvas = installLayout();
			fireEvent.keyDown(document.body, { code: "Space" });
			drag(canvas, { x: 50, y: 50 }, { x: 650, y: 450 });
			expect(onSelectFrames).not.toHaveBeenCalled();
			expect(screen.getByTestId("studio-marquee").style.display).toBe("none");
		});
	});
});
