import type { DesignTokenModel } from "../services/design-model";
import { MODEL_VERSION } from "../services/design-model";
import { escapeCell, heading, table } from "./design-md-markdown";
import { renderCodeSections } from "./design-md-render-code";
import { renderComponentSections } from "./design-md-render-components";
import { renderTokenSections } from "./design-md-render-tokens";

// Renders the canonical DESIGN.md from the validated structured model. Both the
// document and the Style Inspector read the same model, so they cannot disagree,
// and the renderer never invents a value the model does not contain.

export interface RenderDesignMdOptions {
	/** Enrichment prose from the AI step, already validated against the model. */
	essence?: string;
	overview?: string;
	theme?: "light" | "dark" | "unknown";
	identityNarrative?: string;
	componentPatterns?: { name: string; description: string; evidence: string }[];
	layoutPrinciples?: string[];
	imageryNotes?: string[];
	implementationGuidance?: string[];
	/** True when the AI synthesis step did not run or did not succeed. */
	enrichmentUnavailable?: boolean;
	/**
	 * Safe failure detail rendered as a limitation, so the cause survives
	 * persistence and reload inside the document. Must only carry fixed safe
	 * strings, never a raw provider message.
	 */
	enrichmentDetail?: string;
}

export function renderDesignMd(
	model: DesignTokenModel,
	options: RenderDesignMdOptions = {},
): string {
	const lines: string[] = [];

	renderTokenSections(lines, model, options);
	renderComponentSections(lines, model, options);
	renderCodeSections(lines, model, options);

	// --- 16. Limitations & confidence notes ---------------------------------
	lines.push("", heading(2, "Limitations & Confidence Notes"));
	lines.push(
		"",
		"Measurements are observed; semantic classifications are inferred from measured usage. Missing evidence is reported as unknown rather than estimated.",
	);
	if (options.enrichmentUnavailable) {
		lines.push(
			"",
			"The AI synthesis step did not produce a narrative for this capture. The measured tokens below are complete and unaffected.",
		);
		if (options.enrichmentDetail?.trim())
			lines.push(`- ${escapeCell(options.enrichmentDetail.trim())}`);
	}
	for (const limitation of model.limitations)
		lines.push(`- ${escapeCell(limitation)}`);

	// --- 17. Measurement provenance -----------------------------------------
	lines.push("", heading(2, "Measurement Provenance"), "");
	lines.push(
		table(
			["Measurement", "Count"],
			[
				[
					"Visible elements sampled",
					String(model.measurementProvenance.elements),
				],
				[
					"Colour observations",
					String(model.measurementProvenance.colorObservations),
				],
				[
					"Distinct colour values",
					String(model.measurementProvenance.distinctColorValues),
				],
				["Type styles grouped", String(model.measurementProvenance.typeStyles)],
				[
					"Spacing observations",
					String(model.measurementProvenance.spacingObservations),
				],
				[
					"Radius observations",
					String(model.measurementProvenance.radiusObservations),
				],
				[
					"Shadow observations",
					String(model.measurementProvenance.shadowObservations),
				],
			],
		),
	);
	lines.push(
		"",
		`Document model version ${MODEL_VERSION}. Captured ${model.capturedAt}.`,
	);

	return lines.join("\n");
}

export { isValidCssColor, isValidCssLength, tokenName } from "./design-md-css";
export {
	DESIGN_MD_SECTIONS,
	type DesignMdSection,
	escapeCell,
} from "./design-md-markdown";
export {
	type DesignMdIssue,
	designMdIssueSchema,
	validateDesignMd,
} from "./design-md-validate";
