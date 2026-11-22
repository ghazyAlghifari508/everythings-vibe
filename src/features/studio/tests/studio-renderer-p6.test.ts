import { describe, expect, it } from "vitest";
import { STUDIO_CAPTURE_MAX_HEIGHT } from "../types/studio-constants";
import {
	STUDIO_DEVICE_PRESETS,
	STUDIO_RENDER_CAPABILITIES,
	type StudioRendererReadiness,
	studioNativeDevice,
} from "../types/studio-renderer";
import {
	emptyStudioLiveSlots,
	reduceStudioLiveSlots,
	type StudioLiveDocument,
	studioLiveReadiness,
} from "../utils/studio-live-slots";
import {
	resolveStudioFramePresentation,
	resolveStudioLiveNotice,
	studioHtmlStamp,
	studioRendererKeyId,
} from "../utils/studio-renderer";

const metrics = { scrollWidth: 1440, scrollHeight: 2400 };
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
const ready = (
	extra: Partial<Extract<StudioRendererReadiness, { phase: "ready" }>> = {},
): StudioRendererReadiness => ({
	phase: "ready",
	unresolvedAssets: 0,
	unrenderedIcons: 0,
	scrollWidth: 1440,
	scrollHeight: 2400,
	...extra,
});
const key = {
	projectId: "p",
	frameId: "f",
	revision: 7,
	htmlStamp: studioHtmlStamp("<p>a</p>"),
	attempt: 0,
};

describe("renderer key and invalidation", () => {
	it("is stable for identical persisted input and ignores the device", () => {
		expect(studioRendererKeyId(key)).toBe(studioRendererKeyId({ ...key }));
	});
	it.each([
		{ revision: 8 },
		{ htmlStamp: studioHtmlStamp("<p>b</p>") },
		{ attempt: 1 },
		{ frameId: "g" },
		{ projectId: "q" },
	])("changes when %j changes", (change) => {
		expect(studioRendererKeyId({ ...key, ...change })).not.toBe(
			studioRendererKeyId(key),
		);
	});
	it("the key type has no viewport, so a device change cannot refetch", () => {
		expect(Object.keys(key)).not.toContain("viewport");
		expect(Object.keys(key)).not.toContain("device");
	});
});

describe("live slots: ready preview retained, stale results ignored", () => {
	it("keeps the previous document active until the replacement is ready", () => {
		let state = reduceStudioLiveSlots(emptyStudioLiveSlots, {
			type: "document",
			document: doc("r1", "c1"),
		});
		expect(studioLiveReadiness(state).phase).toBe("loading");
		state = reduceStudioLiveSlots(state, {
			type: "ready",
			channel: "c1",
			metrics,
			unresolvedImages: 0,
		});
		expect(state.active?.document.channel).toBe("c1");
		state = reduceStudioLiveSlots(state, {
			type: "document",
			document: doc("r2", "c2"),
		});
		expect(state.active?.document.channel).toBe("c1");
		expect(state.incoming?.channel).toBe("c2");
		expect(studioLiveReadiness(state).phase).toBe("ready");
		state = reduceStudioLiveSlots(state, {
			type: "ready",
			channel: "c2",
			metrics,
			unresolvedImages: 2,
		});
		expect(state.active?.document.channel).toBe("c2");
		expect(state.incoming).toBeNull();
		expect(studioLiveReadiness(state)).toMatchObject({
			phase: "ready",
			unresolvedAssets: 2,
		});
	});
	it("does not reload for the same renderer key (mode change)", () => {
		const first = reduceStudioLiveSlots(emptyStudioLiveSlots, {
			type: "document",
			document: doc("r1", "c1"),
		});
		expect(
			reduceStudioLiveSlots(first, {
				type: "document",
				document: doc("r1", "c9"),
			}),
		).toBe(first);
	});
	it("a late ready from a replaced channel cannot overwrite a newer revision", () => {
		let state = reduceStudioLiveSlots(emptyStudioLiveSlots, {
			type: "document",
			document: doc("r1", "c1"),
		});
		state = reduceStudioLiveSlots(state, {
			type: "ready",
			channel: "c1",
			metrics,
			unresolvedImages: 0,
		});
		state = reduceStudioLiveSlots(state, {
			type: "document",
			document: doc("r2", "c2"),
		});
		state = reduceStudioLiveSlots(state, {
			type: "document",
			document: doc("r3", "c3"),
		});
		const after = reduceStudioLiveSlots(state, {
			type: "ready",
			channel: "c2",
			metrics: { scrollWidth: 1, scrollHeight: 1 },
			unresolvedImages: 0,
		});
		expect(after).toBe(state);
		expect(after.active?.document.channel).toBe("c1");
		expect(after.incoming?.channel).toBe("c3");
	});
	it("a bridge timeout is a renderer failure, not a frame failure", () => {
		let state = reduceStudioLiveSlots(emptyStudioLiveSlots, {
			type: "document",
			document: doc("r1", "c1"),
		});
		state = reduceStudioLiveSlots(state, {
			type: "timeout",
			channel: "c1",
			message: "x",
		});
		expect(studioLiveReadiness(state)).toMatchObject({
			phase: "failed",
			failure: "bridge-timeout",
		});
		const stale = reduceStudioLiveSlots(state, {
			type: "timeout",
			channel: "other",
			message: "y",
		});
		expect(stale).toBe(state);
	});
});

