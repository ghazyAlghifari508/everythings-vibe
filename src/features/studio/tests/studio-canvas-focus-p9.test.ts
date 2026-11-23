import { describe, expect, it } from "vitest";
import {
	STUDIO_CANVAS_INITIAL_MIN_ZOOM,
	STUDIO_CANVAS_MAX_ZOOM,
	STUDIO_CANVAS_MIN_ZOOM,
} from "../types/studio-constants";
import { computeFrameFocus } from "../utils/studio-canvas-fit";

const available = { width: 1200, height: 800, insetLeft: 340 };
const camera = {
	available,
	minZoom: STUDIO_CANVAS_MIN_ZOOM,
	maxZoom: STUDIO_CANVAS_MAX_ZOOM,
};

describe("P9 Focus camera", () => {
	it("centers one selected frame without changing its content", () => {
		const result = computeFrameFocus({
			...camera,
			bounds: [{ width: 1440, height: 900 }],
			frameIndex: 0,
		});
		expect(result.zoom).toBeGreaterThanOrEqual(STUDIO_CANVAS_MIN_ZOOM);
		expect(result.zoom).toBeLessThanOrEqual(STUDIO_CANVAS_MAX_ZOOM);
		expect(Number.isFinite(result.pan.x)).toBe(true);
		expect(Number.isFinite(result.pan.y)).toBe(true);
	});

	it("keeps a tall mobile screen readable instead of zooming out to fit", () => {
		const result = computeFrameFocus({
			...camera,
			bounds: [{ width: 390, height: 2400 }],
			frameIndex: 0,
		});
		expect(result.zoom).toBeGreaterThanOrEqual(STUDIO_CANVAS_INITIAL_MIN_ZOOM);
	});

	it("moves the camera to the requested frame index", () => {
		const bounds = [
			{ width: 1440, height: 900 },
			{ width: 390, height: 844 },
		];
		const first = computeFrameFocus({ ...camera, bounds, frameIndex: 0 });
		const second = computeFrameFocus({ ...camera, bounds, frameIndex: 1 });
		expect(second.pan.x).not.toBe(first.pan.x);
		expect(second.pan.y).not.toBe(first.pan.y);
	});

	it("clamps invalid frame indexes instead of producing NaN", () => {
		const bounds = [{ width: 390, height: 844 }];
		for (const frameIndex of [-1, 99, Number.NaN]) {
			const result = computeFrameFocus({ ...camera, bounds, frameIndex });
			expect(Number.isFinite(result.zoom)).toBe(true);
			expect(Number.isFinite(result.pan.x)).toBe(true);
			expect(Number.isFinite(result.pan.y)).toBe(true);
		}
	});
});
