import type { EvvibeDesignReference } from "../skill-contract";

export const mediaAndImagery: EvvibeDesignReference = {
	id: "media-and-imagery",
	title: "Imagery and the asset contract",
	body: `When the content needs photographs, use photographs: destinations, products, food, covers, interiors, project work. A gradient, emoji, geometric shape or coloured block is not a photograph and never stands in for one.

Source contract, fixed: every image source is an https URL to a real licensed asset, a data:image URI, or a Studio asset route beginning /api/studio/asset? with a capability token. Never invent a URL, never reference a file that does not exist, never point at an unverified host. An unknown source is a hard defect, not a style choice. Alt text describes the subject; adjacent content stays useful when an image cannot load.

SVG remains right for icons, genuine vector logos, charts, diagrams and explicitly requested illustrations.

Composition: scale media to what the content deserves — a travel destination deserves a real scene, a settings row does not. Preserve the subject (contain for whole products and covers, cover only for deliberate crops). Media owns its frame: declared ratio, no conflicting intrinsic height, caption outside the box. Image-led pages stay image-led. Illustrative or invented imagery is labelled sample content and is never presented as evidence.`,
};
