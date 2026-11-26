// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useStudioLivePool } from "../hooks/use-studio-live-pool";
import { pinStudioViewportUnits } from "../services/studio-live-viewport";
import {
	STUDIO_LIVE_SURFACE_MAX,
	STUDIO_LIVE_VISIBILITY_MARGIN_PX,
} from "../types/studio-renderer";
import {
	emptyStudioLiveSlots,
	reduceStudioLiveSlots,
	type StudioLiveDocument,
	studioLiveReadiness,
} from "../utils/studio-live-slots";
import { planStudioLiveSurfaces } from "../utils/studio-renderer";
import {
	artboardRectToScreen,
	clampStudioRectToArtboard,
	screenPointToArtboard,
} from "../utils/studio-renderer-geometry";

const ids = (count: number) =>
	Array.from({ length: count }, (_, index) => `f-${index}`);

describe("visible-frame document pool", () => {
	it("never exceeds the safety cap", () => {
		const all = ids(20);
		const pool = planStudioLiveSurfaces({
			selected: [],
			visible: new Set(all),
			eligible: new Set(all),
		});
		expect(pool.length).toBeLessThanOrEqual(STUDIO_LIVE_SURFACE_MAX);
		expect(pool).toEqual(all.slice(0, STUDIO_LIVE_SURFACE_MAX));
	});

	it("releases off-screen frames and ineligible frames", () => {
		const eligible = new Set(["a", "b", "c"]);
		expect(
			planStudioLiveSurfaces({
				selected: ["b"],
				visible: new Set(["c"]),
				eligible,
			}),
		).toEqual(["b", "c"]);
		expect(
			planStudioLiveSurfaces({
				selected: [],
				visible: new Set(["a", "b"]),
				eligible: new Set(["b"]),
			}),
		).toEqual(["b"]);
	});

	it("keeps a pinned inspected frame and a selected frame even off-screen", () => {
		expect(
			planStudioLiveSurfaces({
				selected: ["sel"],
				visible: new Set(["v"]),
				eligible: new Set(["x", "sel", "v", "pin"]),
				pinned: new Set(["pin"]),
			}),
		).toEqual(["pin", "sel", "v"]);
	});

	it("does not mount frames without committed HTML", () => {
		expect(
			planStudioLiveSurfaces({
				selected: ["empty"],
				visible: new Set(["empty", "full"]),
				eligible: new Set(["full"]),
			}),
		).toEqual(["full"]);
	});

	it("prioritizes actual viewport frames over prewarmed frames in normal mode", () => {
		const near = ids(STUDIO_LIVE_SURFACE_MAX);
		const visible = new Set(["first", "middle", "last"]);
		const pool = planStudioLiveSurfaces({
			selected: ["selected"],
			visible,
			prewarm: new Set(near),
			eligible: new Set([...near, ...visible, "selected"]),
		});
		expect(pool).toEqual([
			"selected",
			...visible,
			...near.slice(0, STUDIO_LIVE_SURFACE_MAX - visible.size - 1),
		]);
	});

	it("keeps every visible Pencil frame and the inspected frame beyond the cap", () => {
		const visible = ids(STUDIO_LIVE_SURFACE_MAX + 3);
		const pool = planStudioLiveSurfaces({
			selected: ["selected"],
			visible: new Set([...visible, "no-html"]),
			prewarm: new Set(["near"]),
			eligible: new Set([...visible, "inspected", "selected", "near", "far"]),
			pinned: new Set(["inspected"]),
			inspectMode: true,
		});
		expect(pool).toEqual(["inspected", "selected", ...visible]);
	});

	it("uses a narrow prewarm band instead of a global 600px margin", () => {
		expect(STUDIO_LIVE_VISIBILITY_MARGIN_PX).toBeGreaterThan(0);
		expect(STUDIO_LIVE_VISIBILITY_MARGIN_PX).toBeLessThan(200);
	});
});

