import { extractCleanHtml } from "@/features/studio/utils/clean-html";
import { assembleCanonicalShell } from "./studio-canonical-shell";
import { repairStudioCanonicalPositioning } from "./studio-css-repair";
import type { StudioDesignBlueprint } from "./studio-design-blueprint";
import type { CanonicalDesignSystem } from "./studio-design-tokens";

/**
 * FIX 02 — one final document per screen.
 *
 * The canvas capture and the ZIP export previously each read whatever bytes
 * happened to be persisted, so a screen generated before a canonical CSS fix
 * kept the old shell styling forever while a new screen got the new one. This
 * module is the single transformation that produces the final document, and it
 * is idempotent: running it on its own output changes nothing, never appends a
 * second shell/header/style tag, and never drops screen-authored markup.
 */

export type StudioFrameFinalizeMode = "generate" | "refresh";

export interface StudioFrameFinalizeInput {
	blueprint: StudioDesignBlueprint | null | undefined;
	screen: string | null | undefined;
	tokens: CanonicalDesignSystem | null;
	logoUrl?: string | null;
	viewport: string;
	mode?: StudioFrameFinalizeMode;
}

export interface StudioFrameFinalizeResult {
	html: string;
	repairCount: number;
}

/**
 * A document Studio already assembled. `data-studio-content` is *not* a marker:
 * the frame prompt asks the model to mark its content region itself, so a
 * never-assembled screen may legitimately carry it.
 */
const ASSEMBLED_MARKERS = /data-studio-shell|id="studio-canonical-style"/;

/**
 * Applies the canonical shell, then the deterministic positioning repair.
 *
 * `mode: "generate"` assembles unconditionally (a fresh model output has no
 * shell yet). `mode: "refresh"` only re-assembles a document that already
 * carries Studio's canonical markers: a legacy screen that never had the shell
 * must keep its original composition instead of suddenly growing an app bar.
 */
export function finalizeStudioFrameHtml(
	html: string,
	input: StudioFrameFinalizeInput,
): StudioFrameFinalizeResult {
	const clean = extractCleanHtml(html);
	if (!clean) return { html: "", repairCount: 0 };
	const assemble =
		Boolean(input.blueprint && input.screen) &&
		(input.mode !== "refresh" || ASSEMBLED_MARKERS.test(clean));
	const assembled =
		assemble && input.blueprint && input.screen
			? assembleCanonicalShell(
					clean,
					input.blueprint,
					input.screen,
					input.tokens,
					input.logoUrl,
				)
			: clean;
	if (input.viewport !== "mobile") return { html: assembled, repairCount: 0 };
	const repaired = repairStudioCanonicalPositioning(assembled);
	return { html: repaired.html, repairCount: repaired.repairCount };
}
