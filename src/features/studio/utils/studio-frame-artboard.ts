export type StudioFrameArtboardMode =
	| "shimmer"
	| "html"
	| "generation-failed"
	| "html-unavailable"
	| "renderer-failed";

/**
 * Resolves the single artboard state. The committed HTML is the source of
 * truth: once it exists, the artboard is an HTML surface. Screenshot capture is
 * not a state input and can never gate, replace or delay it.
 *
 * A renderer failure with a preserved predecessor stays in `html` mode and is
 * reported by the honest status strip; only a failure with no document at all
 * becomes a terminal renderer panel.
 */
export function resolveFrameArtboardMode(input: {
	status: string;
	hasRenderableHtml: boolean;
	rendererFailure: string | null;
	hasActiveDocument: boolean;
}): StudioFrameArtboardMode {
	if (!input.hasRenderableHtml) {
		if (input.status === "failed") return "generation-failed";
		if (input.status === "ready") return "html-unavailable";
		return "shimmer";
	}
	if (input.rendererFailure && !input.hasActiveDocument)
		return "renderer-failed";
	return "html";
}
