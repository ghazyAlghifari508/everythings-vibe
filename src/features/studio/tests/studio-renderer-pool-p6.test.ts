import { describe, expect, it } from "vitest";
import { pinStudioViewportUnits } from "../services/studio-live-viewport";
import {
	STUDIO_LIVE_SURFACE_MAX,
	type StudioRendererReadiness,
} from "../types/studio-renderer";
import {
	emptyStudioLiveSlots,
	reduceStudioLiveSlots,
	type StudioLiveDocument,
	studioLiveReadiness,
} from "../utils/studio-live-slots";
import {
	planStudioLiveSurfaces,
	studioHtmlStamp,
} from "../utils/studio-renderer";
import {
	artboardRectToScreen,
	clampStudioRectToArtboard,
	screenPointToArtboard,
} from "../utils/studio-renderer-geometry";

const _metrics = { scrollWidth: 1440, scrollHeight: 2400 };
const doc = (keyId: string, channel: string): StudioLiveDocument => ({
	keyId,
	channel,
	html: "<html></html>",
	projectId: "p",
	frameId: "f",
	baseRevision: 1,
	baseHash: "a".repeat(64),
	elements: [],
	unresolvedAssets: 0,
	unrenderedIcons: 0,
});
const _ready = (
	extra: Partial<Extract<StudioRendererReadiness, { phase: "ready" }>> = {},
): StudioRendererReadiness => ({
	phase: "ready",
	unresolvedAssets: 0,
	unrenderedIcons: 0,
	scrollWidth: 1440,
	scrollHeight: 2400,
	...extra,
});
const _key = {
	projectId: "p",
	frameId: "f",
	revision: 7,
	htmlStamp: studioHtmlStamp("<p>a</p>"),
	attempt: 0,
};

describe("bounded live pool", () => {
	const eligible = new Set(["a", "b", "c", "d", "e"]);
	it("never exceeds the cap", () => {
		const pool = planStudioLiveSurfaces({
			previous: ["a", "b", "c"],
			selected: ["d", "e"],
			eligible,
			hidden: new Set(),
		});
		expect(pool.length).toBeLessThanOrEqual(STUDIO_LIVE_SURFACE_MAX);
		expect(pool.slice(0, 2)).toEqual(["d", "e"]);
	});
	it("releases off-screen frames and frames that stopped being eligible", () => {
		expect(
			planStudioLiveSurfaces({
				previous: ["a", "b"],
				selected: ["c"],
				eligible: new Set(["a", "c"]),
				hidden: new Set(["a"]),
			}),
		).toEqual(["c"]);
	});
	it("keeps a pinned inspected frame even while off-screen", () => {
		expect(
			planStudioLiveSurfaces({
				previous: [],
				selected: ["a"],
				eligible,
				hidden: new Set(["a"]),
				pinned: new Set(["a"]),
			}),
		).toEqual(["a"]);
	});
	it("does not prewarm ineligible frames", () => {
		expect(
			planStudioLiveSurfaces({
				previous: [],
				selected: ["zzz"],
				eligible,
				hidden: new Set(),
			}),
		).toEqual([]);
	});
});

describe("frame isolation", () => {
	it("a failure in one frame's slots does not touch a sibling", () => {
		const a = reduceStudioLiveSlots(emptyStudioLiveSlots, {
			type: "document",
			document: doc("a1", "ca"),
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

describe("viewport units are pinned so live matches the capture", () => {
	it("rewrites vh in css without touching other units", () => {
		expect(pinStudioViewportUnits("min-height:100vh;width:50vw")).toBe(
			"min-height:calc(100 * var(--ev-vh));width:50vw",
		);
		expect(pinStudioViewportUnits("height:50.5dvh")).toContain("var(--ev-vh)");
	});
});
