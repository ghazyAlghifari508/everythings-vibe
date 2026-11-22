import type { EvvibeDesignReference } from "../skill-contract";

export const mediaAndImagery: EvvibeDesignReference = {
	id: "media-and-imagery",
	title: "Imagery and the asset contract",
	body: `When the content needs photographs, use photographs: destinations, products, food, covers, interiors, project work. A gradient, emoji, geometric shape or coloured block is not a photograph and never stands in for one.

Source contract: use only supplied assets and verified photo slots. Keep the full supplied /api/studio/asset? URL for local assets. Never invent a URL, encode a substitute image, or use CSS/SVG as photography. Use descriptive alt text and keep nearby content useful when a photo is unavailable.

SVG remains right for icons, genuine vector logos, charts, diagrams and explicitly requested illustrations.

Composition: scale media to what the content deserves — a travel destination deserves a real scene, a settings row does not. Preserve the subject (contain for whole products and covers, cover only for deliberate crops). Media owns its frame: declared ratio, no conflicting intrinsic height, caption outside the box. Image-led pages stay image-led. Illustrative or invented imagery is labelled sample content and is never presented as evidence.`,
};
