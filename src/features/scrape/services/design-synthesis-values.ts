import { normalizeColor } from "../utils/design-color-parse";
import type { DesignTokenModel } from "./design-model";

// Value validation for the AI synthesis step.
//
// The synthesis is prose, so a literal scan cannot be a fabrication-proof gate.
// What it can do is refuse the value classes that have an exact parser: a
// colour literal, a CSS length, and a font family named in a family context.
// Each check compares against the measured model, so a value that was never
// measured cannot reach the document as a rule.
//
// This module validates values only. It does not decide whether a claim is
// supported: that is the scope check in design-synthesis-claims.ts.

export interface ValueIssue {
	code: "unknown-value";
	detail: string;
}

// A CSS colour literal in any of its forms.
const COLOR_LITERAL = /#[0-9a-f]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\([^)]*\)/gi;
// A CSS length, including a percentage. The percentage has no word boundary
// after it, so it cannot use the same boundary rule as the other units.
const LENGTH_LITERAL =
	/-?(?:\d*\.)?\d+(?:px\b|rem\b|em\b|%|vh\b|vw\b|ch\b|vmin\b|vmax\b|pt\b)/gi;
// A family named in an explicit family context.
const FAMILY_CONTEXT =
	/\b(?:font|font-family|font-family:|typeface|type face)\s*(?:family\s*)?[:=]?\s*["']?([A-Za-z][A-Za-z0-9 \-+]*)["']?/gi;
// A family named in a family position in prose, e.g. "set headings in Georgia".
// The sentence must also talk about type, so an ordinary capitalised phrase
// such as "use cards in a Grid layout" is never read as a family name.
const TYPOGRAPHY_CONTEXT =
	/\b(?:font|fonts|typeface|type|typographic|typography|heading|headings|title|titles|body|copy|label|labels|text|display|caption)\b/i;
const FAMILY_PROSE =
	/\b(?:set|use|render|display|style|apply|write|choose|keep)\b[^.]{0,60}?\b(?:in|with|as)\s+([A-Za-z][A-Za-z0-9-]*(?:\s+[A-Za-z][A-Za-z0-9-]*){0,2})/gi;

// A family name is written as a proper name, so every word in it starts with
// a capital. An ordinary phrase such as "a Grid layout" is not a family.
function isProperName(value: string): boolean {
	const words = value.trim().split(/\s+/);
	return words.every((word) => /^[A-Z][A-Za-z0-9-]*$/.test(word));
}

// Generic families are always available to a browser, so naming one is not a
// claim about a measured typeface.
const GENERIC_FAMILIES = new Set([
	"serif",
	"sans-serif",
	"monospace",
	"cursive",
	"fantasy",
	"system-ui",
	"ui-sans-serif",
	"ui-serif",
	"ui-monospace",
	"inherit",
	"initial",
	"unset",
	"revert",
]);

function measuredColors(model: DesignTokenModel): Set<string> {
	const values = new Set<string>();
	for (const color of model.colors) {
		values.add(color.value.toLowerCase());
		const normalized = normalizeColor(color.value);
		if (normalized) {
			values.add(normalized.hex.toLowerCase());
			values.add(normalized.css.toLowerCase());
		}
	}
	return values;
}

// A functional colour is compared by its parsed identity, so the same colour
// written in two spellings is one value.
function colorIdentity(value: string): string | null {
	const normalized = normalizeColor(value);
	if (!normalized) return null;
	return normalized.hex.toLowerCase();
}

function measuredLengths(model: DesignTokenModel): Set<string> {
	const values = new Set<string>();
	const collect = (value?: string | null) => {
		if (!value || typeof value !== "string") return;
		for (const match of value.match(LENGTH_LITERAL) ?? [])
			values.add(match.toLowerCase());
	};
	for (const entry of model.typography) {
		collect(entry.fontSize);
		collect(entry.lineHeight);
		collect(entry.letterSpacing);
	}
	for (const typeface of model.typefaces) {
		for (const size of typeface.measuredSizes ?? []) collect(size);
		for (const lineHeight of typeface.lineHeights ?? []) collect(lineHeight);
		for (const spacing of typeface.letterSpacings ?? []) collect(spacing);
	}
	for (const token of model.spacing) collect(token.value);
	for (const token of model.radii) collect(token.value);
	for (const token of model.elevation) collect(token.value);
	return values;
}

function measuredFamilies(model: DesignTokenModel): Set<string> {
	const families = new Set<string>();
	for (const typeface of model.typefaces)
		if (typeface.family) families.add(typeface.family.toLowerCase());
	for (const entry of model.typography)
		if (entry.fontFamily)
			families.add(entry.fontFamily.split(",")[0]?.trim().toLowerCase() ?? "");
	return families;
}

// Checks every value literal in the prose against the measured model. Each
// segment is checked on its own, so a family name is only read from a
// sentence that also talks about type.
export function validateSynthesisValues(
	segments: string[],
	model: DesignTokenModel,
): ValueIssue[] {
	const issues: ValueIssue[] = [];
	const colors = measuredColors(model);
	const lengths = measuredLengths(model);
	const families = measuredFamilies(model);
	for (const segment of segments) {
		for (const match of segment.matchAll(COLOR_LITERAL)) {
			const literal = match[0];
			const identity = colorIdentity(literal);
			if (identity) {
				if (colors.has(identity) || colors.has(literal.toLowerCase())) continue;
			} else if (colors.has(literal.toLowerCase())) continue;
			issues.push({
				code: "unknown-value",
				detail: `Prose cites colour ${literal}, which was not measured.`,
			});
		}
		for (const match of segment.matchAll(LENGTH_LITERAL)) {
			if (lengths.has(match[0].toLowerCase())) continue;
			issues.push({
				code: "unknown-value",
				detail: `Prose cites measurement ${match[0]}, which was not measured.`,
			});
		}
		for (const match of segment.matchAll(FAMILY_CONTEXT)) {
			const named = (match[1] ?? "").trim();
			if (!named) continue;
			for (const part of named.split(",")) {
				const family = part
					.trim()
					.replace(/^["']|["']$/g, "")
					.toLowerCase();
				if (!family) continue;
				if (GENERIC_FAMILIES.has(family)) continue;
				if (families.has(family)) continue;
				issues.push({
					code: "unknown-value",
					detail: `Prose cites font family ${part.trim()}, which was not measured.`,
				});
			}
		}
		if (!TYPOGRAPHY_CONTEXT.test(segment)) continue;
		for (const match of segment.matchAll(FAMILY_PROSE)) {
			const named = (match[1] ?? "").trim();
			if (!isProperName(named)) continue;
			const family = named.toLowerCase();
			if (GENERIC_FAMILIES.has(family)) continue;
			if (families.has(family)) continue;
			issues.push({
				code: "unknown-value",
				detail: `Prose cites font family ${named}, which was not measured.`,
			});
		}
	}
	return issues;
}
