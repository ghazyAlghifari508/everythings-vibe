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

// A rule that binds a measured value to a component class. The value has to
// match what that class was measured at.
const CLASS_VALUE_CLAIM =
	/\b(all|every|each)\s+(buttons?|ctas?|inputs?|cards?|nav(?:igation)?|links?|badges?|chips?|pill buttons?)\b[^.\n]*?(\d+(?:\.\d+)?(?:px|rem|em|%))/gi;

// A rule that names one component class together with a measured value. The
// class has to have been measured at that value.
const SINGLE_CLASS_VALUE_CLAIM =
	/\b(buttons?|ctas?|inputs?|cards?|navigation|links?|badges?|chips?)\b[^.\n]{0,40}?(\d+(?:\.\d+)?(?:px|rem|em|%))/gi;

// The measured values of one component class.
function classValues(model: DesignTokenModel, className: string): Set<string> {
	const role = CLASS_ROLES[className];
	if (!role) return new Set();
	const values = new Set<string>();
	for (const token of model.radii) {
		if (!token.roles.includes(role)) continue;
		values.add(token.value.toLowerCase());
	}
	for (const token of model.spacing) {
		if (!token.roles.includes(role)) continue;
		values.add(token.value.toLowerCase());
	}
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
	const measuredValues = new Set<string>();
	for (const token of model.radii)
		measuredValues.add(token.value.toLowerCase());
	for (const token of model.spacing)
		measuredValues.add(token.value.toLowerCase());
	for (const entry of model.typography) {
		measuredValues.add(entry.fontSize.toLowerCase());
		measuredValues.add(entry.lineHeight.toLowerCase());
	}

	for (const claim of claims) {
		for (const match of claim.matchAll(UNMEASURED_SCOPE))
			issues.push({
				code: "unsupported-claim",
				detail: `Claim "${match[0]}" generalises the capture beyond the measured states and viewports.`,
			});
		for (const match of claim.matchAll(CLASS_VALUE_CLAIM)) {
			const value = (match[3] ?? "").toLowerCase();
			if (measuredValues.has(value)) continue;
			issues.push({
				code: "unsupported-claim",
				detail: `Claim binds ${match[1]} to ${value}, which was not measured.`,
			});
		}
		// A rule that names one component class and a value has to agree with
		// what that class was measured at. A button measured at 8px and 16px
		// in two captures cannot be reduced to a single radius.
		for (const match of claim.matchAll(SINGLE_CLASS_VALUE_CLAIM)) {
			const className = (match[1] ?? "").toLowerCase();
			const value = (match[2] ?? "").toLowerCase();
			const values = classValues(model, className);
			if (!values.size) continue;
			if (values.has(value)) continue;
			issues.push({
				code: "unsupported-claim",
				detail: `Claim binds ${className} to ${value}, which was not measured for that component class.`,
			});
		}
	}
	return issues;
}
