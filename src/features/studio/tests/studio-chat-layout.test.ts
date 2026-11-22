import { describe, expect, it } from "vitest";
import {
	STUDIO_CHAT_PANEL_MARGIN_PX,
	STUDIO_CHAT_PANEL_MAX_WIDTH_PX,
	STUDIO_CHAT_PANEL_MIN_WIDTH_PX,
} from "../types/studio-constants";
import {
	computeCanvasFit,
	computeCanvasInitialView,
} from "../utils/studio-canvas-fit";
import {
	studioChatPanelInsetPx,
	studioChatPanelWidthPx,
} from "../utils/studio-chat-layout";

describe("floating chat panel geometry", () => {
	it("keeps its width inside the allowed range at every desktop width", () => {
		for (const viewport of [1024, 1280, 1920, 3840]) {
			const width = studioChatPanelWidthPx(viewport);
			expect(width).toBeGreaterThanOrEqual(STUDIO_CHAT_PANEL_MIN_WIDTH_PX);
			expect(width).toBeLessThanOrEqual(STUDIO_CHAT_PANEL_MAX_WIDTH_PX);
		}
	});
	it("reserves a visible margin on both sides, so it never reads as an attached sidebar", () => {
		expect(STUDIO_CHAT_PANEL_MARGIN_PX).toBeGreaterThan(0);
		expect(studioChatPanelInsetPx(1280)).toBe(
			studioChatPanelWidthPx(1280) + STUDIO_CHAT_PANEL_MARGIN_PX * 2,
		);
	});
});

describe("canvas framing beside the panel", () => {
	const bounds = [{ width: 1280, height: 900 }];
	const available = { width: 1440, height: 900 };
	it("shifts the opening view right by exactly the panel inset when zoom is unchanged", () => {
		// Wide enough that the preferred zoom wins with and without the panel.
		const wide = { width: 2400, height: 900 };
		const input = { bounds, minZoom: 0.35, maxZoom: 2, preferredZoom: 0.65 };
		const open = computeCanvasInitialView({
			...input,
			available: { ...wide, insetLeft: 400 },
		});
		const closed = computeCanvasInitialView({ ...input, available: wide });
		expect(open.zoom).toBe(closed.zoom);
		expect(open.pan.x - closed.pan.x).toBe(400);
		expect(open.pan.y).toBe(closed.pan.y);
	});
	it("fits all frames inside the space the panel leaves free", () => {
		const view = computeCanvasFit({
			bounds: [
				{ width: 390, height: 844 },
				{ width: 390, height: 844 },
			],
			available: { ...available, insetLeft: 400 },
			minZoom: 0.35,
			maxZoom: 2,
		});
		expect(view.pan.x).toBeGreaterThanOrEqual(400);
	});
	it("treats a missing inset as no overlay", () => {
		const input = { bounds, minZoom: 0.35, maxZoom: 2 };
		expect(computeCanvasFit({ ...input, available })).toEqual(
			computeCanvasFit({
				...input,
				available: { ...available, insetLeft: 0 },
			}),
		);
	});
});
