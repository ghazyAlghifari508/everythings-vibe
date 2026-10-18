/**
 * PRD section patch merge — the single implementation of the
 * `:::UPDATE_SECTION[...]:::` protocol, shared by the server (persistence path)
 * and the client live preview.
 *
 * The server merge is authoritative: the sections it reports as patched are the
 * ones named in the chat reply, so the algorithm must never claim a change it
 * did not write. An unknown section name is therefore skipped instead of being
 * matched greedily to end-of-document (which would truncate the rest of the
 * PRD). Pure: no DB, no provider, no clock.
 */
import { stripSectionMarkers } from "@/features/greenfield/utils/revision-reply";

/** Canonical PRD section order, as emitted by the PRD prompt. */
export const PRD_SECTION_NAMES = [
	"Overview",
	"Goals & Success Metrics",
	"Requirements",
	"Core Features",
	"User Flow",
	"Architecture & Tech Stack",
	"Database Schema",
	"Design & Technical Constraints",
] as const;

export type PrdSectionName = (typeof PRD_SECTION_NAMES)[number];

export const PRD_SECTION_UPDATE_PATTERN =
	/:::UPDATE_SECTION\[(.*?)\]:::\s*([\s\S]*?)(?:\s*:::END_UPDATE:::|$)/g;

function escapeForRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface PrdRevisionMergeResult {
	/** Document to persist/display: the merged PRD, or the response verbatim. */
	merged: string;
	/** Sections that were actually written, in merge order. */
	patchedSections: string[];
}

/**
 * Merge patch blocks from a model response into the current PRD.
 *
 * - No stored document: the response is the document.
 * - Stored document but no applicable patch: the stored document is kept
 *   untouched, never replaced by protocol prose.
 */
export function mergePrdRevision(
	currentPrd: string | null | undefined,
	response: string,
): PrdRevisionMergeResult {
	if (!currentPrd) return { merged: response, patchedSections: [] };

	const patchedSections: string[] = [];
	let merged = currentPrd;
	let isMerged = false;

	for (const match of response.matchAll(PRD_SECTION_UPDATE_PATTERN)) {
		const sectionName = match[1].trim();
		const newSectionContent = stripSectionMarkers(match[2]);
		const openingTag = `<!-- SECTION: ${escapeForRegExp(sectionName)} -->`;

		// Strategy 1: strict — the stored document carries closing tags.
		let sectionRegex = new RegExp(
			`${openingTag}[\\s\\S]*?<!-- \\/SECTION -->`,
			"g",
		);
		if (sectionRegex.test(merged)) {
			sectionRegex.lastIndex = 0;
			merged = merged.replace(
				sectionRegex,
				`${openingTag}\n${newSectionContent}\n<!-- /SECTION -->`,
			);
			isMerged = true;
			patchedSections.push(sectionName);
			continue;
		}

		// Strategy 2: lenient — opening tag to the next section boundary.
		const sectionIdx = PRD_SECTION_NAMES.indexOf(sectionName as PrdSectionName);
		// Unknown/mismatched section name (e.g. numbered "1. Overview"): skip this
		// update rather than falling through to a wildcard EOF match that would
		// destroy the rest of the document.
		if (sectionIdx === -1) continue;
		const nextSection =
			sectionIdx < PRD_SECTION_NAMES.length - 1
				? PRD_SECTION_NAMES[sectionIdx + 1]
				: null;
		const endBoundary = nextSection
			? `(?:[\\s\\S]*?<!-- SECTION: ${escapeForRegExp(nextSection)} -->)`
			: "(?:[\\s\\S]*|$)";
		sectionRegex = new RegExp(`${openingTag}[\\s\\S]*?${endBoundary}`, "g");
		if (sectionRegex.test(merged)) {
			sectionRegex.lastIndex = 0;
			const endMarker = nextSection
				? `\n\n<!-- SECTION: ${nextSection} -->`
				: "";
			merged = merged.replace(
				sectionRegex,
				`${openingTag}\n${newSectionContent}${endMarker}`,
			);
			isMerged = true;
			patchedSections.push(sectionName);
		}
	}

	// A stored document with no applicable patch is kept as-is.
	return { merged: isMerged ? merged : currentPrd, patchedSections };
}
