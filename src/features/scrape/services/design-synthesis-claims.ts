import type { DesignTokenModel } from "./design-model";

// Claim validation for the AI synthesis step.
//
// A citation only proves that a model entry exists. It does not prove that the
// claim made next to it is what the measurement supports. The checks here
// refuse the two claim shapes that cause the reported fidelity failures:
//
//   1. A rule that names a value the measurement contradicts, for example
//      "all buttons use 12px radius" while the buttons were measured at 8px.
//   2. A rule that generalises a scoped measurement into a universal one, for
//      example "at every viewport, including hover", because no interaction
//      state or second viewport was ever measured.
//
// The remaining prose stays prose. A literal scan is not a fabrication-proof
// gate, so the measured model remains the authority and the document labels
// inference as inference.

export interface ClaimIssue {
	code: "unsupported-claim";
	detail: string;
}

// A measurement that was never taken. Any rule that names one of these is
// claiming a state or a scope the capture cannot support.
const UNMEASURED_SCOPE =
	/\b(?:every|all|each|any)\s+(?:viewport|viewports|breakpoint|breakpoints|screen|screens|device|devices|state|states)\b|\bat\s+every\s+(?:viewport|breakpoint|screen|size)\b|\bincluding\s+hover\b|\bhover\s+(?:state|states|style|styles)\b|\bfocus\s+(?:state|states|style|styles)\b|\bresponsive\s+(?:behaviou?r|layout|rule|rules)\b/gi;

const COMPONENT_CLAIM =
	/\b(?:(all|every|each)\s+)?(buttons?|ctas?|inputs?|cards?|nav(?:igation)?|links?|badges?|chips?)\b[^.\n]{0,40}?(?:(\d+(?:\.\d+)?(?:px|rem|em|%))\s+(radius|padding|margin|gap)\b|(radius|padding|margin|gap)\s*(?:of|:|is|uses?)?\s*(\d+(?:\.\d+)?(?:px|rem|em|%)))/gi;

// The measured values of one component class.
function classValues(
	model: DesignTokenModel,
	className: string,
	property: string,
): Set<string> {
	const role = CLASS_ROLES[className];
	if (!role) return new Set();
	const values = new Set<string>();
	const tokens =
		property === "radius"
			? model.radii
			: model.spacing.filter((token) => token.property === property);
	for (const token of tokens)
		if (token.roles.includes(role)) values.add(token.value.toLowerCase());
	return values;
}

// The component classes a rule can name, mapped to the measured role.
const CLASS_ROLES: Record<string, string> = {
	button: "cta",
	buttons: "cta",
	cta: "cta",
	ctas: "cta",
	input: "input",
	inputs: "input",
	card: "card",
	cards: "card",
	navigation: "nav",
	nav: "nav",
	link: "a",
	links: "a",
	badge: "span",
	badges: "span",
	chip: "span",
	chips: "span",
};

export function validateSynthesisClaims(
	claims: string[],
	model: DesignTokenModel,
): ClaimIssue[] {
	const issues: ClaimIssue[] = [];
	for (const claim of claims) {
		for (const match of claim.matchAll(UNMEASURED_SCOPE))
			issues.push({
				code: "unsupported-claim",
				detail: `Claim "${match[0]}" generalises the capture beyond the measured states and viewports.`,
			});
		for (const match of claim.matchAll(COMPONENT_CLAIM)) {
			const sentenceStart = Math.max(
				claim.lastIndexOf(".", match.index - 1),
				claim.lastIndexOf(";", match.index - 1),
				claim.lastIndexOf("\n", match.index - 1),
			);
			if (
				/\b(?:don't|do not|never|avoid)\b/i.test(
					claim.slice(sentenceStart + 1, match.index),
				)
			)
				continue;
			const className = (match[2] ?? "").toLowerCase();
			const value = (match[3] ?? match[6] ?? "").toLowerCase();
			const property = (match[4] ?? match[5] ?? "").toLowerCase();
			const values = classValues(model, className, property);
			if (!values.size) continue;
			if (values.has(value) && (!match[1] || values.size === 1)) continue;
			issues.push({
				code: "unsupported-claim",
				detail: `Claim binds ${className} ${property} to ${value}, contrary to the measured component values.`,
			});
		}
	}
	return issues;
}
