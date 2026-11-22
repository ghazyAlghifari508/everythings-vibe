import type { EvvibeDesignReference } from "../skill-contract";

export const mediaAndImagery: EvvibeDesignReference = {
	id: "media-and-imagery",
	title: "Imagery and the image asset contract",

	body: `When a design needs photographs, it needs photographs: destination scenes, food and product shots, book covers, interiors, project showcases. A CSS gradient, an emoji, a geometric inline SVG or a coloured block is not a photograph and must never stand in for one.

Image source contract (fixed; the retrieval and delivery infrastructure lands separately):
- Every image element's src is one of: an https URL to a real, licensed asset; a data:image URI; or a Studio asset route beginning /api/studio/asset? with an issued capability token.
- Never invent a URL, never reference a filename that does not exist, and never point at an unverified third-party host.
- An unknown source is a hard defect, not a stylistic choice: the screen fails validation rather than shipping a broken frame.
- Provide alt text that describes the subject for people who cannot see it, and keep adjacent content meaningful when an image cannot load.
- Do not add a placeholder gallery that will obviously be empty; if no asset exists, compose the screen so it does not depend on one.

SVG remains correct for: icons, genuine vector logos, charts, diagrams, and illustrations that were explicitly requested. An illustration is not a substitute for a required photograph.

Composition rules:
- Media carries meaning: scale it to what the content deserves. A travel destination deserves a real scene; a settings row does not deserve a hero image.
- Preserve the subject: contain for whole products and book covers, cover only for deliberate photographic crops with a chosen object-position.
- Media owns its frame: declared aspect ratio, image filling the frame without conflicting intrinsic heights, caption outside the ratio box.
- Never stretch, never letterbox with visible dead space inside a designed frame, never crop a product's identifying features away.
- Image-led pages stay image-led. Do not reduce a photography-driven site to text cards with decorative shapes.
- Illustrative records or invented product imagery remain clearly sample content; they are never presented as verified evidence.`,
};
