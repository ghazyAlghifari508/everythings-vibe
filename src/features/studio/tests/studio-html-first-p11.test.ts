// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
	isolateStudioDocument,
	studioIsolationCsp,
} from "@/features/studio/services/studio-document-isolation";
import {
	rewriteBundledAssets,
	STUDIO_EXPORT_INTERACTIVITY,
} from "@/features/studio/services/studio-export";
import { STUDIO_RENDER_DOCUMENT_MAX_HEIGHT } from "@/features/studio/types/studio-constants";
import {
	STUDIO_LIVE_SURFACE_MAX,
	STUDIO_RENDER_CAPABILITIES,
} from "@/features/studio/types/studio-renderer";
import { resolveFrameArtboardMode } from "@/features/studio/utils/studio-frame-artboard";
import {
	planStudioLiveSurfaces,
	resolveStudioFramePresentation,
	resolveStudioLiveNotice,
	studioHtmlStamp,
	studioRendererKeyId,
} from "@/features/studio/utils/studio-renderer";

const baseKey = {
	projectId: "p-1",
	frameId: "f-1",
	revision: 4,
	htmlStamp: "abc-1",
	attempt: 0,
};

const ready = {
	phase: "ready" as const,
	unresolvedAssets: 0,
	unrenderedIcons: 0,
	scrollWidth: 1440,
	scrollHeight: 2400,
};

