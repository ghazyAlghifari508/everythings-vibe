// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
	isStudioCanvasViewVisible,
	parseStudioCanvasView,
	readStudioCanvasView,
	studioCanvasViewStorageKey,
	writeStudioCanvasView,
} from "@/features/studio/services/studio-canvas-view";
import {
	STUDIO_CANVAS_COMPOSER_INSET_PX,
	STUDIO_CANVAS_FIT_PADDING_PX,
	STUDIO_CANVAS_FRAME_GAP_PX,
	STUDIO_CANVAS_FRAME_HEADER_PX,
	STUDIO_CANVAS_HEADER_INSET_PX,
	STUDIO_CANVAS_INITIAL_MIN_ZOOM,
	STUDIO_CANVAS_MAX_ZOOM,
	STUDIO_CANVAS_MIN_ZOOM,
} from "@/features/studio/types/studio-constants";
import {
	computeCanvasFit,
	computeCanvasInitialView,
	type StudioCanvasFrameBounds,
} from "@/features/studio/utils/studio-canvas-fit";

const WIDE = { width: 1440, height: 900 };
const limits = {
	minZoom: STUDIO_CANVAS_MIN_ZOOM,
	maxZoom: STUDIO_CANVAS_MAX_ZOOM,
};
const MOBILE_PREFERRED = 0.9;

function mobile(height = 844): StudioCanvasFrameBounds {
	return { width: 390, height };
}

function initial(
	bounds: StudioCanvasFrameBounds[],
	available = WIDE,
	preferredZoom = MOBILE_PREFERRED,
	anchorIndex = 0,
) {
	return computeCanvasInitialView({
		bounds,
		available,
		...limits,
		preferredZoom,
		anchorIndex,
	});
}

describe("computeCanvasInitialView", () => {
	it("frames a single mobile screen comfortably instead of shrinking it", () => {
		const bounds = [mobile()];
		const { zoom, pan } = initial(bounds);
		const usableHeight =
			WIDE.height -
			STUDIO_CANVAS_HEADER_INSET_PX -
			STUDIO_CANVAS_COMPOSER_INSET_PX;
		// The whole artboard plus its title line is visible below the header.
		const contentTop = pan.y + (STUDIO_CANVAS_FIT_PADDING_PX / 2) * zoom;
		const contentBottom =
			contentTop + (bounds[0].height + STUDIO_CANVAS_FRAME_HEADER_PX) * zoom;
		expect(contentTop).toBeCloseTo(STUDIO_CANVAS_HEADER_INSET_PX, 6);
		expect(contentBottom).toBeLessThanOrEqual(
			STUDIO_CANVAS_HEADER_INSET_PX + usableHeight,
		);
		expect(zoom).toBeGreaterThan(STUDIO_CANVAS_INITIAL_MIN_ZOOM);
		expect(zoom).toBeLessThanOrEqual(MOBILE_PREFERRED);
	});

	it("keeps four tall mobile frames readable instead of fitting all four", () => {
		const bounds = [mobile(1765), mobile(1765), mobile(1765), mobile(1765)];
		const opening = initial(bounds);
		const fitAll = computeCanvasFit({ bounds, available: WIDE, ...limits });
		// The regression this guards: the old opening view was a fit-all that
		// landed around 34% for this exact shape.
		expect(fitAll.zoom).toBeLessThan(0.4);
		expect(opening.zoom).toBeGreaterThanOrEqual(STUDIO_CANVAS_INITIAL_MIN_ZOOM);
		expect(opening.zoom).toBeGreaterThan(fitAll.zoom);
		// The first frame starts at the left inset, the rest pan into view.
		expect(
			opening.pan.x + (STUDIO_CANVAS_FIT_PADDING_PX / 2) * opening.zoom,
		).toBeCloseTo(STUDIO_CANVAS_HEADER_INSET_PX, 6);
	});

	it("does not let an abnormally tall frame force an extreme zoom-out", () => {
		const tall = initial([mobile(30_000)]);
		const tallFit = computeCanvasFit({
			bounds: [mobile(30_000)],
			available: WIDE,
			...limits,
		});
		expect(tall.zoom).toBe(STUDIO_CANVAS_INITIAL_MIN_ZOOM);
		expect(tallFit.zoom).toBe(STUDIO_CANVAS_MIN_ZOOM);
		expect(tall.zoom).toBeGreaterThan(tallFit.zoom);
	});

	it("handles mixed frame dimensions within the canonical bounds", () => {
		const bounds = [{ width: 1440, height: 900 }, mobile(844), mobile(1765)];
		const { zoom } = initial(bounds);
		expect(zoom).toBeGreaterThanOrEqual(STUDIO_CANVAS_INITIAL_MIN_ZOOM);
		expect(zoom).toBeLessThanOrEqual(STUDIO_CANVAS_MAX_ZOOM);
		expect(Number.isFinite(zoom)).toBe(true);
	});

	it("opens on the selected frame when the user arrives with one", () => {
		const bounds = [mobile(), mobile(), mobile(), mobile()];
		const { zoom, pan } = initial(bounds, WIDE, MOBILE_PREFERRED, 2);
		const offset = bounds[0].width * 2 + STUDIO_CANVAS_FRAME_GAP_PX * 2;
		const selectedLeft =
			pan.x + (STUDIO_CANVAS_FIT_PADDING_PX / 2 + offset) * zoom;
		expect(selectedLeft).toBeCloseTo(STUDIO_CANVAS_HEADER_INSET_PX, 6);
	});

	it("scales with the canvas but never below the readability floor", () => {
		const bounds = [mobile()];
		const large = initial(bounds, { width: 2000, height: 1400 });
		const small = initial(bounds, { width: 900, height: 500 });
		const tiny = initial(bounds, { width: 300, height: 300 });
		expect(large.zoom).toBeGreaterThanOrEqual(small.zoom);
		expect(small.zoom).toBeGreaterThanOrEqual(STUDIO_CANVAS_INITIAL_MIN_ZOOM);
		expect(tiny.zoom).toBe(STUDIO_CANVAS_INITIAL_MIN_ZOOM);
	});

	it("never leaves the caller's zoom bounds", () => {
		const bounds = [mobile()];
		expect(
			computeCanvasInitialView({
				bounds,
				available: WIDE,
				minZoom: 0.8,
				maxZoom: 2,
				preferredZoom: 0.9,
			}).zoom,
		).toBeGreaterThanOrEqual(0.8);
		expect(
			computeCanvasInitialView({
				bounds,
				available: { width: 4000, height: 3000 },
				minZoom: 0.2,
				maxZoom: 0.4,
				preferredZoom: 1,
			}).zoom,
		).toBe(0.4);
	});

	it("falls back to the preferred scale with nothing to frame", () => {
		expect(initial([], WIDE)).toEqual({
			zoom: MOBILE_PREFERRED,
			pan: { x: 0, y: 0 },
		});
	});
});

