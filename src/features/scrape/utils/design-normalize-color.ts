import type { VisualElementEvidence } from "../services/design-visual-evidence";
import type { NormalizedColorToken } from "./design-color-tokens";
import {
	colorContext,
	contextFrequency,
	normalizeColors,
} from "./design-color-tokens";

// Palette classification. A colour is never promoted to a role because it looks
// important: the classification must be supported by measured usage.

export type { NormalizedColor, RgbaColor } from "./design-color-parse";
export { normalizeColor } from "./design-color-parse";
export type {
	ColorMeasurement,
	ColorUsage,
	NormalizedColorToken,
} from "./design-color-tokens";
export {
	collectColorMeasurements,
	collectUnsupportedColors,
	colorContext,
	contextFrequency,
	normalizeColors,
} from "./design-color-tokens";

export type ColorRoleClass =
	| "brand"
	| "accent"
	| "neutral"
	| "semantic"
	| "unknown";

// The palette section a measured colour belongs to. It is derived from the same
// measured usage contexts as the role label, so a colour that paints text can
// never land in the surface section, and vice versa.
export type PaletteGroupKey =
	| "brand"
	| "text"
	| "surface"
	| "border"
	| "semantic"
	| "neutral";

// The user-agent text colour. A page that never styles `color` still reports
// this value, so it must not be presented as a brand decision.
const USER_AGENT_TEXT = "#000000";

// A brand claim needs repeated or action-grounded evidence. A single sighting
// of a brand-named variable is not enough to promote a colour.
const BRAND_MIN_FREQUENCY = 2;

const SURFACE_PAGE_ROLES = [
	"canvas",
	"main",
	"section",
	"header",
	"footer",
	"nav",
] as const;

function hasPageSurfaceRole(roles: string[]): boolean {
	return roles.some((role) =>
		(SURFACE_PAGE_ROLES as readonly string[]).includes(role),
	);
}

export interface ColorClassification {
	token: NormalizedColorToken;
	roleClass: ColorRoleClass;
	/** Palette section derived from the same measured usage as the role label. */
	group: PaletteGroupKey;
	/** Human-readable role name derived from measured usage. */
	roleLabel: string;
	/** Why this classification was chosen, in plain language. */
	rationale: string;
	/** True when the only evidence is the user-agent default. */
	userAgentDefault: boolean;
}

const SEMANTIC_NAME =
	/(?:^|[^a-z])(success|warning|error|danger|info)(?:[^a-z]|$)/i;
const BRAND_NAME = /(?:^|[^a-z])(brand|primary|accent|action|cta)(?:[^a-z]|$)/i;
const NEUTRAL_NAME =
	/(?:^|[^a-z])(neutral|gray|grey|slate|zinc|stone|neutral|canvas|surface|text|border|background|ink|muted)(?:[^a-z]|$)/i;

interface ColorUsageFacts {
	fillsAction: boolean;
	paintsText: boolean;
	paintsBorder: boolean;
	fillsBackground: boolean;
	onCanvas: boolean;
}

function usageFacts(token: NormalizedColorToken): ColorUsageFacts {
	return {
		fillsAction:
			contextFrequency(token.usage, colorContext("cta", "background-color")) >
			0,
		paintsText: token.usage.contexts.some((entry) => entry.endsWith(":color")),
		paintsBorder: token.usage.contexts.some((entry) =>
			entry.endsWith(":border-top-color"),
		),
		fillsBackground: token.usage.contexts.some((entry) =>
			entry.endsWith(":background-color"),
		),
		onCanvas: token.usage.roles.includes("canvas"),
	};
}

function roleLabelFor(
	roleClass: ColorRoleClass,
	facts: ColorUsageFacts,
): string {
	// Label from the paired contexts so a colour that fills an action button and
	// also paints text is described by what it actually did, not by the union of
	// every role and property it ever appeared in.
	if (roleClass === "brand" && facts.fillsAction) return "Primary action";
	if (roleClass === "brand") return "Brand accent";
	if (roleClass === "accent") return "Accent";
	if (roleClass === "semantic") return "Semantic state";
	if (facts.paintsText && facts.fillsBackground) return "Text and surface";
	if (facts.paintsText) return facts.onCanvas ? "Base text" : "Text";
	if (facts.paintsBorder) return "Border";
	if (facts.fillsBackground)
		return facts.fillsAction ? "Action surface" : "Surface";
	return "Neutral";
}

