import type {
	ModelGuideline,
	ModelGuidelines,
} from "@/features/scrape/types/design-model";
import type { ColorClassification } from "../utils/design-normalize-color";
import type {
	RadiusToken,
	SpacingToken,
} from "../utils/design-normalize-shape";
import type {
	NormalizedTypeface,
	TypeSpecimen,
} from "../utils/design-normalize-typography";
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
	typefaces: NormalizedTypeface[] = [],
): ModelGuidelines {
	const dos: ModelGuideline[] = [];
	const donts: ModelGuideline[] = [];
	const limitations: string[] = [];

	const scopes = new Map<string, VisualEvidence["elements"]>();
	const flattened = evidence.elements.some((element) =>
		element.selector.startsWith("[capture "),
	);
	for (const [index, view] of [
		evidence,
		...(flattened ? [] : (evidence.additionalViews ?? [])),
	].entries()) {
		for (const element of view.elements) {
			if (element.role !== "cta") continue;
			const scope =
				element.selector.match(/^\[capture [^\]]+\]/)?.[0] ??
				`capture ${index + 1}: ${view.viewport.width}x${view.viewport.height}, ${view.colorScheme ?? "auto"}`;
			const actions = scopes.get(scope);
			if (actions) actions.push(element);
			else scopes.set(scope, [element]);
		}
	}
	for (const [scope, actions] of scopes) {
		const measured = actions.map(
			(action) => action.properties["border-radius"]?.trim() ?? "",
		);
		const values = [
			...new Set(
				measured.filter(
					(value) => value && value !== "none" && value !== "normal",
				),
			),
		];
		const missing = measured.filter(
			(value) => !value || value === "none" || value === "normal",
		).length;
		if (values.length > 1)
			limitations.push(
				`Conflicting CTA radius measurements in ${scope}: ${values.join(", ")}. No shared button radius rule is established.`,
			);
		if (missing)
			limitations.push(
				`Radius evidence is missing for ${missing} CTA elements in ${scope}; no shared button radius rule is established.`,
			);
		if (actions.length < RULE_FREQUENCY_MINIMUM)
			limitations.push(
				`CTA radius evidence in ${scope} lacks repeated support; no shared button radius rule is established.`,
			);
		const value = values[0];
		const supported = radii.some(
			(token) =>
				token.purpose === "Buttons" &&
				token.roles.includes("cta") &&
				token.value.trim() === value,
		);
		if (
			actions.length >= RULE_FREQUENCY_MINIMUM &&
			!missing &&
			values.length === 1 &&
			supported
		)
			dos.push({
				rule: `Use ${value} only for matching action buttons in ${scope}; do not extend it to unseen variants or other capture scopes.`,
				evidence: `All ${actions.length} measured CTA elements in ${scope} agree on this radius. Primary/secondary hierarchy and interaction states are not established.`,
			});
		else if (!supported && values.length)
			limitations.push(
				`CTA radius measurements in ${scope} lack a matching button token; no shared button radius rule is established.`,
			);
	}

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

	// The font restriction must list every family that was actually measured on
	// rendered text, not only the families that survived type-scale curation:
	// a family seen once still belongs to the measured set.
	const distinctFamilies = new Set(
		typefaces.length
			? typefaces.map((typeface) => typeface.family)
			: specimens.map((specimen) => specimen.fontFamily.split(",")[0]?.trim()),
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
