import {
	STUDIO_CANVAS_COMPOSER_INSET_PX,
	STUDIO_CANVAS_FIT_PADDING_PX,
	STUDIO_CANVAS_FRAME_PADDING_PX,
	STUDIO_CANVAS_HEADER_INSET_PX,
	STUDIO_CANVAS_MIN_VISIBLE_PX,
} from "@/features/studio/types/studio-constants";
import {
	computeCanvasTrack,
	type StudioCanvasAvailable,
	type StudioCanvasFrameBounds,
	type StudioCanvasView,
} from "@/features/studio/utils/studio-canvas-fit";

export interface StudioCanvasViewLimits {
	minZoom: number;
	maxZoom: number;
}

const STORAGE_PREFIX = "everythings_vibe_studio_view:";

/**
 * Per-project view preference. Zoom and pan are canvas chrome, not project
 * data: localStorage mirrors the codebase explorer's expansion preference and
 * keeps wheel gestures off the database entirely.
 */
export function studioCanvasViewStorageKey(projectId: string): string {
	return `${STORAGE_PREFIX}${projectId}`;
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

/**
 * Parses a stored view defensively. Anything that is not a usable number pair
 * is discarded, and the restored zoom is clamped into the live limits so an
 * older or hand-edited value can never produce an unusable scale.
 */
export function parseStudioCanvasView(
	raw: string | null,
	limits: StudioCanvasViewLimits,
): StudioCanvasView | null {
	if (!raw) return null;
	let data: unknown;
	try {
		data = JSON.parse(raw);
	} catch {
		return null;
	}
	if (typeof data !== "object" || data === null) return null;
	const { zoom, pan } = data as { zoom?: unknown; pan?: unknown };
	if (!isFiniteNumber(zoom) || zoom <= 0) return null;
	if (typeof pan !== "object" || pan === null) return null;
	const { x, y } = pan as { x?: unknown; y?: unknown };
	if (!isFiniteNumber(x) || !isFiniteNumber(y)) return null;
	return {
		zoom: Math.min(limits.maxZoom, Math.max(limits.minZoom, zoom)),
		pan: { x, y },
	};
}

export function readStudioCanvasView(
	projectId: string,
	limits: StudioCanvasViewLimits,
): StudioCanvasView | null {
	if (typeof window === "undefined" || !projectId) return null;
	try {
		return parseStudioCanvasView(
			localStorage.getItem(studioCanvasViewStorageKey(projectId)),
			limits,
		);
	} catch {
		return null;
	}
}

export function writeStudioCanvasView(
	projectId: string,
	view: StudioCanvasView,
): void {
	if (typeof window === "undefined" || !projectId) return;
	try {
		localStorage.setItem(
			studioCanvasViewStorageKey(projectId),
			JSON.stringify(view),
		);
	} catch {
		// Storage can be full or blocked; the canvas still works without it.
	}
}

/**
 * A restored view is only worth keeping when the live project is still on
 * screen. Frame counts and canvas sizes change between sessions, so a stored
 * pan can otherwise open on empty space with no way back except Fit All.
 */
export function isStudioCanvasViewVisible(
	view: StudioCanvasView,
	bounds: StudioCanvasFrameBounds[],
	available: StudioCanvasAvailable,
): boolean {
	if (!bounds.length) return false;
	const track = computeCanvasTrack(bounds);
	const contentLeft = view.pan.x + STUDIO_CANVAS_FRAME_PADDING_PX * view.zoom;
	const contentTop = view.pan.y + STUDIO_CANVAS_FRAME_PADDING_PX * view.zoom;
	const contentRight =
		contentLeft +
		Math.max(0, track.width - STUDIO_CANVAS_FIT_PADDING_PX) * view.zoom;
	const contentBottom =
		contentTop +
		Math.max(0, track.height - STUDIO_CANVAS_FIT_PADDING_PX) * view.zoom;
	const usableBottom = available.height - STUDIO_CANVAS_COMPOSER_INSET_PX;
	const overlapX =
		Math.min(contentRight, available.width) - Math.max(contentLeft, 0);
	const overlapY =
		Math.min(contentBottom, usableBottom) -
		Math.max(contentTop, STUDIO_CANVAS_HEADER_INSET_PX);
	return (
		overlapX >= STUDIO_CANVAS_MIN_VISIBLE_PX &&
		overlapY >= STUDIO_CANVAS_MIN_VISIBLE_PX
	);
}
