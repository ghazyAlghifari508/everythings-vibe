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
import { inferTheme, RULE_FREQUENCY_MINIMUM } from "./design-model-observation";
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
	const addRule = (
		list: ModelGuideline[],
		rule: string,
		evidence: string,
	): void => {
		if (list.some((entry) => entry.rule === rule)) return;
		list.push({ rule, evidence });
	};
	const ctaLimitations = new Map<string, string[]>();
	function noteCtaLimitation(reason: string, detail: string) {
		const details = ctaLimitations.get(reason) ?? [];
		details.push(detail);
		ctaLimitations.set(reason, details);
	}

	const scopes = new Map<string, VisualEvidence["elements"]>();
	const flattened = evidence.elements.some((element) =>
		element.selector.startsWith("[capture "),
	);
	const views = [
		evidence,
		...(flattened ? [] : (evidence.additionalViews ?? [])),
	];
	// Capture prefixes always mark a combined document, whether the merge came
	// from additionalViews or from selectors flattened beforehand.
	const mergedCaptures =
		flattened || (evidence.additionalViews?.length ?? 0) > 0;
	for (const [index, view] of views.entries()) {
		for (const element of view.elements) {
			if (element.role !== "cta") continue;
			const prefix = element.selector.match(/^\[capture [^\]]+\]/)?.[0];
			const scope =
				prefix ??
				`capture ${index + 1}: ${view.viewport.width}x${view.viewport.height}, ${view.colorScheme ?? "auto"}`;
			const actions = scopes.get(scope);
			if (actions) actions.push(element);
			else scopes.set(scope, [element]);
		}
	}
	for (const [scope, actions] of scopes) {
		const describe = (detail: string) =>
			scope ? `${scope}: ${detail}` : detail;
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
			noteCtaLimitation(
				"Conflicting CTA radius measurements",
				describe(values.join(", ")),
			);
		if (missing)
			noteCtaLimitation(
				"Missing CTA radius evidence",
				describe(`${missing} element${missing === 1 ? "" : "s"}`),
			);
		if (actions.length < RULE_FREQUENCY_MINIMUM)
			noteCtaLimitation(
				"CTA radius evidence lacks repeated support",
				scope || "a single measurement",
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
			addRule(
				dos,
				`Use ${value} only for matching action buttons${scope ? ` in ${scope}` : ""}; do not extend it to unseen variants or other capture scopes.`,
				`All ${actions.length} measured CTA elements${scope ? ` in ${scope}` : ""} agree on this radius. Primary/secondary hierarchy and interaction states are not established.`,
			);
		else if (!supported && values.length === 1)
			noteCtaLimitation(
				"CTA radius measurements lack a matching button token",
				scope || "the measured actions",
			);
	}
	for (const [reason, details] of ctaLimitations)
		limitations.push(
			`${reason}: ${details.join("; ")}. No shared button radius rule is established${mergedCaptures ? " for these captures" : " for this capture"}.`,
		);

	const scaleTokens = spacing.filter(
		(token) => token.purpose === "Repeated spacing scale",
	);
	if (scaleTokens.length)
		addRule(
			dos,
			`Reuse the measured spacing steps: ${scaleTokens
				.slice(0, 4)
				.map((token) => token.value)
				.join(", ")}.`,
			`Each step was measured on ${scaleTokens
				.slice(0, 4)
				.map((token) => token.frequency)
				.join(", ")} elements.`,
		);

	// Component radii are one instruction per measured class. A purpose with more
	// than one measured value is a variant conflict, which is reported instead of
	// being averaged into a single made-up radius. CTA conflicts already surface
	// as CTA limitations above, so the component view only restates a conflict
	// the CTA scope did not label.
	const radiusByPurpose = new Map<string, RadiusToken[]>();
	for (const token of radii) {
		if (token.purpose === "Measured radius") continue;
		const tokens = radiusByPurpose.get(token.purpose) ?? [];
		tokens.push(token);
		radiusByPurpose.set(token.purpose, tokens);
	}
	const stableRadiusFacts: string[] = [];
	const conflictingRadiusFacts: string[] = [];
	for (const [purpose, tokens] of radiusByPurpose) {
		const values = [...new Set(tokens.map((token) => token.value))];
		const repeated = tokens.some(
			(token) => token.frequency >= RULE_FREQUENCY_MINIMUM,
		);
		if (values.length === 1 && repeated)
			stableRadiusFacts.push(`${purpose} ${values[0]}`);
		if (values.length > 1 && purpose !== "Buttons")
			conflictingRadiusFacts.push(`${purpose} ${values.join(" / ")}`);
	}
	if (stableRadiusFacts.length > 1)
		addRule(
			dos,
			`Apply radius by component class: ${stableRadiusFacts.join("; ")}.`,
			`Each value was measured on at least ${RULE_FREQUENCY_MINIMUM} elements of that class; the classes were not measured at a shared radius.`,
		);
	if (conflictingRadiusFacts.length)
		addRule(
			donts,
			`Do not collapse a component class to one radius: ${conflictingRadiusFacts.join("; ")} were measured on different treatments.`,
			"Different measured treatments of the same component class used different radii; no single value applies to all of them.",
		);

	// Type hierarchy is a measured size contrast, so it is quoted from the
	// specimens that were actually rendered. The rule stays scoped to this
	// capture instead of claiming the site's full type system.
	const headingSpecimens = specimens
		.filter((specimen) =>
			["Display", "Large heading", "Heading", "Subheading"].includes(
				specimen.role,
			),
		)
		.sort((a, b) => b.fontSizePx - a.fontSizePx);
	const bodySpecimens = specimens
		.filter((specimen) =>
			["Body", "Body small", "Body large"].includes(specimen.role),
		)
		.sort((a, b) => b.frequency - a.frequency);
	const heading = headingSpecimens[0];
	const body = bodySpecimens[0];
	if (
		heading &&
		body &&
		heading.fontSizePx >= body.fontSizePx * 1.2 &&
		body.frequency >= RULE_FREQUENCY_MINIMUM &&
		heading.fontFamily === body.fontFamily
	)
		addRule(
			dos,
			`Keep the measured type contrast${mergedCaptures ? " within this capture" : ""}: ${heading.role} at ${heading.fontSize} against ${body.role} at ${body.fontSize}.`,
			`Both sizes were measured on rendered text (${heading.frequency} and ${body.frequency} elements of the same family); the hierarchy comes from measured size, not from colour or decoration.`,
		);

	// The font restriction must list every family that was actually measured on
	// rendered text, not only the families that survived type-scale curation:
	// a family seen once still belongs to the measured set.
	const distinctFamilies = new Set(
		typefaces.length
			? typefaces.map((typeface) => typeface.family)
			: specimens.map((specimen) => specimen.fontFamily.split(",")[0]?.trim()),
	);
	if (distinctFamilies.size > 1)
		addRule(
			donts,
			`Do not introduce a font family outside the measured set (${[
				...distinctFamilies,
			]
				.filter(Boolean)
				.join(", ")}).`,
			`${distinctFamilies.size} families were measured on rendered text.`,
		);

	const userAgentColor = colors.find((entry) => entry.userAgentDefault);
	if (userAgentColor)
		addRule(
			donts,
			`Do not present ${userAgentColor.token.color.css} as a brand colour.`,
			userAgentColor.rationale,
		);

	// A requested preference is not evidence of a website theme. When the canvas
	// stayed light under a dark preference, dark tokens would be invented.
	const darkRequested = views.some((view) => view.colorScheme === "dark");
	const darkVerified = views.some(
		(view) => view.colorScheme === "dark" && inferTheme(view) === "dark",
	);
	if (darkRequested && !darkVerified)
		addRule(
			donts,
			"Do not add dark-mode tokens: the dark browser preference rendered a light canvas.",
			"The measured canvas background stayed light in the capture that requested a dark preference.",
		);

	if (!dos.length && !donts.length && !limitations.length)
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
