// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
	exceedsDragThreshold,
	isMarqueeIgnoredTarget,
	MARQUEE_IGNORE_SELECTOR,
	type MarqueeFrameBounds,
	normalizeRect,
	rectsIntersect,
	resolveMarqueeSelection,
	screenToWorld,
	worldToScreen,
} from "./studio-canvas-marquee";

describe("normalizeRect", () => {
	const cases = [
		{ name: "down-right", start: { x: 10, y: 20 }, end: { x: 60, y: 80 } },
		{ name: "up-left", start: { x: 60, y: 80 }, end: { x: 10, y: 20 } },
		{ name: "up-right", start: { x: 10, y: 80 }, end: { x: 60, y: 20 } },
		{ name: "down-left", start: { x: 60, y: 20 }, end: { x: 10, y: 80 } },
	];

	for (const { name, start, end } of cases) {
		it(`produces the same positive rectangle dragging ${name}`, () => {
			expect(normalizeRect(start, end)).toEqual({
				x: 10,
				y: 20,
				width: 50,
				height: 60,
			});
		});
	}

	it("collapses a zero-distance drag to a zero-size rectangle", () => {
		expect(normalizeRect({ x: 5, y: 5 }, { x: 5, y: 5 })).toEqual({
			x: 5,
			y: 5,
			width: 0,
			height: 0,
		});
	});
});

describe("rectsIntersect", () => {
	const marquee = { x: 100, y: 100, width: 200, height: 200 };

	it("detects a frame fully inside the marquee", () => {
		expect(
			rectsIntersect(marquee, { x: 150, y: 150, width: 20, height: 20 }),
		).toBe(true);
	});

	it("detects a frame overlapping only a corner", () => {
		expect(
			rectsIntersect(marquee, { x: 280, y: 20, width: 100, height: 100 }),
		).toBe(true);
	});

	it("detects a frame that contains the marquee", () => {
		expect(
			rectsIntersect(marquee, { x: 0, y: 0, width: 500, height: 500 }),
		).toBe(true);
	});

	it("rejects a frame that only shares an edge (zero-area overlap)", () => {
		expect(
			rectsIntersect(marquee, { x: 300, y: 100, width: 50, height: 50 }),
		).toBe(false);
	});

	it("detects intersection by any part, not only the centre", () => {
		// The frame centre (350, 350) is far outside the marquee, but its top-left
		// corner overlaps it: an intersection rule selects it.
		const frame = { x: 280, y: 280, width: 140, height: 140 };
		expect(rectsIntersect(marquee, frame)).toBe(true);
	});

	it("rejects a frame entirely outside", () => {
		expect(
			rectsIntersect(marquee, { x: 400, y: 400, width: 50, height: 50 }),
		).toBe(false);
	});
});

describe("resolveMarqueeSelection", () => {
	const frames: MarqueeFrameBounds[] = [
		{ id: "a", rect: { x: 0, y: 0, width: 50, height: 50 } },
		{ id: "b", rect: { x: 100, y: 0, width: 50, height: 50 } },
		{ id: "c", rect: { x: 200, y: 0, width: 50, height: 50 } },
	];

	it("returns only frames the rectangle touches, in canvas order", () => {
		const marquee = { x: 40, y: 0, width: 120, height: 50 };
		expect(
			resolveMarqueeSelection(marquee, frames, { additive: false, base: [] }),
		).toEqual(["a", "b"]);
	});

	it("adds newly intersected frames without dropping the existing selection", () => {
		const marquee = { x: 190, y: 0, width: 80, height: 50 };
		expect(
			resolveMarqueeSelection(marquee, frames, {
				additive: true,
				base: ["a"],
			}),
		).toEqual(["a", "c"]);
	});

	it("keeps the base first and does not duplicate a re-intersected frame", () => {
		const marquee = { x: 0, y: 0, width: 300, height: 50 };
		expect(
			resolveMarqueeSelection(marquee, frames, {
				additive: true,
				base: ["b", "a"],
			}),
		).toEqual(["b", "a", "c"]);
	});

	it("returns an empty list when the rectangle touches nothing", () => {
		expect(
			resolveMarqueeSelection({ x: 0, y: 500, width: 10, height: 10 }, frames, {
				additive: false,
				base: ["a"],
			}),
		).toEqual([]);
	});
});

describe("coordinate conversion", () => {
	it("round-trips screen -> world -> screen at any zoom and pan", () => {
		for (const transform of [
			{ pan: { x: 0, y: 0 }, zoom: 1 },
			{ pan: { x: -320, y: 128 }, zoom: 0.2 },
			{ pan: { x: 96, y: -48 }, zoom: 2 },
			{ pan: { x: 57, y: 311 }, zoom: 0.9 },
		]) {
			const screen = { x: 412, y: 233 };
			const world = screenToWorld(screen, transform);
			expect(worldToScreen(world, transform)).toEqual(screen);
		}
	});

	it("maps a canvas-local point into untransformed world space", () => {
		const transform = { pan: { x: 100, y: 50 }, zoom: 2 };
		expect(screenToWorld({ x: 300, y: 250 }, transform)).toEqual({
			x: 100,
			y: 100,
		});
	});

	it("accounts for the surface padding as part of world space", () => {
		// The surface carries 96px padding, so a frame at world (96, 96) is where
		// the first artboard begins; screen conversion must honour the pan/zoom.
		const transform = { pan: { x: 20, y: 10 }, zoom: 0.5 };
		expect(worldToScreen({ x: 96, y: 96 }, transform)).toEqual({
			x: 68,
			y: 58,
		});
	});
});

describe("exceedsDragThreshold", () => {
	it("is false for a press with no movement", () => {
		expect(exceedsDragThreshold({ x: 10, y: 10 }, { x: 10, y: 10 }, 4)).toBe(
			false,
		);
	});

	it("is false for a jitter below the threshold", () => {
		expect(exceedsDragThreshold({ x: 10, y: 10 }, { x: 12, y: 11 }, 4)).toBe(
			false,
		);
	});

	it("is true once either axis passes the threshold", () => {
		expect(exceedsDragThreshold({ x: 10, y: 10 }, { x: 15, y: 10 }, 4)).toBe(
			true,
		);
		expect(exceedsDragThreshold({ x: 10, y: 10 }, { x: 10, y: 15 }, 4)).toBe(
			true,
		);
	});

	it("is direction independent", () => {
		expect(exceedsDragThreshold({ x: 10, y: 10 }, { x: 5, y: 6 }, 4)).toBe(
			true,
		);
	});
});

describe("isMarqueeIgnoredTarget", () => {
	it("exposes a selector that covers frames and interactive chrome", () => {
		expect(MARQUEE_IGNORE_SELECTOR).toContain("article");
		expect(MARQUEE_IGNORE_SELECTOR).toContain("button");
		expect(MARQUEE_IGNORE_SELECTOR).toContain("[role=dialog]");
		expect(MARQUEE_IGNORE_SELECTOR).toContain("[data-canvas-marquee-ignore]");
	});

	it("returns false for a null or non-element target", () => {
		expect(isMarqueeIgnoredTarget(null)).toBe(false);
	});

	it("flags a press inside a frame or a control", () => {
		const frame = document.createElement("article");
		const button = document.createElement("button");
		frame.appendChild(button);
		expect(isMarqueeIgnoredTarget(frame)).toBe(true);
		expect(isMarqueeIgnoredTarget(button)).toBe(true);
	});

	it("allows a press on bare empty canvas", () => {
		const surface = document.createElement("div");
		expect(isMarqueeIgnoredTarget(surface)).toBe(false);
	});
});
