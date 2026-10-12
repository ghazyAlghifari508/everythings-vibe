// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	WHEEL_LINE_HEIGHT_PX,
	WHEEL_PAGE_HEIGHT_PX,
	WHEEL_ZOOM_MAX_FRAME_FACTOR,
} from "@/lib/constants";
import {
	normalizeWheelDelta,
	useCanvasZoom,
	type WheelLike,
	wheelDeltaToZoomFactor,
} from "./use-canvas-zoom";

/**
 * Regression guard for whiteboard pan jank: pointermove can fire more often
 * than the display refreshes, so pan updates MUST be coalesced to at most one
 * React commit per animation frame instead of one re-render per input event.
 */

type Hook = ReturnType<typeof useCanvasZoom>;

let container: HTMLDivElement;
let root: Root | null = null;
let renderCount: number;
let latest: Hook;

function Harness() {
	latest = useCanvasZoom();
	renderCount += 1;
	return null;
}

function mount() {
	renderCount = 0;
	container = document.createElement("div");
	document.body.appendChild(container);
	const r = createRoot(container);
	root = r;
	act(() => {
		r.render(<Harness />);
	});
	return renderCount;
}

function fakePointer(x: number, y: number) {
	return {
		clientX: x,
		clientY: y,
		pointerType: "mouse",
		buttons: 1,
		pointerId: 1,
		currentTarget: { setPointerCapture: () => {} },
	} as unknown as React.PointerEvent;
}

let rafQueue: Array<(t: number) => void> = [];

function flushFrame() {
	const q = rafQueue;
	rafQueue = [];
	for (const cb of q) cb(16);
}

