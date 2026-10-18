import type {
	ModelGuideline,
	ModelGuidelines,
} from "@/features/scrape/types/design-model";
import type { ColorClassification } from "../utils/design-normalize-color";
import type {
	RadiusToken,
	SpacingToken,
} from "../utils/design-normalize-shape";
import type { TypeSpecimen } from "../utils/design-normalize-typography";
import { RULE_FREQUENCY_MINIMUM } from "./design-model-observation";
import type { VisualEvidence } from "./design-visual-evidence";

// Guidance derived from the validated model.

// The document carries useful rules, not an exhaustive dump: ten Do and ten
// Don't at most, so the guidance stays within twenty evidence-backed rules.
const MAX_GUIDELINE_RULES_PER_SIDE = 10;

// Guidance is derived only from repeated measured patterns. A single observation
// cannot support a rule, and no interaction, hover, focus or responsive claim is
// ever made because those states were not captured.
export function deriveModelGuidelines(
	evidence: VisualEvidence,
	colors: ColorClassification[],
	specimens: TypeSpecimen[],
	spacing: SpacingToken[],
	radii: RadiusToken[],
): ModelGuidelines {
	const dos: ModelGuideline[] = [];
	const donts: ModelGuideline[] = [];
	const limitations: string[] = [];

	const actions = evidence.elements.filter((element) => element.role === "cta");
	const actionRadii = radii.find((token) => token.purpose === "Buttons");
	if (actions.length >= RULE_FREQUENCY_MINIMUM && actionRadii)
		dos.push({
			rule: `Use ${actionRadii.value} for action buttons.`,
			evidence: `Measured on ${actionRadii.frequency} elements, including the action buttons of this page.`,
		});

	const brandColor = colors.find((entry) => entry.roleClass === "brand");
	if (brandColor)
		dos.push({
			rule: `Use ${brandColor.token.color.css} for primary actions and brand accents.`,
			evidence: brandColor.rationale,
		});

	const display = specimens.find((specimen) => specimen.role === "Display");
	const body = specimens.find((specimen) => specimen.role === "Body");
	if (display && body)
		dos.push({
			rule: `Keep display type at ${display.fontSize} and body copy at ${body.fontSize}.`,
			evidence: `Both styles were measured on rendered text; the size gap carries the hierarchy instead of colour or decoration.`,
		});

	const scaleTokens = spacing.filter(
		(token) => token.purpose === "Repeated spacing scale",
	);
	if (scaleTokens.length)
		dos.push({
			rule: `Reuse the measured spacing steps: ${scaleTokens
				.slice(0, 4)
				.map((token) => token.value)
				.join(", ")}.`,
			evidence: `Each step was measured on ${scaleTokens
				.slice(0, 4)
				.map((token) => token.frequency)
				.join(", ")} elements.`,
		});

	const distinctFamilies = new Set(
		specimens.map((specimen) => specimen.fontFamily.split(",")[0]?.trim()),
	);
	if (distinctFamilies.size > 1)
		donts.push({
			rule: `Do not introduce a font family outside the measured set (${[
				...distinctFamilies,
			]
				.filter(Boolean)
				.join(", ")}).`,
			evidence: `${distinctFamilies.size} families were measured on rendered text.`,
		});

	const radiusValues = [...new Set(radii.map((token) => token.value))];
	if (radiusValues.length > 2)
		donts.push({
			rule: `Do not treat ${radiusValues.length} measured radius values as interchangeable; assign one per component class.`,
			evidence: `${radiusValues.length} distinct radius values were measured: ${radiusValues.join(", ")}.`,
		});

	const userAgentColor = colors.find((entry) => entry.userAgentDefault);
	if (userAgentColor)
		donts.push({
			rule: `Do not present ${userAgentColor.token.color.css} as a brand colour.`,
			evidence: userAgentColor.rationale,
		});

	if (!dos.length && !donts.length)
		limitations.push(
			"Evidence did not contain enough repeated patterns to derive Do and Don't rules.",
		);

	const unloaded = evidence.fonts.filter((font) => font.status !== "loaded");
	if (unloaded.length)
		limitations.push(
			`Load status of ${unloaded.length} declared font resources was not verified, so the font actually used for glyphs is not confirmed.`,
		);

	return {
		dos: dos.slice(0, MAX_GUIDELINE_RULES_PER_SIDE),
		donts: donts.slice(0, MAX_GUIDELINE_RULES_PER_SIDE),
		limitations,
	};
}