describe("P11 — HTML-first renderer invariants", () => {
	it("renders a committed HTML document at its own measured height", () => {
		const presentation = resolveStudioFramePresentation({
			device: "desktop",
			native: "desktop",
			readiness: ready,
			hasActiveDocument: true,
			pending: false,
			fallbackHeight: 900,
		});
		expect(presentation).toMatchObject({
			showLive: true,
			isCurrent: true,
			wantsLive: true,
			width: 1440,
			height: 2400,
		});
	});

	it("keeps a predecessor visible but never reports it as current", () => {
		const presentation = resolveStudioFramePresentation({
			device: "desktop",
			native: "desktop",
			readiness: ready,
			hasActiveDocument: true,
			pending: true,
			fallbackHeight: 900,
		});
		expect(presentation.showLive).toBe(true);
		expect(presentation.isCurrent).toBe(false);
		expect(
			resolveStudioLiveNotice({
				wantsLive: true,
				pending: true,
				device: "desktop",
				native: "desktop",
				readiness: ready,
			})?.message,
		).toContain("Dokumen sebelumnya");
	});

	it("clamps an extremely long page without truncating the committed HTML", () => {
		const notice = resolveStudioLiveNotice({
			wantsLive: true,
			pending: false,
			device: "desktop",
			native: "desktop",
			readiness: {
				...ready,
				scrollHeight: STUDIO_RENDER_DOCUMENT_MAX_HEIGHT + 10,
			},
		});
		expect(notice?.message).toContain("HTML tersimpan utuh");
		const presentation = resolveStudioFramePresentation({
			device: "desktop",
			native: "desktop",
			readiness: {
				...ready,
				scrollHeight: STUDIO_RENDER_DOCUMENT_MAX_HEIGHT + 10,
			},
			hasActiveDocument: true,
			pending: false,
			fallbackHeight: 900,
		});
		expect(presentation.height).toBe(STUDIO_RENDER_DOCUMENT_MAX_HEIGHT);
	});

	it("reports a real renderer failure with a retry, not a screenshot fallback", () => {
		const notice = resolveStudioLiveNotice({
			wantsLive: true,
			pending: false,
			device: "desktop",
			native: "desktop",
			readiness: {
				phase: "failed",
				failure: "document-failed",
				message: "Dokumen gagal dimuat",
			},
		});
		expect(notice).toEqual({
			message: "Dokumen gagal dimuat",
			tone: "danger",
			retry: true,
		});
	});

	it("keeps the renderer key device-free but revision-sensitive", () => {
		const first = studioRendererKeyId(baseKey);
		expect(studioHtmlStamp("<p>a</p>")).not.toBe(studioHtmlStamp("<p>b</p>"));
		expect(studioRendererKeyId({ ...baseKey, revision: 5 })).not.toBe(first);
		expect(studioRendererKeyId({ ...baseKey, htmlStamp: "abc-2" })).not.toBe(
			first,
		);
		expect(studioRendererKeyId({ ...baseKey, attempt: 1 })).not.toBe(first);
		expect(studioRendererKeyId({ ...baseKey, refresh: 1 })).not.toBe(first);
		expect(studioRendererKeyId({ ...baseKey, side: "before" })).not.toBe(first);
		// Device is not a field of StudioRendererKey at all.
		expect(Object.keys(baseKey)).not.toContain("device");
	});

	it("grants interaction only to Pencil and prototype, never to the canvas", () => {
		expect(STUDIO_RENDER_CAPABILITIES.canvas).toEqual({
			interactive: false,
			inspectable: false,
		});
		expect(STUDIO_RENDER_CAPABILITIES.inspect).toEqual({
			interactive: true,
			inspectable: true,
		});
		expect(STUDIO_RENDER_CAPABILITIES.prototype.interactive).toBe(true);
	});

	it("mounts every visible eligible frame and releases off-screen ones", () => {
		const eligible = new Set(["a", "b", "c"]);
		expect(
			planStudioLiveSurfaces({
				selected: ["b"],
				visible: new Set(["a", "b", "c"]),
				eligible,
			}),
		).toEqual(["b", "a", "c"]);
		expect(
			planStudioLiveSurfaces({
				selected: ["b"],
				visible: new Set(["c"]),
				eligible,
			}),
		).toEqual(["b", "c"]);
	});

	it("prioritizes the inspected frame and respects the safety cap", () => {
		const ids = Array.from({ length: 20 }, (_, index) => `f-${index}`);
		const pool = planStudioLiveSurfaces({
			selected: ["f-2"],
			visible: new Set(ids),
			eligible: new Set(ids),
			pinned: new Set(["f-19"]),
		});
		expect(pool).toHaveLength(STUDIO_LIVE_SURFACE_MAX);
		expect(pool[0]).toBe("f-19");
		expect(pool[1]).toBe("f-2");
	});

	it("chooses the artboard mode solely from committed HTML and renderer state", () => {
		const base = {
			status: "ready",
			rendererFailure: null,
			hasActiveDocument: false,
		};
		expect(resolveFrameArtboardMode({ ...base, hasRenderableHtml: true })).toBe(
			"html",
		);
		expect(
			resolveFrameArtboardMode({ ...base, hasRenderableHtml: false }),
		).toBe("html-unavailable");
		expect(
			resolveFrameArtboardMode({
				...base,
				status: "generating",
				hasRenderableHtml: false,
			}),
		).toBe("shimmer");
		expect(
			resolveFrameArtboardMode({
				...base,
				status: "failed",
				hasRenderableHtml: false,
			}),
		).toBe("generation-failed");
		expect(
			resolveFrameArtboardMode({
				...base,
				hasRenderableHtml: true,
				rendererFailure: "document-failed",
			}),
		).toBe("renderer-failed");
		expect(
			resolveFrameArtboardMode({
				...base,
				hasRenderableHtml: true,
				rendererFailure: "document-failed",
				hasActiveDocument: true,
			}),
		).toBe("html");
	});

	it("isolates generated documents with a nonce-only CSP and no navigation", () => {
		const csp = studioIsolationCsp("channel");
		for (const directive of [
			"default-src 'none'",
			"script-src 'nonce-channel'",
			"script-src-attr 'none'",
			"connect-src 'none'",
			"frame-src 'none'",
			"form-action 'none'",
			"base-uri 'none'",
		])
			expect(csp).toContain(directive);
	});

	it("strips generated scripts, handlers, embeds and navigation targets", async () => {
		const parsed = new DOMParser().parseFromString(
			`<html><head><script>evil()</script></head><body>
				<iframe src="https://evil.test"></iframe>
				<button onclick="evil()">Go</button>
				<a href="https://evil.test">Out</a>
				<p id="kept">Aman</p>
			</body></html>`,
			"text/html",
		);
		const result = await isolateStudioDocument(parsed, {
			origin: "https://app.test",
			anchors: "strip",
		});
		expect(result.unrenderedIcons).toBe(0);
		expect(parsed.querySelector("script")).toBeNull();
		expect(parsed.querySelector("iframe")).toBeNull();
		expect(parsed.querySelector("[onclick]")).toBeNull();
		expect(parsed.querySelector("a")?.getAttribute("href")).toBeNull();
		expect(parsed.querySelector("#kept")?.textContent).toBe("Aman");
	});

	it("never injects editor bridges into the standalone export", () => {
		expect(STUDIO_EXPORT_INTERACTIVITY.prototypeRuntime).toBe(false);
		expect(STUDIO_EXPORT_INTERACTIVITY.note).toContain("HTML statis");
		expect(
			rewriteBundledAssets(
				"<html><body data-ev-editor-overlay>Komited</body></html>",
				new Map(),
			),
		).toContain("data-ev-editor-overlay");
	});
});
