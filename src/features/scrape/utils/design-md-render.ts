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
	viewOptions?: Record<number, RenderDesignMdOptions>;
	/** Enrichment prose from the AI step, already validated against the model. */
	essence?: string;
	overview?: string;
	theme?: "light" | "dark" | "unknown";
	identityNarrative?: string;
	componentPatterns?: { name: string; description: string; evidence: string }[];
	layoutPrinciples?: string[];
	imageryNotes?: string[];
	implementationGuidance?: string[];
	limitations?: string[];
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

	if (model.views?.length) {
		const sections = new Map<string, { label: string; body: string }[]>();
		for (const view of model.views) {
			const scoped: string[] = [];
			const scopedOptions = options.viewOptions?.[view.id] ?? {};
			renderTokenSections(scoped, view.model, scopedOptions);
			renderComponentSections(scoped, view.model, scopedOptions);
			renderCodeSections(scoped, view.model, scopedOptions);
			for (const section of scoped.join("\n").split(/^## /m).slice(1)) {
				const [title, ...body] = section.split("\n");
				if (!title) continue;
				const entries = sections.get(title) ?? [];
				entries.push({ label: view.label, body: body.join("\n").trim() });
				sections.set(title, entries);
			}
		}
		lines.push(heading(1, `${model.title} - Style Reference`));
		for (const [title, entries] of sections) {
			lines.push("", heading(2, title));
			if (
				entries.length === model.views.length &&
				entries.every((entry) => entry.body === entries[0]?.body)
			)
				lines.push(
					"",
					"Shared across the captured contexts:",
					entries[0]?.body ?? "",
				);
			else
				for (const entry of entries)
					lines.push(
						"",
						heading(3, entry.label),
						"",
						entry.body.replace(/^### /gm, "#### "),
					);
		}
		for (const kind of ["responsive", "theme"] as const) {
			const changes =
				model.comparisons?.filter((entry) => entry.kind === kind) ?? [];
			if (!changes.length) continue;
			lines.push(
				"",
				heading(
					2,
					kind === "responsive" ? "Responsive Guidelines" : "Theme Variations",
				),
				"",
				"Matched samples with unchanged content only. These are endpoint observations, not original CSS breakpoints or proof of a website theme switch.",
				"",
				table(
					["Component", "Property", "Measured difference"],
					changes.map((entry) => [
						entry.role,
						entry.property,
						entry.values
							.map(
								(value) =>
									`Capture ${value.capture}: ${escapeCell(value.value)}`,
							)
							.join("; "),
					]),
				),
			);
		}
	} else {
		renderTokenSections(lines, model, options);
		renderComponentSections(lines, model, options);
		renderCodeSections(lines, model, options);
	}

	// --- 16. Limitations & confidence notes ---------------------------------
	lines.push("", heading(2, "Limitations & Confidence Notes"));
	lines.push(
		"",
		"Measurements are observed; semantic classifications are inferred from measured usage. Missing evidence is reported as unknown rather than estimated.",
	);
	if (options.enrichmentUnavailable) {
		lines.push(
			"",
			"The AI synthesis step did not produce a narrative for this capture. AI synthesis is unavailable or did not run. Available measurements remain usable within the capture scope, not a complete website specification.",
		);
		if (options.enrichmentDetail?.trim())
			lines.push(`- ${escapeCell(options.enrichmentDetail.trim())}`);
	}
	for (const limitation of model.views?.length
		? [...new Set(model.views.flatMap((view) => view.model.limitations))]
		: model.limitations)
		lines.push(`- ${escapeCell(limitation)}`);
	for (const limitation of options.limitations ?? [])
		lines.push(`- AI inference limitation: ${escapeCell(limitation)}`);

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
