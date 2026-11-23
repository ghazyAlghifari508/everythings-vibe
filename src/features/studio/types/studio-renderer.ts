import { z } from "zod";

/**
 * Shared renderer contract. One persisted frame revision is presented by the
 * same ephemeral live document in every mode; the mode only decides which
 * capabilities the parent grants it. Nothing here is ever persisted into the
 * frame's HTML.
 */
export const STUDIO_RENDER_MODES = ["canvas", "inspect", "prototype"] as const;
export type StudioRenderMode = (typeof STUDIO_RENDER_MODES)[number];

/** Capabilities the parent grants per mode. Prototype wiring lands with P10. */
export const STUDIO_RENDER_CAPABILITIES: Record<
	StudioRenderMode,
	{ interactive: boolean; inspectable: boolean }
> = {
	canvas: { interactive: false, inspectable: false },
	inspect: { interactive: true, inspectable: true },
	prototype: { interactive: true, inspectable: false },
};

/**
 * Document viewport presets. Presentation metadata only: choosing one resizes
 * the live document's real viewport (media queries respond) and never touches
 * the stored HTML, a revision, a job or credits. `desktop` and `mobile` equal
 * the canonical capture widths, so the native device matches the screenshot.
 */
export const STUDIO_DEVICE_PRESETS = {
	desktop: { width: 1440, height: 900 },
	tablet: { width: 768, height: 1024 },
	mobile: { width: 390, height: 844 },
} as const;

export const STUDIO_DEVICES = ["desktop", "tablet", "mobile"] as const;
export type StudioDevice = keyof typeof STUDIO_DEVICE_PRESETS;

/** Width breakpoints that select the pinned viewport height for `vh` units. */
export const STUDIO_DEVICE_HEIGHT_BREAKPOINTS = {
	mobileMaxWidth: 480,
	tabletMaxWidth: 1024,
} as const;

/** The device a frame shows when nothing else was chosen. */
export function studioNativeDevice(viewport: string): StudioDevice {
	return viewport === "mobile" ? "mobile" : "desktop";
}

export const STUDIO_LIVE_SURFACE_MAX = 3;
export const STUDIO_LIVE_READY_TIMEOUT_MS = 15_000;

export type StudioRendererFailure =
	/** The frame has no generated HTML to render. */
	| "html-unavailable"
	/** The live document could not be fetched or parsed. */
	| "document-failed"
	/** The document loaded but the bridge never reported ready. */
	| "bridge-timeout";

export type StudioRendererReadiness =
	| { phase: "idle" }
	| { phase: "loading" }
	| {
			phase: "ready";
			/** Images whose asset could not be resolved; the document is still usable. */
			unresolvedAssets: number;
			/** `data-lucide` placeholders the isolated document cannot draw. */
			unrenderedIcons: number;
			scrollWidth: number;
			scrollHeight: number;
	  }
	| { phase: "failed"; failure: StudioRendererFailure; message: string };

export interface StudioRendererKey {
	projectId: string;
	frameId: string;
	/** Persisted design revision. Viewport is deliberately absent. */
	revision: number;
	/** Content stamp of the persisted HTML; finalization can change it. */
	htmlStamp: string;
	/** Bumped only by an explicit user retry. */
	attempt: number;
	/** Revision-history comparison source, when rendering a stored snapshot. */
	revisionId?: string;
	side?: "before" | "after";
	/** Bumped by explicit Refresh; never by a device change. */
	refresh?: number;
}

export const studioRendererMetricsSchema = z.strictObject({
	scrollWidth: z.number().finite().nonnegative().max(100_000),
	scrollHeight: z.number().finite().nonnegative().max(100_000),
});
export type StudioRendererMetrics = z.infer<typeof studioRendererMetricsSchema>;

/** Messages the trusted bridge posts about the document itself, not selection. */
export const STUDIO_RENDERER_MESSAGE_TYPES = {
	ready: "studio:renderer:ready",
	metrics: "studio:renderer:metrics",
} as const;
