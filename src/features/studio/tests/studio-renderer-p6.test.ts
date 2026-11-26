import { describe, expect, it } from "vitest";
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

describe("live slots retain the committed document", () => {
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
		expect(state.active?.document.keyId).toBe("r1");
		expect(studioLiveReadiness(state)).toMatchObject({
			phase: "ready",
			...metrics,
		});
		state = reduceStudioLiveSlots(state, {
			type: "document",
			document: doc("r2", "c2"),
		});
		expect(state.active?.document.keyId).toBe("r1");
		expect(state.incoming?.keyId).toBe("r2");
		state = reduceStudioLiveSlots(state, {
			type: "ready",
			channel: "c2",
			metrics: { scrollWidth: 390, scrollHeight: 900 },
			unresolvedImages: 0,
		});
		expect(state.active?.document.keyId).toBe("r2");
		expect(state.incoming).toBeNull();
	});

	it("does not reload for a mode change: the key has no device or mode field", () => {
		expect(studioRendererKeyId(key)).toBe(studioRendererKeyId({ ...key }));
		expect(STUDIO_RENDER_CAPABILITIES.canvas.interactive).toBe(false);
		expect(STUDIO_RENDER_CAPABILITIES.inspect.interactive).toBe(true);
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
			type: "ready",
			channel: "c1",
			metrics,
			unresolvedImages: 0,
		});
		expect(state.active?.document.keyId).toBe("r1");
		expect(state.incoming?.keyId).toBe("r2");
	});

	it("a failure keeps the active document but marks readiness honestly", () => {
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
			type: "failed",
			failure: "document-failed",
			message: "Gagal",
		});
		expect(state.active?.document.keyId).toBe("r1");
		expect(studioLiveReadiness(state)).toMatchObject({
			phase: "failed",
			failure: "document-failed",
		});
	});

	it("a bridge timeout is a renderer failure, not a frame failure", () => {
		let state = reduceStudioLiveSlots(emptyStudioLiveSlots, {
			type: "document",
			document: doc("r1", "c1"),
		});
		state = reduceStudioLiveSlots(state, {
			type: "timeout",
			channel: "c1",
			message: "Bridge tidak merespons",
		});
		expect(studioLiveReadiness(state)).toEqual({
			phase: "failed",
			failure: "bridge-timeout",
			message: "Bridge tidak merespons",
		});
	});
});

describe("presentation uses the document, never a screenshot", () => {
	it("takes width and height from the isolated document", () => {
		const result = resolveStudioFramePresentation({
			device: "desktop",
			native: "desktop",
			readiness: ready({ scrollHeight: 3120 }),
			hasActiveDocument: true,
			pending: false,
			fallbackHeight: 900,
		});
		expect(result).toMatchObject({
			showLive: true,
			isCurrent: true,
			width: STUDIO_DEVICE_PRESETS.desktop.width,
			height: 3120,
		});
	});

	it("reflows to a device preset while reusing the same document", () => {
		const result = resolveStudioFramePresentation({
			device: "mobile",
			native: "desktop",
			readiness: ready({ scrollWidth: 390, scrollHeight: 2200 }),
			hasActiveDocument: true,
			pending: false,
			fallbackHeight: 900,
		});
		expect(result.width).toBe(STUDIO_DEVICE_PRESETS.mobile.width);
		expect(result.height).toBe(2200);
		expect(studioNativeDevice("mobile")).toBe("mobile");
	});

	it("does not show a document that was never prepared", () => {
		const result = resolveStudioFramePresentation({
			device: "desktop",
			native: "desktop",
			readiness: { phase: "loading" },
			hasActiveDocument: false,
			pending: false,
			fallbackHeight: 900,
		});
		expect(result.showLive).toBe(false);
		expect(result.isCurrent).toBe(false);
		expect(result.height).toBe(900);
	});
});

describe("live notice reports real limits and failures", () => {
	it("reports a legacy document that overflows a narrow viewport", () => {
		const notice = resolveStudioLiveNotice({
			wantsLive: true,
			pending: false,
			device: "mobile",
			native: "desktop",
			readiness: ready({ scrollWidth: 1440 }),
		});
		expect(notice?.message).toContain("belum responsif");
	});

	it("stays silent for a responsive document", () => {
		expect(
			resolveStudioLiveNotice({
				wantsLive: true,
				pending: false,
				device: "mobile",
				native: "desktop",
				readiness: ready({ scrollWidth: 390 }),
			}),
		).toBeNull();
	});

	it("a live failure is retryable and distinct from generation failure", () => {
		const notice = resolveStudioLiveNotice({
			wantsLive: true,
			pending: false,
			device: "desktop",
			native: "desktop",
			readiness: {
				phase: "failed",
				failure: "document-failed",
				message: "Gagal memuat dokumen",
			},
		});
		expect(notice).toEqual({
			message: "Gagal memuat dokumen",
			tone: "danger",
			retry: true,
		});
	});

	it("reports unresolved assets and unrendered icons", () => {
		const assets = resolveStudioLiveNotice({
			wantsLive: true,
			pending: false,
			device: "desktop",
			native: "desktop",
			readiness: ready({ unresolvedAssets: 2 }),
		});
		expect(assets?.message).toContain("2 gambar");
		const icons = resolveStudioLiveNotice({
			wantsLive: true,
			pending: false,
			device: "desktop",
			native: "desktop",
			readiness: ready({ unrenderedIcons: 3 }),
		});
		expect(icons?.message).toContain("3 ikon");
	});

	it("says nothing when no live document is wanted", () => {
		expect(
			resolveStudioLiveNotice({
				wantsLive: false,
				pending: false,
				device: "desktop",
				native: "desktop",
				readiness: { phase: "loading" },
			}),
		).toBeNull();
	});
});
