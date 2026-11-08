// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StudioCanvas } from "@/features/studio/components/canvas/studio-canvas";
import {
	parseStudioCanvasView,
	readStudioCanvasView,
	writeStudioCanvasView,
} from "@/features/studio/services/studio-canvas-view";
import {
	STUDIO_CANVAS_HEADER_INSET_PX,
	STUDIO_CANVAS_MAX_ZOOM,
	STUDIO_CANVAS_MIN_ZOOM,
	STUDIO_CANVAS_TOOLBAR_INSET_PX,
} from "@/features/studio/types/studio-constants";
import { computeCanvasFit } from "@/features/studio/utils/studio-canvas-fit";

vi.mock("@/features/studio/hooks/use-studio-frame-visual", () => ({
	useStudioFrameVisual: () => ({
		visualUrl: null,
		hasVisual: false,
		isLoading: false,
		error: null,
		reload: vi.fn(),
		frameHeight: 844,
	}),
}));

const mockProject = {
	id: "project-p5",
	userId: "user-1",
	title: "P5 Canvas Studio",
	titleSource: "auto" as const,
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

function createFrames(count: number) {
	return Array.from({ length: count }, (_, index) => ({
		id: `frame-${index + 1}`,
		projectId: "project-p5",
		name: `Screen ${index + 1}`,
		description: `Description ${index + 1}`,
		viewport: "mobile",
		htmlCode: `<html><body>Screen ${index + 1}</body></html>`,
		status: "ready",
		order: index,
		error: null,
		attempts: 0,
		visualHash: null,
		promptHash: null,
		createdAt: new Date(),
		updatedAt: new Date(),
	}));
}

function getCanvasScale(): number {
	const transform = screen.getByTestId("studio-canvas-surface").style.transform;
	const match = transform.match(/scale\(([^)]+)\)/);
	return match ? Number.parseFloat(match[1]) : Number.NaN;
}