function paletteGroupFor(
	roleClass: ColorRoleClass,
	facts: ColorUsageFacts,
	userAgentDefault: boolean,
): PaletteGroupKey {
	// The user-agent text colour is reported so the page is readable, not
	// because the page chose it, so it never becomes a text token.
	if (userAgentDefault) return "neutral";
	if (roleClass === "brand" || roleClass === "accent") return "brand";
	if (roleClass === "semantic") return "semantic";
	if (facts.paintsText) return "text";
	if (facts.paintsBorder) return "border";
	if (facts.fillsBackground) return "surface";
	return "neutral";
}

// Classifies a normalized palette using measured usage only. A colour is never
// promoted to brand because it looks important: it must be repeated on action
// elements, or resolve from a custom property the page named for that role.
export function classifyColorToken(
	token: NormalizedColorToken,
): ColorClassification {
	const haystack = token.usage.variableNames.join(" ");
	const facts = usageFacts(token);
	const isUserAgentDefault =
		token.color.hex === USER_AGENT_TEXT &&
		!token.usage.hasVariableEvidence &&
		token.usage.roles.every(
			(role) => role === "element" || role === "body" || role === "canvas",
		);
	const group = (roleClass: ColorRoleClass) =>
		paletteGroupFor(roleClass, facts, isUserAgentDefault);
	if (isUserAgentDefault)
		return {
			token,
			roleClass: "neutral",
			group: group("neutral"),
			roleLabel: "Default text",
			rationale:
				"Matches the user-agent text colour and carries no custom-property evidence, so it is not treated as a brand decision.",
			userAgentDefault: true,
		};
	if (SEMANTIC_NAME.test(haystack))
		return {
			token,
			roleClass: "semantic",
			group: group("semantic"),
			roleLabel: "Semantic state",
			rationale:
				"Resolved from a custom property the page named after a state, so it reads as a semantic colour rather than decoration.",
			userAgentDefault: false,
		};
	// Only a filled action surface can establish a primary action colour. Text
	// painted on an action element is not the action colour itself, so the check
	// reads the paired role/property context rather than the two lists.
	if (BRAND_NAME.test(haystack)) {
		// An equal-valued custom property is an association, not proof of use:
		// a single sighting stays an accent even when it fills one action
		// element. Only repetition promotes it to a confirmed brand colour.
		const repeated = token.usage.frequency >= BRAND_MIN_FREQUENCY;
		if (repeated)
			return {
				token,
				roleClass: "brand",
				group: group("brand"),
				roleLabel: roleLabelFor("brand", facts),
				rationale:
					"Resolved from a custom property the page named for its brand or primary action, with repeated or action-grounded usage.",
				userAgentDefault: false,
			};
		return {
			token,
			roleClass: "accent",
			group: group("accent"),
			roleLabel: roleLabelFor("accent", facts),
			rationale:
				"Resolved from a brand-named custom property but measured only once without action fill, so it is recorded as an accent rather than a confirmed brand colour.",
			userAgentDefault: false,
		};
	}
	// Only a background fill on an action element associates the colour with
	// the action. Text painted on an action element (for example white label
	// copy on a filled button) is text, not the action colour itself.
	const onAction = token.usage.contexts.includes(
		colorContext("cta", "background-color"),
	);
	if (onAction)
		return {
			token,
			roleClass: "accent",
			group: group("accent"),
			roleLabel: "Action accent",
			rationale:
				"Measured on action backgrounds; frequency alone does not establish brand identity or primary/secondary hierarchy.",
			userAgentDefault: false,
		};
	if (NEUTRAL_NAME.test(haystack))
		return {
			token,
			roleClass: "neutral",
			group: group("neutral"),
			roleLabel: roleLabelFor("neutral", facts),
			rationale:
				"Resolved from a custom property the page named for a structural role.",
			userAgentDefault: false,
		};
	const surfaceOnly =
		token.usage.properties.includes("background-color") &&
		token.usage.frequency >= 2 &&
		hasPageSurfaceRole(token.usage.roles);
	return {
		token,
		roleClass: surfaceOnly ? "neutral" : "unknown",
		group: group(surfaceOnly ? "neutral" : "unknown"),
		roleLabel: roleLabelFor(surfaceOnly ? "neutral" : "unknown", facts),
		rationale: surfaceOnly
			? `Repeated on ${token.usage.frequency} measured surfaces, so it reads as a structural surface colour.`
			: "Measured usage is too thin to assign a brand, accent or semantic role.",
		userAgentDefault: false,
	};
}

export function classifyColors(
	elements: VisualElementEvidence[],
): ColorClassification[] {
	return normalizeColors(elements).map(classifyColorToken);
}
