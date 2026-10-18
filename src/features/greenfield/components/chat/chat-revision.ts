import {
	mergePrdRevision,
	PRD_SECTION_NAMES,
	type PrdSectionName,
} from "@/features/greenfield/utils/prd-revision-merge";

export const MIN_PROMPT_LENGTH = 20;

export type { PrdSectionName };

export const ALL_PRD_SECTIONS = PRD_SECTION_NAMES;

/**
 * Applies live section update patches (`:::UPDATE_SECTION[...]::: ... :::END_UPDATE:::`)
 * to a base PRD document, using the same merge the server persists with so the
 * preview and the stored document cannot disagree.
 */
export function livePatchPrd(
	baseContent: string,
	streamContent: string,
): string {
	return mergePrdRevision(baseContent, streamContent).merged;
}

/**
 * Strips `:::UPDATE_SECTION[...]::: ... :::END_UPDATE:::` blocks from streamed content
 * leaving only the conversational prose intended for the user in the chat bubble.
 */
export function cleanChatBubble(streamContent: string): string {
	const cleaned = streamContent
		.replace(
			/:::UPDATE_SECTION\[(.*?)\]:::\s*([\s\S]*?)(?::::END_UPDATE:::|$)/g,
			"",
		)
		.trim();
	if (!cleaned) return "";
	return cleaned;
}

/**
 * Detect PRD sections from content. The system prompt asks the AI to
 * emit `<!-- SECTION: X -->` comment markers, but the model often skips them and
 * writes only markdown `## N. Title` headings instead. Marker style is exact;
 * heading style strips the `N. ` prefix and matches a known section name.
 */
export function extractSections(content: string): string[] {
	const found: string[] = [];
	const markerRe = /<!-- SECTION: (.+?) -->/g;

	for (const m of content.matchAll(markerRe)) {
		const name = m[1].trim();
		if (
			ALL_PRD_SECTIONS.includes(name as PrdSectionName) &&
			!found.includes(name)
		) {
			found.push(name);
		}
	}
	// If markers fully cover the doc, no need for the heading fallback.
	if (found.length >= ALL_PRD_SECTIONS.length) return found;
	const headingRe = /^#{2,3}\s+\d+\.\s+(.+)$/gm;

	for (const m of content.matchAll(headingRe)) {
		const title = m[1].trim();
		const name = ALL_PRD_SECTIONS.find(
			(s) => title === s || title.startsWith(`${s} `),
		);
		if (name && !found.includes(name)) found.push(name);
	}
	return found;
}
