import {
	buildDesignModel,
	type DesignTokenModel,
	MODEL_VERSION,
} from "../services/design-model";
import {
	designIssues,
	designMdVersionOf,
	isCurrentModelDocument,
} from "../services/prompts-design-md";
import { parseVisualEvidence } from "../types/design-evidence-contract";
import { inspectorFromViews } from "./design-md-inspector-views";

// The Style Inspector reads the same validated structured model the document is
// rendered from, so the two cannot disagree about a measured value.
//
// A document that predates the structured model is still parsed as archived
// text, but it is explicitly labelled unverified: parsing a markdown archive
// cannot establish that its values were measured.

export type InspectorVerification = "observed" | "unverified";

export interface InspectorColorToken {
	name: string;
	value: string;
	token: string;
	role: string;
	roleClass: string;
	frequency: number;
	/** Why the role was assigned, and what evidence supports it. */
	rationale: string;
	confidence: string;
}

export interface InspectorTypeEntry {
	role: string;
	family: string;
	size: string;
	sizePx: number;
	weight: string;
	lineHeight: string;
	letterSpacing: string;
	frequency: number;
	/** A real sample taken from the measured page. */
	sample: string;
}

export interface InspectorTypeface {
	family: string;
	stack: string;
	weights: string[];
	sizes: string[];
	roles: string[];
	lineHeights: string[];
	letterSpacings: string[];
	loadedEvidence: boolean;
	declaredFaces: { family: string; weight: string; status: string }[];
	uncertainty: string | null;
	/** A real sample rendered in this family, when the capture recorded one. */
	sample: string;
}

export interface InspectorToken {
	label: string;
	value: string;
	/** The measured context this value came from. */
	context: string;
	frequency: number;
}

export interface InspectorRadiusToken extends InspectorToken {
	valuePx: number;
	/** True when the measured geometry proves the shape is fully rounded. */
	pill: boolean;
}

export interface InspectorElevationToken {
	value: string;
	frequency: number;
	roles: string[];
	usageNote: string;
	confidence: string;
}

export interface InspectorSurface {
	value: string;
	level: number;
	frequency: number;
	roles: string[];
}

export interface InspectorGuideline {
	rule: string;
	evidence: string;
}

export interface InspectorComponentCharacteristic {
	label: string;
	value: string;
}

export interface InspectorComponentVariant {
	label: string;
	samples: number;
	characteristics: InspectorComponentCharacteristic[];
}

export interface InspectorComponent {
	name: string;
	/** Semantic purpose inferred from the measured DOM role. */
	purpose: string;
	/** What this component class does not establish. */
	description: string;
	evidence: string;
	frequency: number;
	/** Characteristics every measured variant shares. */
	sharedCharacteristics: InspectorComponentCharacteristic[];
	variants: InspectorComponentVariant[];
	guidance: string[];
}

export interface DesignInspectorModel {
	verification: InspectorVerification;
	modelVersion: number;
	title: string;
	essence: string;
	theme: "light" | "dark" | "unknown";
	overview: string;
	colors: InspectorColorToken[];
	typography: InspectorTypeEntry[];
	typefaces: InspectorTypeface[];
	spacing: InspectorToken[];
	radii: InspectorRadiusToken[];
	elevation: InspectorElevationToken[];
	surfaces: InspectorSurface[];
	components: InspectorComponent[];
	baseUnitPx: number;
	dos: InspectorGuideline[];
	donts: InspectorGuideline[];
	limitations: string[];
}

// Builds the inspector view from a verified capture. The document, when given,
// must still match that capture, otherwise the model is refused so a stale
// archive is never shown as observed.
export function inspectorFromEvidence(
	value: unknown,
	document?: string,
): DesignInspectorModel | null {
	const evidence = parseVisualEvidence(value);
	if (!evidence) return null;
	// A current-model document is checked structurally; a legacy archive is
	// checked against the capture it came from.
	if (document !== undefined) {
		if (isCurrentModelDocument(document)) {
			if (!documentMatchesEvidence(document, evidence)) return null;
		} else if (designIssues(document, evidence).length) {
			return null;
		}
	}
	const model = buildDesignModel(evidence);
	return inspectorFromModel(model, "observed");
}

