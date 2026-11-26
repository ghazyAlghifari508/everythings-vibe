import { STUDIO_PREVIOUS_HTML_MAX_CHARS } from "../types/studio-constants";
import { StudioFrameError } from "./studio-frame-errors";

/**
 * A revision must never receive a clipped or rewritten document: the model
 * cannot preserve what it never saw, and a "complete" document returned from a
 * partial input is how content disappears.
 *
 * Compaction is deliberately absent. Whitespace between elements is meaningful
 * (`<span>Total</span> <span>Rp150.000</span>` renders one space), and a DOM
 * comparison cannot prove that removing it keeps the page intact. Retaining the
 * exact text nodes matters more than saving context, so a document above the
 * supported budget is refused and the committed design stays untouched.
 */
export function prepareStudioExistingDocument(
	html: string,
	maxChars = STUDIO_PREVIOUS_HTML_MAX_CHARS,
): string {
	const trimmed = html.trim();
	if (!trimmed) throw new StudioFrameError("STUDIO_REVISION_TOO_LARGE");
	if (trimmed.length > maxChars)
		throw new StudioFrameError(
			"STUDIO_REVISION_TOO_LARGE",
			`document ${trimmed.length} chars, limit ${maxChars}`,
		);
	return trimmed;
}