describe("studio canvas view persistence", () => {
	beforeEach(() => localStorage.clear());

	it("keys the saved view to the actual project id", () => {
		writeStudioCanvasView("project-a", {
			zoom: 1.1,
			pan: { x: -80, y: -40 },
		});
		expect(readStudioCanvasView("project-a", limits)).toEqual({
			zoom: 1.1,
			pan: { x: -80, y: -40 },
		});
		expect(readStudioCanvasView("project-b", limits)).toBeNull();
		expect(studioCanvasViewStorageKey("project-a")).toContain("project-a");
	});

	it("rejects malformed and unusable stored values", () => {
		const key = studioCanvasViewStorageKey("project-a");
		for (const raw of [
			"{",
			"null",
			"[]",
			JSON.stringify({ zoom: "1", pan: { x: 0, y: 0 } }),
			JSON.stringify({ zoom: 0, pan: { x: 0, y: 0 } }),
			JSON.stringify({ zoom: 1, pan: { x: "0", y: 0 } }),
			JSON.stringify({ zoom: 1, pan: { x: 0 } }),
			JSON.stringify({ zoom: Number.POSITIVE_INFINITY, pan: { x: 0, y: 0 } }),
		]) {
			localStorage.setItem(key, raw);
			expect(readStudioCanvasView("project-a", limits)).toBeNull();
		}
		expect(parseStudioCanvasView(null, limits)).toBeNull();
	});

	it("clamps a stored zoom into the live bounds", () => {
		const key = studioCanvasViewStorageKey("project-a");
		localStorage.setItem(
			key,
			JSON.stringify({ zoom: 12, pan: { x: 0, y: 0 } }),
		);
		expect(readStudioCanvasView("project-a", limits)?.zoom).toBe(
			STUDIO_CANVAS_MAX_ZOOM,
		);
		localStorage.setItem(
			key,
			JSON.stringify({ zoom: 0.01, pan: { x: 0, y: 0 } }),
		);
		expect(readStudioCanvasView("project-a", limits)?.zoom).toBe(
			STUDIO_CANVAS_MIN_ZOOM,
		);
	});

	it("accepts the opening view and a genuine fit-all view", () => {
		const bounds = [mobile(1765), mobile(1765), mobile(1765), mobile(1765)];
		expect(isStudioCanvasViewVisible(initial(bounds), bounds, WIDE)).toBe(true);
		expect(
			isStudioCanvasViewVisible(
				computeCanvasFit({ bounds, available: WIDE, ...limits }),
				bounds,
				WIDE,
			),
		).toBe(true);
	});

	it("rejects a restored view that would open on empty space", () => {
		const bounds = [mobile()];
		expect(
			isStudioCanvasViewVisible(
				{ zoom: 1, pan: { x: -5000, y: -5000 } },
				bounds,
				WIDE,
			),
		).toBe(false);
		expect(
			isStudioCanvasViewVisible(
				{ zoom: 1, pan: { x: 0, y: 5000 } },
				bounds,
				WIDE,
			),
		).toBe(false);
		expect(
			isStudioCanvasViewVisible({ zoom: 1, pan: { x: 0, y: 0 } }, [], WIDE),
		).toBe(false);
	});

	it("survives a shrinking canvas swap only while content stays visible", () => {
		const bounds = [mobile()];
		const view = { zoom: 1, pan: { x: -20, y: -20 } };
		expect(
			isStudioCanvasViewVisible(view, bounds, { width: 1440, height: 500 }),
		).toBe(true);
		expect(
			isStudioCanvasViewVisible(view, bounds, { width: 240, height: 200 }),
		).toBe(false);
	});
});
