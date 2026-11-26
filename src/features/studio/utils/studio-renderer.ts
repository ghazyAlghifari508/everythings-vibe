import { STUDIO_RENDER_DOCUMENT_MAX_HEIGHT } from "../types/studio-constants";
import {
	STUDIO_DEVICE_PRESETS,
	STUDIO_LIVE_SURFACE_MAX,
	type StudioDevice,
	type StudioRendererFailure,
	type StudioRendererKey,
	type StudioRendererReadiness,
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
	device: StudioDevice;
	native: StudioDevice;
	readiness: StudioRendererReadiness;
	/** A previously committed document remains visible until its replacement is ready. */
	hasActiveDocument: boolean;
	/** A newer renderer key is still preparing or failed; active is not current. */
	pending: boolean;
	fallbackHeight: number;
}

export interface StudioFramePresentation {
	/** Whether the prepared HTML layer may be shown at all. */
	showLive: boolean;
	/** Whether that layer is the committed revision, not a retained predecessor. */
	isCurrent: boolean;
	/** HTML-first: every renderable frame wants the same isolated document. */
	wantsLive: true;
	device: StudioDevice;
	width: number;
	height: number;
}

/**
 * The artboard is sized by the real isolated document, never by a screenshot.
 * A retained predecessor may stay on screen while a replacement prepares, but
 * `isCurrent` stays false so the UI cannot call it the completed revision.
 */
export function resolveStudioFramePresentation(
	input: StudioFramePresentationInput,
): StudioFramePresentation {
	const preset = STUDIO_DEVICE_PRESETS[input.device];
	const showLive = input.hasActiveDocument;
	const isCurrent =
		showLive && !input.pending && input.readiness.phase === "ready";
	const measured =
		input.readiness.phase === "ready" ? input.readiness.scrollHeight : 0;
	const height = showLive
		? Math.min(
				Math.max(preset.height, Math.ceil(measured)),
				STUDIO_RENDER_DOCUMENT_MAX_HEIGHT,
			)
		: input.fallbackHeight;
	return {
		showLive,
		isCurrent,
		wantsLive: true,
		device: input.device,
		width: preset.width,
		height,
	};
}

export interface StudioLiveNotice {
	message: string;
	tone: "progress" | "danger";
	retry: boolean;
}

const FAILURE_COPY: Record<StudioRendererFailure, string> = {
	"html-unavailable": "HTML layar ini tidak tersedia untuk dirender.",
	"document-failed": "Dokumen HTML gagal disiapkan.",
	"bridge-timeout": "Dokumen HTML tidak merespons.",
};

export function studioFailureCopy(failure: StudioRendererFailure) {
	return FAILURE_COPY[failure];
}

/**
 * A single honest note about the renderer, derived only from real signals. It
 * never changes the frame's generation status. Screenshot capture is not a
 * renderer signal and is never consulted here.
 */
export function resolveStudioLiveNotice(input: {
	wantsLive: boolean;
	pending: boolean;
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
	if (input.pending)
		return {
			message:
				"Menyiapkan revisi terbaru. Dokumen sebelumnya masih ditampilkan.",
			tone: "progress",
			retry: false,
		};
	if (readiness.phase !== "ready")
		return {
			message: "Menyiapkan dokumen HTML terisolasi.",
			tone: "progress",
			retry: false,
		};
	if (readiness.scrollHeight > STUDIO_RENDER_DOCUMENT_MAX_HEIGHT)
		return {
			message: `Dokumen melebihi batas tampilan ${STUDIO_RENDER_DOCUMENT_MAX_HEIGHT}px. HTML tersimpan utuh tanpa pemotongan.`,
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
			message: `${readiness.unresolvedAssets} gambar tidak tersedia pada dokumen terisolasi.`,
			tone: "progress",
			retry: false,
		};
	if (readiness.unrenderedIcons > 0)
		return {
			message: `${readiness.unrenderedIcons} ikon Lucide tidak dirender pada dokumen terisolasi.`,
			tone: "progress",
			retry: false,
		};
	return null;
}

export interface StudioLivePlanInput {
	/** Selected frames are kept even when they drift just outside the viewport. */
	selected: readonly string[];
	/** Frames reported inside the real canvas viewport by the observer. */
	visible: ReadonlySet<string>;
	/** Frames within the prewarm margin, including any actually visible frames. */
	prewarm?: ReadonlySet<string>;
	/** Frames that have committed HTML and can render. */
	eligible: ReadonlySet<string>;
	/** Inspected frames must stay live even off-screen. */
	pinned?: ReadonlySet<string>;
	inspectMode?: boolean;
	max?: number;
}

/** Pencil's visible and pinned documents may overflow the normal renderer budget. */
export function planStudioLiveSurfaces({
	selected,
	visible,
	prewarm,
	eligible,
	pinned,
	inspectMode = false,
	max = STUDIO_LIVE_SURFACE_MAX,
}: StudioLivePlanInput): string[] {
	const pool = new Set<string>();
	const add = (ids: Iterable<string> | undefined, limit: number) => {
		if (!ids) return;
		for (const id of ids) {
			if (pool.size >= limit) break;
			if (eligible.has(id)) pool.add(id);
		}
	};
	const inspectLimit = inspectMode ? Infinity : max;
	add(pinned, inspectLimit);
	add(selected, max);
	add(visible, inspectLimit);
	add(prewarm, max);
	return [...pool];
}
