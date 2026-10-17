import { stripSectionMarkers } from "@/features/greenfield/utils/revision-reply";

export const MIN_PROMPT_LENGTH = 20;

export const ALL_PRD_SECTIONS = [
	"Overview",
	"Goals & Success Metrics",
	"Requirements",
	"Core Features",
	"User Flow",
	"Architecture & Tech Stack",
	"Database Schema",
	"Design & Technical Constraints",
] as const;

export type PrdSectionName = (typeof ALL_PRD_SECTIONS)[number];

/**
 * Applies live section update patches (`:::UPDATE_SECTION[...]::: ... :::END_UPDATE:::`)
 * to a base PRD document. Supports strict (<!-- /SECTION -->) and lenient next-section boundaries.
 */
export function livePatchPrd(
	baseContent: string,
	streamContent: string,
): string {
	if (!baseContent) return streamContent;

	let patched = baseContent;
	const regex =
		/:::UPDATE_SECTION\[(.*?)\]:::\s*([\s\S]*?)(?::::END_UPDATE:::|$)/g;

	for (const match of streamContent.matchAll(regex)) {
		const sectionName = match[1].trim();
		// The viewer's markers are written below, so drop any the model repeated
		// inside its own patch body (otherwise the live preview shows doubles).
		const newContent = stripSectionMarkers(match[2]);

		const escaped = sectionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		const openingTag = `<!-- SECTION: ${escaped} -->`;

		// Strategy 1: strict with closing tag (well-formed PRD).
		let sectionRegex = new RegExp(
			`${openingTag}[\\s\\S]*?<!-- \\/SECTION -->`,
			"gi",
		);
		if (sectionRegex.test(patched)) {
			patched = patched.replace(
				sectionRegex,
				`${openingTag}\n${newContent}\n<!-- /SECTION -->`,
			);
			continue;
		}

		// Strategy 2: lenient - opening tag to next section or end-of-doc.
		// Handles PRD whose stored content lacks closing tags (zero <!-- /SECTION --> found).
		const sectionIdx = ALL_PRD_SECTIONS.indexOf(sectionName as PrdSectionName);
		const nextSection =
			sectionIdx >= 0 && sectionIdx < ALL_PRD_SECTIONS.length - 1
				? ALL_PRD_SECTIONS[sectionIdx + 1]
				: null;
		const endBoundary = nextSection
			? `(?:[\\s\\S]*?<!-- SECTION: ${nextSection.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} -->)`
			: "(?:[\\s\\S]*|$)";
		sectionRegex = new RegExp(`${openingTag}[\\s\\S]*?${endBoundary}`, "gi");
		if (sectionRegex.test(patched)) {
			const endMarker = nextSection
				? `\n\n<!-- SECTION: ${nextSection} -->`
				: "";
			patched = patched.replace(
				sectionRegex,
				`${openingTag}\n${newContent}${endMarker}`,
			);
		}
	}
	return patched;
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
