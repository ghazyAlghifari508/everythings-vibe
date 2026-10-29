import type { ColorRoleClass } from "../utils/design-normalize-color";
import type {
	RadiusPurpose,
	SpacingPurpose,
} from "../utils/design-normalize-shape";
import type { TypeScaleRole } from "../utils/design-normalize-typography";
import type { DesignSettings } from "./scrape-contract";

// The structured design model is the single source of truth for both the
// DESIGN.md document and the Style Inspector. Both renderers read this model, so
// they cannot disagree.
//
// Every value carries an epistemic status:
//   observed — measured directly from the rendered page.
//   inferred — a classification derived from observations, with its rationale.
//   unknown  — the capture cannot support an answer.
//
// An inferred value is never stored as an observed one.

export const MODEL_VERSION = 2 as const;

export type Confidence = "observed" | "inferred" | "unknown";

export interface ModelNote {
	confidence: Confidence;
	detail: string;
}

export interface ModelColorToken {
	name: string;
	value: string;
	token: string;
	role: string;
	roleClass: ColorRoleClass;
	frequency: number;
	/** Why this role was assigned, and what evidence supports it. */
	rationale: string;
	confidence: Confidence;
	userAgentDefault: boolean;
	variableNames: string[];
	selectors: string[];
}

export interface ModelTypeEntry {
	role: TypeScaleRole;
	fontFamily: string;
	fontSize: string;
	fontSizePx: number;
	fontWeight: string;
	lineHeight: string;
	letterSpacing: string;
	frequency: number;
	elementRoles: string[];
	/** Raw page text for validation only; the displayed specimen is role-based. */
	sample: string;
	confidence: Confidence;
}

export interface ModelTypeface {
	family: string;
	stack: string;
	measuredWeights: string[];
	measuredSizes: string[];
	roles: TypeScaleRole[];
	lineHeights: string[];
	letterSpacings: string[];
	loadedEvidence: boolean;
	declaredFaces: { family: string; weight: string; status: string }[];
	confidence: Confidence;
	uncertainty: string | null;
	/** Raw page text for this family; validation only, never a public specimen. */
	sample: string;
}

export interface ModelSpacingToken {
	purpose: SpacingPurpose;
	property: string;
	value: string;
	valuePx: number;
	frequency: number;
	roles: string[];
	onScale: boolean;
	confidence: Confidence;
}

export interface ModelRadiusToken {
	purpose: RadiusPurpose;
	value: string;
	valuePx: number;
	frequency: number;
	roles: string[];
	/** The capture this value was measured in, empty for a single capture. */
	scope: string;
	confidence: Confidence;
	/** True when element geometry proves the shape is fully rounded. */
	pill?: boolean;
}

export interface ModelElevationToken {
	value: string;
	frequency: number;
	roles: string[];
	usageNote: string;
	confidence: Confidence;
}

export interface ModelSurface {
	value: string;
	level: number;
	frequency: number;
	roles: string[];
	confidence: Confidence;
}

export interface ModelGuideline {
	rule: string;
	/** The measured pattern this rule was derived from. */
	evidence: string;
}

export interface ModelComponentCharacteristic {
	label: string;
	value: string;
}

export interface ModelComponentTreatment {
	/** Human label for the measured variant, ordered by measured support. */
	label: string;
	/** Curated measured properties; noise defaults are already removed. */
	properties: Record<string, string>;
	/** Characteristics this variant does not share with the other variants. */
	characteristics: ModelComponentCharacteristic[];
	width: number;
	height: number;
	samples: number;
	selectors: string[];
}

export interface ModelComponent {
	treatments?: ModelComponentTreatment[];
	name: string;
	/** Semantic purpose of the component class, inferred from its DOM role. */
	purpose: string;
	/** Characteristics every measured variant shares. */
	sharedCharacteristics: ModelComponentCharacteristic[];
	/** Honest statement of what this component class does not establish. */
	description: string;
	evidence: string;
	frequency: number;
	roles: string[];
	/** How many distinct measured treatments this component describes. */
	treatmentCount: number;
	/** Evidence-grounded implementation guidance for the component class. */
	guidance: string[];
}

export interface ModelGuidelines {
	dos: ModelGuideline[];
	donts: ModelGuideline[];
	limitations: string[];
}

export interface DesignComparison {
	kind: "responsive" | "theme";
	role: string;
	property: string;
	values: { capture: number; value: string }[];
	provenance: { capture: number; element: number }[];
	confidence: Confidence;
}

export interface DesignView {
	id: number;
	label: string;
	observedTheme: "light" | "dark" | "unknown";
	model: DesignTokenModel;
}

export interface DesignTokenModel {
	views?: DesignView[];
	comparisons?: DesignComparison[];
	settings?: DesignSettings;
	capturedViews?: {
		width: number;
		height: number;
		colorScheme: string;
		sourceUrl: string;
	}[];
	version: typeof MODEL_VERSION;
	title: string;
	essence: string;
	theme: "light" | "dark" | "unknown";
	overview: string;
	sourceUrl: string;
	capturedAt: string;
	viewport: { width: number; height: number };
	baseUnitPx: number;
	colors: ModelColorToken[];
	typography: ModelTypeEntry[];
	typefaces: ModelTypeface[];
	spacing: ModelSpacingToken[];
	radii: ModelRadiusToken[];
	elevation: ModelElevationToken[];
	surfaces: ModelSurface[];
	/** Deterministic component patterns observed in the capture. */
	observedComponents: ModelComponent[];
	guidelines: ModelGuidelines;
	/** Honest statement of what the capture could not establish. */
	limitations: string[];
	/** Every measurement stays available for audit, separate from the curation. */
	measurementProvenance: {
		elements: number;
		colorObservations: number;
		distinctColorValues: number;
		typeStyles: number;
		spacingObservations: number;
		radiusObservations: number;
		shadowObservations: number;
	};
}