beforeEach(() => {
	(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
	rafQueue = [];
	vi.stubGlobal("requestAnimationFrame", (cb: (t: number) => void) => {
		rafQueue.push(cb);
		return rafQueue.length;
	});
	vi.stubGlobal("cancelAnimationFrame", (_id: number) => {});
});

afterEach(() => {
	if (root) {
		const r = root;
		act(() => {
			r.unmount();
		});
		root = null;
	}
	container?.remove();
	vi.unstubAllGlobals();
});

describe("useCanvasZoom pan coalescing", () => {
	it("commits at most one render per frame under rapid pointermove bursts", () => {
		const initial = mount();

		act(() => {
			latest.startPan(fakePointer(0, 0));
			for (let i = 1; i <= 30; i++) {
				latest.updatePan(fakePointer(i * 3, i * 2));
			}
		});

		expect(renderCount).toBe(initial);

		act(() => {
			flushFrame();
		});

		expect(renderCount).toBe(initial + 1);
	});

	it("applies the full accumulated delta exactly once", () => {
		mount();

		act(() => {
			latest.startPan(fakePointer(0, 0));
			for (let i = 1; i <= 30; i++) {
				latest.updatePan(fakePointer(i * 3, i * 2));
			}
		});
		act(() => {
			flushFrame();
		});

		expect(latest.pan.x).toBe(90);
		expect(latest.pan.y).toBe(60);
	});

	it("flushes pending deltas immediately on endPan so no movement is lost", () => {
		mount();

		act(() => {
			latest.startPan(fakePointer(0, 0));
			latest.updatePan(fakePointer(12, 9));
			latest.endPan();
		});

		expect(latest.pan.x).toBe(12);
		expect(latest.pan.y).toBe(9);
	});

	it("keeps panning across multiple frames with fresh deltas", () => {
		mount();

		act(() => {
			latest.startPan(fakePointer(0, 0));
		});
		act(() => {
			latest.updatePan(fakePointer(10, 0));
		});
		act(() => {
			flushFrame();
		});
		act(() => {
			latest.updatePan(fakePointer(15, 0));
		});
		act(() => {
			flushFrame();
		});

		expect(latest.pan.x).toBe(15);
	});

	it("resets pan and zoom while cancelling pending gesture RAFs", () => {
		mount();

		act(() => {
			latest.startPan(fakePointer(0, 0));
			latest.updatePan(fakePointer(25, 25));
			latest.resetZoom();
		});

		// Flushing any leftover frames after reset must not apply old pointer moves
		act(() => {
			flushFrame();
		});

		expect(latest.pan.x).toBe(0);
		expect(latest.pan.y).toBe(0);
		expect(latest.zoom).toBe(1);
	});

	it("clamps zoom within [minZoom, maxZoom] boundaries", () => {
		mount();

		act(() => {
			latest.setZoom(999);
		});
		expect(latest.zoom).toBe(latest.maxZoom);

		act(() => {
			latest.setZoom(-10);
		});
		expect(latest.zoom).toBe(latest.minZoom);
	});
});

function fakeWheel(
	deltaY: number,
	deltaMode = 0,
	clientX = 100,
	clientY = 100,
): WheelLike {
	return { deltaY, deltaMode, clientX, clientY };
}

describe("useCanvasZoom wheel normalization", () => {
	it("treats a line-based wheel as pixels instead of a near-zero gesture", () => {
		// deltaMode 1 reports a handful of lines; without the conversion the
		// gesture would read as an almost imperceptible scroll.
		expect(normalizeWheelDelta({ deltaY: 3, deltaMode: 1 })).toBe(
			3 * WHEEL_LINE_HEIGHT_PX,
		);
		expect(normalizeWheelDelta({ deltaY: 1, deltaMode: 2 })).toBe(
			WHEEL_PAGE_HEIGHT_PX,
		);
		expect(normalizeWheelDelta({ deltaY: 120, deltaMode: 0 })).toBe(120);
	});

	it("rejects non-finite wheel deltas instead of propagating them", () => {
		expect(normalizeWheelDelta({ deltaY: Number.NaN, deltaMode: 0 })).toBe(0);
		expect(
			normalizeWheelDelta({ deltaY: Number.POSITIVE_INFINITY, deltaMode: 0 }),
		).toBe(0);
		expect(wheelDeltaToZoomFactor(Number.NaN)).toBe(1);
		expect(wheelDeltaToZoomFactor(0)).toBe(1);
	});

	it("bounds the zoom change a single burst can apply", () => {
		const huge = wheelDeltaToZoomFactor(-100_000);
		expect(huge).toBeLessThanOrEqual(WHEEL_ZOOM_MAX_FRAME_FACTOR);
		const tiny = wheelDeltaToZoomFactor(100_000);
		expect(tiny).toBeGreaterThanOrEqual(1 / WHEEL_ZOOM_MAX_FRAME_FACTOR);
	});

	it("zooms in for upward scroll and out for downward scroll", () => {
		expect(wheelDeltaToZoomFactor(-120)).toBeGreaterThan(1);
		expect(wheelDeltaToZoomFactor(120)).toBeLessThan(1);
	});
});

describe("useCanvasZoom bounds across every entry point", () => {
	it("never exceeds the maximum through repeated wheel events", () => {
		mount();
		act(() => {
			for (let i = 0; i < 200; i++) {
				latest.onWheel(fakeWheel(-240));
				flushFrame();
			}
		});
		expect(latest.zoom).toBe(latest.maxZoom);
		expect(Number.isFinite(latest.zoom)).toBe(true);
	});

	it("never drops below the minimum through repeated wheel events", () => {
		mount();
		act(() => {
			for (let i = 0; i < 200; i++) {
				latest.onWheel(fakeWheel(240));
				flushFrame();
			}
		});
		expect(latest.zoom).toBe(latest.minZoom);
		expect(Number.isFinite(latest.zoom)).toBe(true);
	});

	it("never exceeds the maximum through repeated toolbar zoom-in", () => {
		mount();
		act(() => {
			for (let i = 0; i < 100; i++) latest.zoomIn();
		});
		expect(latest.zoom).toBe(latest.maxZoom);
	});

	it("never drops below the minimum through repeated toolbar zoom-out", () => {
		mount();
		act(() => {
			for (let i = 0; i < 100; i++) latest.zoomOut();
		});
		expect(latest.zoom).toBe(latest.minZoom);
	});

	it("ignores invalid wheel deltas without corrupting the current scale", () => {
		mount();
		act(() => {
			latest.setZoom(1.2);
		});
		act(() => {
			latest.onWheel(fakeWheel(Number.NaN));
			flushFrame();
		});
		expect(latest.zoom).toBe(1.2);

		act(() => {
			latest.onWheel(fakeWheel(Number.POSITIVE_INFINITY));
			flushFrame();
		});
		expect(latest.zoom).toBe(1.2);
	});

	it("clamps a non-finite direct scale assignment to the minimum", () => {
		mount();
		act(() => {
			latest.setZoom(Number.NaN);
		});
		expect(latest.zoom).toBe(latest.minZoom);
	});

	it("returns to the initial scale on reset regardless of the entry point used", () => {
		mount();
		act(() => {
			latest.zoomIn();
			latest.zoomIn();
			latest.onWheel(fakeWheel(-300));
			flushFrame();
		});
		act(() => {
			latest.resetZoom();
		});
		expect(latest.zoom).toBe(1);
		expect(latest.pan).toEqual({ x: 0, y: 0 });
	});

	it("keeps the same bounds when switching between wheel and toolbar zoom", () => {
		mount();
		act(() => {
			for (let i = 0; i < 20; i++) {
				latest.zoomIn();
				latest.onWheel(fakeWheel(-240));
				flushFrame();
			}
		});
		expect(latest.zoom).toBe(latest.maxZoom);

		act(() => {
			for (let i = 0; i < 20; i++) {
				latest.zoomOut();
				latest.onWheel(fakeWheel(240));
				flushFrame();
			}
		});
		expect(latest.zoom).toBe(latest.minZoom);
	});

	it("anchors the zoomed content point under the pointer", () => {
		mount();
		act(() => {
			latest.setPan({ x: -100, y: -50 });
		});
		act(() => {
			latest.onWheel(fakeWheel(-300, 0, 200, 150));
			flushFrame();
		});
		// The content point under the cursor stays put: the pan offset must
		// grow by exactly the scale ratio applied at that anchor.
		const ratio = latest.zoom / 1;
		expect(latest.pan.x).toBeCloseTo(200 - (200 - -100) * ratio, 5);
		expect(latest.pan.y).toBeCloseTo(150 - (150 - -50) * ratio, 5);
	});
});