describe("presentation: real viewport, retained preview", () => {
	const visualSize = { width: 1440, height: 3000 };
	it("keeps the screenshot at its own size until live is ready", () => {
		const loading = resolveStudioFramePresentation({
			mode: "inspect",
			device: "desktop",
			native: "desktop",
			readiness: { phase: "loading" },
			visualSize,
			fallbackHeight: 3000,
		});
		expect(loading).toMatchObject({
			showLive: false,
			wantsLive: true,
			width: 1440,
			height: 3000,
		});
	});
	it("native device adopts the screenshot height so the swap cannot shift layout", () => {
		const result = resolveStudioFramePresentation({
			mode: "inspect",
			device: "desktop",
			native: "desktop",
			readiness: ready(),
			visualSize,
			fallbackHeight: 3000,
		});
		expect(result).toMatchObject({ showLive: true, width: 1440, height: 3000 });
	});
	it("ordinary canvas mode on the native device never asks for a live document", () => {
		expect(
			resolveStudioFramePresentation({
				mode: "canvas",
				device: "desktop",
				native: "desktop",
				readiness: { phase: "idle" },
				visualSize,
				fallbackHeight: 3000,
			}).wantsLive,
		).toBe(false);
	});
	it.each([
		"tablet",
		"mobile",
	] as const)("%s changes the real document width and follows measured height", (device) => {
		const result = resolveStudioFramePresentation({
			mode: "canvas",
			device,
			native: "desktop",
			readiness: ready({ scrollHeight: 4200 }),
			visualSize,
			fallbackHeight: 3000,
		});
		expect(result).toMatchObject({
			showLive: true,
			width: STUDIO_DEVICE_PRESETS[device].width,
			height: 4200,
		});
	});
	it("never swaps to a non-native device before the live document is ready", () => {
		const result = resolveStudioFramePresentation({
			mode: "canvas",
			device: "mobile",
			native: "desktop",
			readiness: { phase: "loading" },
			visualSize,
			fallbackHeight: 3000,
		});
		expect(result).toMatchObject({
			showLive: false,
			device: "desktop",
			width: 1440,
		});
	});
	it("clamps measured height to the capture ceiling", () => {
		expect(
			resolveStudioFramePresentation({
				mode: "canvas",
				device: "tablet",
				native: "desktop",
				readiness: ready({ scrollHeight: 10 ** 6 }),
				visualSize,
				fallbackHeight: 3000,
			}).height,
		).toBe(STUDIO_CAPTURE_MAX_HEIGHT);
	});
	it("a screenshot failure with valid HTML recovers through the live document", () => {
		expect(
			resolveStudioFramePresentation({
				mode: "canvas",
				recoverPreview: true,
				device: "desktop",
				native: "desktop",
				readiness: ready(),
				visualSize: null,
				fallbackHeight: 900,
			}),
		).toMatchObject({ showLive: true, width: 1440 });
	});
	it("native devices match the canonical capture widths", () => {
		expect(studioNativeDevice("mobile")).toBe("mobile");
		expect(studioNativeDevice("web")).toBe("desktop");
		expect(STUDIO_DEVICE_PRESETS.desktop.width).toBe(1440);
		expect(STUDIO_DEVICE_PRESETS.mobile.width).toBe(390);
	});
	it("only inspect and prototype grant interaction", () => {
		expect(STUDIO_RENDER_CAPABILITIES.canvas.interactive).toBe(false);
		expect(STUDIO_RENDER_CAPABILITIES.inspect.inspectable).toBe(true);
		expect(STUDIO_RENDER_CAPABILITIES.prototype.inspectable).toBe(false);
	});
});

describe("live notice reports real limits and failures", () => {
	const base = {
		wantsLive: true,
		device: "desktop",
		native: "desktop",
	} as const;
	it("reports a legacy document that overflows a narrow viewport", () => {
		expect(
			resolveStudioLiveNotice({
				...base,
				device: "mobile",
				readiness: ready({ scrollWidth: 1280 }),
			})?.message,
		).toContain("belum responsif");
	});
	it("stays silent for a responsive document", () => {
		expect(
			resolveStudioLiveNotice({
				...base,
				device: "mobile",
				readiness: ready({ scrollWidth: 390 }),
			}),
		).toBeNull();
	});
	it("a live failure is retryable and distinct from generation failure", () => {
		expect(
			resolveStudioLiveNotice({
				...base,
				readiness: {
					phase: "failed",
					failure: "document-failed",
					message: "",
				},
			}),
		).toMatchObject({ tone: "danger", retry: true });
	});
	it("reports unresolved assets and unrendered icons", () => {
		expect(
			resolveStudioLiveNotice({
				...base,
				readiness: ready({ unresolvedAssets: 2 }),
			})?.message,
		).toContain("2 gambar");
		expect(
			resolveStudioLiveNotice({
				...base,
				readiness: ready({ unrenderedIcons: 3 }),
			})?.message,
		).toContain("3 ikon");
	});
	it("says nothing when no live document is wanted", () => {
		expect(
			resolveStudioLiveNotice({
				...base,
				wantsLive: false,
				readiness: { phase: "loading" },
			}),
		).toBeNull();
	});
});
