/**
 * Whether the frame's artboard is still waiting for its real visual. This is
 * the single source of truth for the shimmer lifecycle: queued and generating
 * frames shimmer, a frame with HTML but no displayable preview keeps
 * shimmering, and a frame whose preview failed must not shimmer at all.
 */
export function isFrameVisualPending(
	status: string,
	hasVisual: boolean,
	hasVisualError: boolean,
): boolean {
	if (status === "failed") return false;
	if (status === "ready") return !hasVisual && !hasVisualError;
	return true;
}

export type StudioFrameArtboardMode =
	| "shimmer"
	| "preview"
	| "visual-error"
	| "generation-failed"
	| "preview-unavailable";

/**
 * Resolves what the artboard must render. Exactly one mode wins, so a frame can
 * never shimmer forever with no explanation: a ready frame whose stored HTML is
 * missing resolves to `preview-unavailable`, and a capture failure resolves to
 * `visual-error` with a targeted retry instead of an endless shimmer.
 */
export function resolveFrameArtboardMode(input: {
	status: string;
	hasRenderableHtml: boolean;
	hasVisual: boolean;
	hasVisualError: boolean;
}): StudioFrameArtboardMode {
	if (input.status === "failed") return "generation-failed";
	if (input.status === "ready" && !input.hasRenderableHtml)
		return "preview-unavailable";
	if (isFrameVisualPending(input.status, input.hasVisual, input.hasVisualError))
		return "shimmer";
	if (input.hasVisualError) return "visual-error";
	if (input.hasVisual) return "preview";
	return "visual-error";
}

/**
 * Reads the server's capture-failure explanation from the frame visual
 * response. The pipeline distinguishes a failed capture from a missing HTML
 * payload, so the artboard can say which problem actually happened instead of
 * collapsing every failure into one generic sentence.
 */
export function readFrameVisualError(data: unknown): string {
	if (typeof data === "object" && data !== null && "error" in data) {
		const message = data.error;
		if (typeof message === "string" && message.trim()) return message;
	}
	return "Gagal menyiapkan visual frame.";
}
