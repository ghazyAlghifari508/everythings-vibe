import type { EvvibeDesignReference } from "../skill-contract";

/**
 * The frame system prompt already carries the generation standard, so a
 * revision request adds only what that standard cannot know: the scope of the
 * change and the identity that must survive it.
 */
export const revisionScope: EvvibeDesignReference = {
	id: "revision-scope",
	title: "Revision scope",
	body: `Change what the request asks for and nothing else. Keep the approved palette, typography scale, radius, spacing rhythm, navigation labels and content of untouched regions; a revision is not an opportunity to restyle the page.

If the request is a colour or type change, apply it to the shared tokens and every component that consumes them. If the request is structural, change the affected composition and leave sibling sections intact. If the request is vague, improve the named weakness without adding sections, badges, metrics or imagery the brief never supplied. Return the complete document; never drop content that was already valid.`,
};
