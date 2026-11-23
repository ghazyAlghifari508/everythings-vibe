import { STUDIO_CAPTURE_MAX_HEIGHT } from "../types/studio-constants";
import {
	STUDIO_DEVICE_PRESETS,
	STUDIO_LIVE_SURFACE_MAX,
	type StudioDevice,
	type StudioRendererFailure,
	type StudioRendererKey,
	type StudioRendererReadiness,
	type StudioRenderMode,
} from "../types/studio-renderer";

/** FNV-1a over the persisted HTML: a cheap content stamp, not a security hash. */
export function studioHtmlStamp(html: string): string {
	let hash = 0x811c9dc5;
	for (let index = 0; index < html.length; index += 1) {
		hash ^= html.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193);
	}
	return `${html.length.toString(36)}-${(hash >>> 0).toString(36)}`;
}

/**
 * Identity of one live document. The viewport/device is intentionally not part
 * of it: resizing the viewport reuses the mounted document, so a device change
 * can never trigger a fetch, a job or a new design revision.
 */
export function studioRendererKeyId(key: StudioRendererKey): string {
	return [
		key.projectId,
		key.frameId,
		key.revision,
		key.htmlStamp,
		key.attempt,
		key.revisionId ?? "",
		key.side ?? "",
		key.refresh ?? 0,
	].join("|");
}

export interface StudioFramePresentationInput {
	mode: StudioRenderMode;
	/** The screenshot failed but valid HTML exists: the live document recovers it. */
	recoverPreview?: boolean;
	device: StudioDevice;
	native: StudioDevice;
	readiness: StudioRendererReadiness;
	visualSize: { width: number; height: number } | null;
	/** Height used when the screenshot or nothing live is shown. */
	fallbackHeight: number;
}

export interface StudioFramePresentation {
	/** Whether the live document is the visible layer. */
	showLive: boolean;
	/** Whether the current mode or device needs a live document at all. */
	wantsLive: boolean;
	device: StudioDevice;
	width: number;
	height: number;
}

/**
 * Decides what the artboard shows. The ready screenshot stays visible until the
 * live document reports ready; the artboard only adopts a non-native device
 * once real content can fill it, so a screenshot is never stretched or
 * shrunk to fake a responsive layout.
 */
export function resolveStudioFramePresentation(
	input: StudioFramePresentationInput,
): StudioFramePresentation {
	const wantsLive =
		input.mode !== "canvas" ||
		input.device !== input.native ||
		Boolean(input.recoverPreview);
	const showLive = wantsLive && input.readiness.phase === "ready";
	const device = showLive ? input.device : input.native;
	const preset = STUDIO_DEVICE_PRESETS[device];
	const nativeShown = device === input.native && input.visualSize !== null;
	if (!showLive && nativeShown && input.visualSize)
		return {
			showLive,
			wantsLive,
			device,
			width: input.visualSize.width,
			height: input.fallbackHeight,
		};
	if (!showLive)
		return {
			showLive,
			wantsLive,
			device,
			width: preset.width,
			height: input.fallbackHeight,
		};
	const measured =
		input.readiness.phase === "ready" ? input.readiness.scrollHeight : 0;
	// Same artboard height as the screenshot while on the native device, so the
	// swap to the live document cannot shift layout.
	const height =
		nativeShown && input.visualSize
			? input.visualSize.height
			: Math.min(
					Math.max(preset.height, Math.ceil(measured)),
					STUDIO_CAPTURE_MAX_HEIGHT,
				);
	return { showLive, wantsLive, device, width: preset.width, height };
}

export interface StudioLiveNotice {
	message: string;
	tone: "progress" | "danger";
	retry: boolean;
}

const FAILURE_COPY: Record<StudioRendererFailure, string> = {
	"html-unavailable": "HTML layar ini tidak tersedia untuk tampilan langsung.",
	"document-failed":
		"Tampilan langsung belum dapat dimuat. Pratinjau tetap tersedia.",
	"bridge-timeout":
		"Tampilan langsung tidak merespons. Pratinjau tetap tersedia.",
};

export function studioFailureCopy(failure: StudioRendererFailure) {
	return FAILURE_COPY[failure];
}

/**
 * A single honest note about the live document, derived only from real
 * readiness signals. It never changes the frame's generation status.
 */
export function resolveStudioLiveNotice(input: {
	wantsLive: boolean;
	device: StudioDevice;
	native: StudioDevice;
	readiness: StudioRendererReadiness;
}): StudioLiveNotice | null {
	if (!input.wantsLive) return null;
	const { readiness } = input;
	if (readiness.phase === "failed")
		return {
			message: readiness.message || studioFailureCopy(readiness.failure),
			tone: "danger",
			retry: true,
		};
	if (readiness.phase !== "ready")
		return {
			message: "Menyiapkan tampilan langsung.",
			tone: "progress",
			retry: false,
		};
	const width = STUDIO_DEVICE_PRESETS[input.device].width;
	if (input.device !== input.native && readiness.scrollWidth > width + 1)
		return {
			message: `Dokumen ini belum responsif pada ${width}px: konten melebihi lebar viewport. HTML tidak diubah.`,
			tone: "progress",
			retry: false,
		};
	if (readiness.unresolvedAssets > 0)
		return {
			message: `${readiness.unresolvedAssets} gambar tidak tersedia pada tampilan langsung.`,
			tone: "progress",
			retry: false,
		};
	if (readiness.unrenderedIcons > 0)
		return {
			message: `${readiness.unrenderedIcons} ikon Lucide tidak dirender pada tampilan langsung.`,
			tone: "progress",
			retry: false,
		};
	return null;
}

export interface StudioLivePlanInput {
	/** Previously live ids, most recent first. */
	previous: readonly string[];
	selected: readonly string[];
	/** Frames that have valid HTML and finished generating. */
	eligible: ReadonlySet<string>;
	/** Frames reported as off-screen by their artboard observer. */
	hidden: ReadonlySet<string>;
	/** Frames that must stay live even off-screen, e.g. while inspecting. */
	pinned?: ReadonlySet<string>;
	max?: number;
}

/**
 * Bounded live-surface pool. Selected frames are prewarmed first, then recent
 * frames that are still on screen; everything else is released so its iframe
 * and fetched document are dropped.
 */
export function planStudioLiveSurfaces({
	previous,
	selected,
	eligible,
	hidden,
	pinned,
	max = STUDIO_LIVE_SURFACE_MAX,
}: StudioLivePlanInput): string[] {
	const ordered: string[] = [];
	const add = (id: string) => {
		if (!ordered.includes(id)) ordered.push(id);
	};
	for (const id of selected)
		if (eligible.has(id) && (!hidden.has(id) || pinned?.has(id))) add(id);
	const keepSelected = ordered.slice(0, max);
	const pool = [...keepSelected];
	for (const id of previous) {
		if (pool.length >= max) break;
		if (pool.includes(id) || !eligible.has(id) || hidden.has(id)) continue;
		pool.push(id);
	}
	return pool;
}