describe("P5 — Studio Canvas Minimum Zoom and View Restoration", () => {
	const viewport = {
		width: 1440,
		height: 900,
		top: 0,
		left: 0,
		right: 1440,
		bottom: 900,
		x: 0,
		y: 0,
		toJSON: () => ({}),
	} as DOMRect;
	let originalGetBoundingClientRect: () => DOMRect;

	beforeEach(() => {
		localStorage.clear();
		originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
		HTMLElement.prototype.getBoundingClientRect = () => viewport;
	});

	afterEach(() => {
		HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
		cleanup();
		localStorage.clear();
	});

	describe("1. Canonical Minimum Zoom Constant", () => {
		it("sets STUDIO_CANVAS_MIN_ZOOM to 0.35 (35%), not the obsolete 0.20", () => {
			expect(STUDIO_CANVAS_MIN_ZOOM).toBe(0.35);
			expect(STUDIO_CANVAS_MIN_ZOOM).toBeGreaterThan(0.2);
			expect(STUDIO_CANVAS_MAX_ZOOM).toBe(2);
		});
	});

	describe("2. View Restoration of Legacy 20% Stored Views", () => {
		it("safely clamps a legacy 20% (0.2) zoom stored in localStorage to 35% (0.35)", () => {
			writeStudioCanvasView("project-p5", {
				zoom: 0.2,
				pan: { x: 100, y: 80 },
			});

			const restored = readStudioCanvasView("project-p5", {
				minZoom: STUDIO_CANVAS_MIN_ZOOM,
				maxZoom: STUDIO_CANVAS_MAX_ZOOM,
			});

			expect(restored).not.toBeNull();
			expect(restored?.zoom).toBe(0.35);
			expect(restored?.pan).toEqual({ x: 100, y: 80 });
		});

		it("parseStudioCanvasView clamps any value below 0.35 to 0.35", () => {
			const view = parseStudioCanvasView(
				JSON.stringify({ zoom: 0.15, pan: { x: 0, y: 0 } }),
				{
					minZoom: STUDIO_CANVAS_MIN_ZOOM,
					maxZoom: STUDIO_CANVAS_MAX_ZOOM,
				},
			);
			expect(view?.zoom).toBe(0.35);
		});

		it("renders with 35% scale on mount when project had legacy 0.20 saved", () => {
			writeStudioCanvasView("project-p5", {
				zoom: 0.2,
				pan: { x: 50, y: 50 },
			});

			render(<StudioCanvas project={mockProject} frames={createFrames(1)} />);

			expect(getCanvasScale()).toBe(0.35);
			expect(screen.getByText("35%")).toBeDefined();
		});
	});

	describe("3. Manual Controls & UI State", () => {
		it("disables the zoom-out button at minimum zoom (35%) and prevents going lower", () => {
			writeStudioCanvasView("project-p5", {
				zoom: 0.35,
				pan: { x: 0, y: 0 },
			});

			render(<StudioCanvas project={mockProject} frames={createFrames(1)} />);

			const zoomOutBtn = screen.getByRole("button", { name: "Perkecil" });
			expect(zoomOutBtn.hasAttribute("disabled")).toBe(true);
			expect(zoomOutBtn.getAttribute("aria-disabled")).toBe("true");

			// Clicking while disabled should not lower the zoom
			fireEvent.click(zoomOutBtn);
			expect(getCanvasScale()).toBe(0.35);
			expect(screen.getByText("35%")).toBeDefined();
		});

		it("allows zooming in to 100% and up to 200% maximum", () => {
			writeStudioCanvasView("project-p5", {
				zoom: 1.8,
				pan: { x: 0, y: 0 },
			});

			render(<StudioCanvas project={mockProject} frames={createFrames(1)} />);

			const zoomInBtn = screen.getByRole("button", { name: "Perbesar" });
			expect(zoomInBtn.hasAttribute("disabled")).toBe(false);

			fireEvent.click(zoomInBtn);
			// 1.8 * 1.2 = 2.16, clamped to 2.0
			expect(getCanvasScale()).toBe(2);
			expect(screen.getByText("200%")).toBeDefined();

			// At 200%, zoom in button is disabled
			expect(zoomInBtn.hasAttribute("disabled")).toBe(true);
			expect(zoomInBtn.getAttribute("aria-disabled")).toBe("true");
		});
	});

	describe("4. Wheel / Trackpad Gestures", () => {
		it("clamps repeated wheel zoom-out to 0.35 without letting scale reach 0.20", async () => {
			render(<StudioCanvas project={mockProject} frames={createFrames(1)} />);

			const canvas = screen.getByTestId("studio-canvas");
			for (let i = 0; i < 30; i++) {
				const event = new WheelEvent("wheel", {
					bubbles: true,
					cancelable: true,
					deltaY: 250,
					deltaMode: 0,
					clientX: 200,
					clientY: 200,
				});
				canvas.dispatchEvent(event);
			}

			await vi.waitFor(() => {
				expect(getCanvasScale()).toBe(0.35);
			});
			expect(getCanvasScale()).toBeGreaterThanOrEqual(0.35);
		});
	});

	describe("5. Fit All & Framing across 1, 3, 5, and many frames", () => {
		const limits = {
			minZoom: STUDIO_CANVAS_MIN_ZOOM,
			maxZoom: STUDIO_CANVAS_MAX_ZOOM,
		};

		it("1 frame: centres artboard horizontally and fits within bounds", () => {
			const { zoom, pan } = computeCanvasFit({
				bounds: [{ width: 390, height: 844 }],
				available: { width: 1440, height: 900 },
				...limits,
			});

			expect(zoom).toBeGreaterThanOrEqual(0.35);
			expect(zoom).toBeLessThanOrEqual(2);
			const trackWidth = 390 + 192;
			expect(pan.x).toBeCloseTo((1440 - trackWidth * zoom) / 2, 5);
		});

		it("3 frames: fits comfortably within canonical zoom limits", () => {
			const { zoom, pan } = computeCanvasFit({
				bounds: [
					{ width: 390, height: 844 },
					{ width: 390, height: 844 },
					{ width: 390, height: 844 },
				],
				available: { width: 1440, height: 900 },
				...limits,
			});

			expect(zoom).toBeGreaterThanOrEqual(0.35);
			expect(zoom).toBeLessThanOrEqual(2);
			expect(Number.isFinite(pan.x)).toBe(true);
			expect(Number.isFinite(pan.y)).toBe(true);
		});

		it("5 frames: clamps to 0.35 when width constrained and frames leading frame safely", () => {
			const { zoom, pan } = computeCanvasFit({
				bounds: Array.from({ length: 5 }, () => ({
					width: 390,
					height: 844,
				})),
				available: { width: 800, height: 700 },
				...limits,
			});

			expect(zoom).toBe(0.35);
			// When width exceeds available, pan.x anchors so frame 1 is not clipped off-screen
			expect(pan.x).toBe(STUDIO_CANVAS_TOOLBAR_INSET_PX);
		});

		it("many frames (8+ frames): maintains 0.35 readability floor and pan-navigability", () => {
			const { zoom, pan } = computeCanvasFit({
				bounds: Array.from({ length: 12 }, () => ({
					width: 390,
					height: 844,
				})),
				available: { width: 1200, height: 800 },
				...limits,
			});

			expect(zoom).toBe(0.35);
			expect(pan.x).toBe(STUDIO_CANVAS_TOOLBAR_INSET_PX);
			expect(Number.isFinite(pan.y)).toBe(true);
		});

		it("mixed frame heights: anchors top under header inset so top content is visible", () => {
			const { zoom, pan } = computeCanvasFit({
				bounds: [
					{ width: 390, height: 3500 },
					{ width: 1440, height: 900 },
				],
				available: { width: 1200, height: 700 },
				...limits,
			});

			expect(zoom).toBe(0.35);
			expect(pan.y).toBe(STUDIO_CANVAS_HEADER_INSET_PX);
		});
	});

	describe("6. Pan and Selection Modes are preserved", () => {
		it("allows switching to hand tool and dragging canvas pan", () => {
			render(<StudioCanvas project={mockProject} frames={createFrames(1)} />);

			const handToolBtn = screen.getByRole("button", {
				name: "Geser canvas (H)",
			});
			fireEvent.click(handToolBtn);

			const canvas = screen.getByTestId("studio-canvas");
			fireEvent.pointerDown(canvas, { clientX: 200, clientY: 200, buttons: 1 });
			fireEvent.pointerMove(canvas, { clientX: 250, clientY: 230, buttons: 1 });
			fireEvent.pointerUp(canvas);

			// Zoom remains unaffected by panning
			expect(getCanvasScale()).toBeGreaterThanOrEqual(0.35);
		});
	});
});