describe("useStudioLivePool", () => {
	it("mounts multiple HTML frames and releases them when they leave view", () => {
		const frames = ids(4).map((id) => ({
			id,
			htmlCode: "<html></html>",
			status: "ready",
		}));
		const { result } = renderHook(() =>
			useStudioLivePool({
				frames,
				selectedFrameId: null,
				inspectFrameId: null,
			}),
		);
		act(() => {
			result.current.reportVisibility("f-0", true);
			result.current.reportVisibility("f-1", true);
			result.current.reportVisibility("f-2", true);
		});
		expect(result.current.pool).toEqual(["f-0", "f-1", "f-2"]);
		act(() => result.current.reportVisibility("f-0", false));
		expect(result.current.pool).toEqual(["f-1", "f-2"]);
		act(() => result.current.reportVisibility("f-0", true));
		expect(result.current.pool).toEqual(["f-1", "f-2", "f-0"]);
	});

	it("mounts a newly visible Pencil frame despite a full pool and restores the normal cap", () => {
		const last = "newly-visible";
		const visible = ids(STUDIO_LIVE_SURFACE_MAX);
		const all = [...visible, last];
		const frames = all.map((id) => ({ id, htmlCode: "<html></html>" }));
		const { result, rerender } = renderHook(
			({ inspectMode }) =>
				useStudioLivePool({
					frames,
					selectedFrameId: null,
					inspectFrameId: null,
					inspectMode,
				}),
			{ initialProps: { inspectMode: false } },
		);
		act(() => {
			for (const id of visible) {
				result.current.reportVisibility(id, true);
			}
			result.current.reportVisibility(last, true, "prewarm");
		});
		rerender({ inspectMode: true });
		expect(result.current.pool).toEqual(visible);
		act(() => result.current.reportVisibility(last, true));
		expect(result.current.pool).toEqual(all);
		act(() => {
			result.current.reportVisibility(last, false);
			result.current.reportVisibility(last, false, "prewarm");
		});
		expect(result.current.pool).toEqual(visible);
		act(() => result.current.reportVisibility(last, true));
		expect(result.current.pool).toEqual(all);
		rerender({ inspectMode: false });
		expect(result.current.pool).toEqual(visible);
	});
});

describe("frame isolation", () => {
	it("a failure in one frame's slots does not touch a sibling", () => {
		const document: StudioLiveDocument = {
			keyId: "a1",
			channel: "ca",
			html: "<html></html>",
			projectId: "p",
			frameId: "f",
			baseRevision: 1,
			baseHash: "a".repeat(64),
			elements: [],
			unresolvedAssets: 0,
			unrenderedIcons: 0,
		};
		const a = reduceStudioLiveSlots(emptyStudioLiveSlots, {
			type: "document",
			document,
		});
		const b = reduceStudioLiveSlots(a, {
			type: "failed",
			failure: "document-failed",
			message: "x",
		});
		expect(a.incoming?.channel).toBe("ca");
		expect(studioLiveReadiness(b).phase).toBe("failed");
		expect(studioLiveReadiness(a).phase).toBe("loading");
	});
});

describe("zoom/pan coordinate model", () => {
	it("round-trips artboard and screen space at any zoom", () => {
		for (const zoom of [0.35, 0.65, 1, 2]) {
			const origin = { left: 120, top: 80 };
			const rect = { x: 10, y: 20, width: 100, height: 40 };
			const screen = artboardRectToScreen(rect, origin, zoom);
			expect(screen).toEqual({
				x: 120 + 10 * zoom,
				y: 80 + 20 * zoom,
				width: 100 * zoom,
				height: 40 * zoom,
			});
			const back = screenPointToArtboard(
				{ x: screen.x, y: screen.y },
				origin,
				zoom,
			);
			expect(back.x).toBeCloseTo(10);
			expect(back.y).toBeCloseTo(20);
		}
	});
	it("clamps overlays to the artboard and drops fully hidden ones", () => {
		const artboard = { width: 390, height: 800 };
		expect(
			clampStudioRectToArtboard(
				{ x: -10, y: 790, width: 50, height: 50 },
				artboard,
			),
		).toEqual({ x: 0, y: 790, width: 40, height: 10 });
		expect(
			clampStudioRectToArtboard(
				{ x: 400, y: 0, width: 50, height: 50 },
				artboard,
			),
		).toBeNull();
	});
});

describe("viewport units are pinned so live matches the document", () => {
	it("rewrites vh in css without touching other units", () => {
		expect(pinStudioViewportUnits("min-height:100vh;width:50vw")).toBe(
			"min-height:calc(100 * var(--ev-vh));width:50vw",
		);
		expect(pinStudioViewportUnits("height:50.5dvh")).toContain("var(--ev-vh)");
	});
});