// A rendered document is consistent with its evidence when the measured values
// it must contain are all present. A single shared string is never sufficient:
// version, origin and a meaningful share of canonical measurements must match.
export function documentMatchesEvidence(
	document: string,
	evidence: {
		elements: { properties: Record<string, string> }[];
		sourceUrl?: string;
		viewport?: { width: number; height: number };
	},
): boolean {
	if (designMdVersionOf(document) < MODEL_VERSION) return false;
	if (evidence.sourceUrl && !document.includes(evidence.sourceUrl))
		return false;
	if (evidence.viewport) {
		const dims = `${evidence.viewport.width}x${evidence.viewport.height}`;
		if (!document.includes(dims)) return false;
	}
	let model: DesignTokenModel;
	try {
		const parsed = parseVisualEvidence(
			evidence.sourceUrl
				? evidence
				: { ...evidence, sourceUrl: "", viewport: { width: 1, height: 1 } },
		);
		if (!parsed) {
			return fallbackStringMatch(document, evidence);
		}
		model = buildDesignModel(parsed);
	} catch {
		return fallbackStringMatch(document, evidence);
	}
	const canonical: string[] = [
		...model.colors.map((color) => color.value),
		...model.typography.map((entry) => entry.fontSize),
		...model.spacing.map((token) => token.value),
		...model.radii.map((token) => token.value),
		...model.surfaces.map((surface) => surface.value),
	].filter((value) => value.trim().length > 0);
	if (!canonical.length) return fallbackStringMatch(document, evidence);
	let matched = 0;
	for (const value of new Set(canonical)) {
		if (document.includes(`\`${value}\``) || document.includes(value)) {
			// Avoid substring false positives for bare lengths: 8px must not
			// match inside 48px unless the fenced form matched.
			if (
				/^\d/.test(value) &&
				!document.includes(`\`${value}\``) &&
				!document.includes(` ${value} `)
			)
				continue;
			matched += 1;
		}
	}
	const coverage = matched / new Set(canonical).size;
	return matched >= 3 && coverage >= 0.4;
}

function fallbackStringMatch(
	document: string,
	evidence: {
		elements: { properties: Record<string, string> }[];
	},
): boolean {
	const measured = new Set<string>();
	for (const element of evidence.elements)
		for (const value of Object.values(element.properties))
			if (value.trim().length > 0) measured.add(value);
	let matched = 0;
	for (const value of measured)
		if (document.includes(`\`${value}\``)) matched += 1;
	return matched >= 3;
}

export function inspectorFromModel(
	model: DesignTokenModel,
	verification: InspectorVerification,
): DesignInspectorModel {
	if (model.views?.length) {
		const scoped = inspectorFromViews(model, verification, inspectorFromModel);
		if (scoped) return scoped;
	}
	return {
		verification,
		modelVersion: model.version,
		title: model.title,
		essence: model.essence,
		theme: model.theme,
		overview: model.overview,
		colors: model.colors.map((color) => ({
			name: color.name,
			value: color.value,
			token: color.token,
			role: color.role,
			roleClass: color.roleClass,
			frequency: color.frequency,
			rationale: color.rationale,
			confidence: color.confidence,
		})),
		typography: model.typography.map((entry) => ({
			role: entry.role,
			family: entry.fontFamily,
			size: entry.fontSize,
			sizePx: entry.fontSizePx,
			weight: entry.fontWeight,
			lineHeight: entry.lineHeight,
			letterSpacing: entry.letterSpacing,
			frequency: entry.frequency,
			sample: entry.sample,
		})),
		typefaces: model.typefaces.map((typeface) => ({
			family: typeface.family,
			stack: typeface.stack,
			weights: typeface.measuredWeights,
			sizes: typeface.measuredSizes,
			roles: typeface.roles,
			lineHeights: typeface.lineHeights,
			letterSpacings: typeface.letterSpacings,
			loadedEvidence: typeface.loadedEvidence,
			declaredFaces: typeface.declaredFaces,
			uncertainty: typeface.uncertainty,
			sample: typeface.sample,
		})),
		spacing: model.spacing.map((token) => ({
			label: token.purpose,
			value: token.value,
			context: `${token.property} on ${token.frequency} element`,
			frequency: token.frequency,
		})),
		radii: model.radii.map((token) => ({
			label: token.purpose,
			value: token.value,
			valuePx: token.valuePx,
			context: token.scope
				? `${token.frequency} element in ${token.scope}`
				: `${token.frequency} element`,
			frequency: token.frequency,
			pill: token.pill === true,
		})),
		elevation: model.elevation.map((token) => ({
			value: token.value,
			frequency: token.frequency,
			roles: token.roles,
			usageNote: token.usageNote,
			confidence: token.confidence,
		})),
		surfaces: model.surfaces.map((surface) => ({
			value: surface.value,
			level: surface.level,
			frequency: surface.frequency,
			roles: surface.roles,
		})),
		components: (model.observedComponents ?? []).map((component) => ({
			name: component.name,
			purpose: component.purpose,
			description: component.description,
			evidence: component.evidence,
			frequency: component.frequency,
			sharedCharacteristics: component.sharedCharacteristics,
			variants: (component.treatments ?? []).map((treatment) => ({
				label: treatment.label,
				samples: treatment.samples,
				characteristics: treatment.characteristics,
			})),
			guidance: component.guidance,
		})),
		baseUnitPx: model.baseUnitPx,
		dos: model.guidelines.dos,
		donts: model.guidelines.donts,
		limitations: model.limitations,
	};
}

export { parseDesignMd } from "./design-md-parse";
export {
	firstCssLength,
	normalizeFontWeight,
} from "./design-md-parse-markdown";
