import type { DesignTokenModel } from "../services/design-model";
import { MODEL_VERSION } from "../services/design-model";
import { partitionDesignViews } from "../services/design-shared-context";
import { scopedDeclarations } from "./design-md-css-scopes";
import {
	DESIGN_MD_SECTIONS,
	escapeCell,
	heading,
	table,
} from "./design-md-markdown";
import {
	renderCodeSections,
	renderScopedCodeSections,
} from "./design-md-render-code";
import {
	renderComponentSections,
	renderMergedComponentSections,
} from "./design-md-render-components";
import { renderImplementationGuide } from "./design-md-render-guide";
import {
	renderIdentitySection,
	renderOverviewSection,
} from "./design-md-render-overview";
import { renderTokenSections } from "./design-md-render-tokens";

// Renders the canonical DESIGN.md from the validated structured model. Both the
// document and the Style Inspector read the same model, so they cannot disagree,
// and the renderer never invents a value the model does not contain.

export interface RenderDesignMdOptions {
	viewOptions?: Record<number, RenderDesignMdOptions>;
	omitUnmeasuredElevation?: boolean;
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
	/** Labels the measured values of one capture inside a combined document. */
	captureScopeLabel?: string;
	/**
	 * True for a capture scope inside a combined document: the theme overview is
	 * stated once by the shared block, not repeated under every capture.
	 */
	omitThemeOverview?: boolean;
}

interface SectionEntry {
	label: string;
	body: string;
	shared: boolean;
}

// Splits rendered sections into the document's section order, so one section can
// carry shared facts while the rest stay scoped to the capture that measured
// them.
function collectSections(
	target: Map<string, SectionEntry[]>,
	lines: string[],
	label: string,
	shared: boolean,
): void {
	for (const section of lines.join("\n").split(/^## /m).slice(1)) {
		const [title, ...body] = section.split("\n");
		if (!title) continue;
		const entries = target.get(title) ?? [];
		entries.push({ label, body: body.join("\n").trim(), shared });
		target.set(title, entries);
	}
}

export function renderDesignMd(
	model: DesignTokenModel,
	options: RenderDesignMdOptions = {},
): string {
	const lines: string[] = [];

	if (model.views?.length) {
		renderCombinedDocument(lines, model, options);
	} else {
		// A document always opens with its own title, then the one-line essence.
		// Never append the suffix to a title that already carries it.
		const title = model.title?.trim() || "Design";
		lines.push(
			heading(
				1,
				/style reference/i.test(title) ? title : `${title} - Style Reference`,
			),
		);
		const essence =
			options.essence?.trim() ||
			model.essence?.trim() ||
			options.identityNarrative?.trim();
		if (essence) lines.push("", `> ${essence}`);
		renderOverviewSection(lines, model, options);
		renderIdentitySection(lines, options);
		renderImplementationGuide(lines, model, options);
		renderTokenSections(lines, model, options);
		renderComponentSections(lines, model, options);
		renderCodeSections(lines, model);
	}

	// --- Coverage & Important Limitations -----------------------------------
	lines.push("", heading(2, "Coverage & Important Limitations"));
	lines.push(
		"",
		"Measurements are observed; semantic classifications are inferred from measured usage. Missing evidence is reported as unknown rather than estimated.",
	);
	if (model.views?.length)
		lines.push(
			"",
			`This document combines ${model.views.length} captures. A value is shared only when every capture measured it; everything else stays scoped to the capture that produced it.`,
		);
	// The AI synthesis status is stated once in the overview, next to the
	// requested scope, so it is never repeated as a second, softer disclaimer.
	for (const limitation of documentLimitations(model, options))
		lines.push(`- ${escapeCell(limitation)}`);

	// A combined document omits the per-capture elevation note, so an absence of
	// measured shadow is stated once here instead of once per capture.
	if (model.views?.length) {
		const hasElevation = model.views.some(
			(view) => view.model.elevation.length > 0,
		);
		if (!hasElevation)
			lines.push(
				"- No box-shadow was measured on visible elements, so elevation is not defined by shadows.",
			);
	}

	// One compact line keeps the sampling evidence without a diagnostic table
	// dominating the document.
	const provenance = model.measurementProvenance;
	lines.push(
		"",
		`**Coverage:** ${provenance.elements} visible elements sampled from ${provenance.colorObservations} colour observations (${provenance.distinctColorValues} distinct values), ${provenance.typeStyles} type styles, ${provenance.spacingObservations} spacing and ${provenance.radiusObservations} radius observations, ${provenance.shadowObservations} shadow observations.`,
		"",
		`Document model version ${MODEL_VERSION}. Captured ${model.capturedAt}.`,
	);

	return lines.join("\n");
}

// One shared foundation set, one capture table, and scoped overrides. The
// captures never produce parallel copies of the same design system.
function renderCombinedDocument(
	lines: string[],
	model: DesignTokenModel,
	options: RenderDesignMdOptions,
): void {
	const views = model.views ?? [];
	const baseView = views[0];
	if (!baseView) return;
	const { shared, specific } = partitionDesignViews(views);
	const sections = new Map<string, SectionEntry[]>();

	const sharedLines: string[] = [];
	// Overview, identity and the implementation brief describe the document, not
	// one capture, so they are stated once for the shared block.
	renderOverviewSection(sharedLines, model, options);
	renderIdentitySection(sharedLines, options);
	renderImplementationGuide(sharedLines, model, options);
	renderTokenSections(sharedLines, shared, {
		...options,
		captureScopeLabel: "all captures",
		omitUnmeasuredElevation: true,
	});
	// One merged component specification and one rule list for the document.
	renderMergedComponentSections(sharedLines, views, {
		...options,
		omitUnmeasuredElevation: true,
	});
	collectSections(
		sections,
		sharedLines,
		"Shared across all captured contexts",
		true,
	);
	for (const view of specific) {
		const scoped: string[] = [];
		const viewOptions: RenderDesignMdOptions = {
			...options,
			...options.viewOptions?.[view.id],
			captureScopeLabel: view.label,
		};
		renderTokenSections(scoped, view.model, {
			...viewOptions,
			omitThemeOverview: true,
			omitUnmeasuredElevation: true,
		});
		collectSections(sections, scoped, view.label, false);
	}

	const codeLines: string[] = [];
	renderScopedCodeSections(
		codeLines,
		baseView.model,
		specific.map((view) =>
			scopedDeclarations(baseView.model, view.model, view.label),
		),
	);
	collectSections(sections, codeLines, "Shared", true);

	// Endpoint comparisons are their own sections, added to the ordered map so
	// they never land after later sections.
	for (const kind of ["responsive", "theme"] as const) {
		const changes =
			model.comparisons?.filter((entry) => entry.kind === kind) ?? [];
		if (!changes.length) continue;
		const title =
			kind === "responsive" ? "Responsive Differences" : "Theme Differences";
		const entries = sections.get(title) ?? [];
		entries.push({
			label: "all captures",
			shared: true,
			body: [
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
			].join("\n"),
		});
		sections.set(title, entries);
	}

	const combinedTitle = model.title?.trim() || "Design";
	lines.push(
		heading(
			1,
			/style reference/i.test(combinedTitle)
				? combinedTitle
				: `${combinedTitle} - Style Reference`,
		),
	);
	const essence =
		options.essence?.trim() ||
		model.essence?.trim() ||
		options.identityNarrative?.trim();
	if (essence) lines.push("", `> ${essence}`);

	// Render strictly in the canonical section order. Shared facts come first and
	// each capture contributes only its measured differences beneath them.
	for (const title of DESIGN_MD_SECTIONS) {
		const entries = sections.get(title);
		if (!entries?.length) continue;
		lines.push("", heading(2, title));
		for (const entry of entries.filter((entry) => entry.shared))
			lines.push("", entry.body);
		for (const entry of entries.filter((entry) => !entry.shared))
			lines.push(
				"",
				heading(3, entry.label),
				"",
				entry.body.replace(/^### /gm, "#### "),
			);
	}
}

// Limitation notes are aggregated by meaning: the same missing evidence in four
// captures is one limitation with four scopes, not four log lines.
function documentLimitations(
	model: DesignTokenModel,
	options: RenderDesignMdOptions,
): string[] {
	if (!model.views?.length) {
		return [...model.limitations, ...(options.limitations ?? [])];
	}
	const { shared, specific } = partitionDesignViews(model.views);
	const groups = new Map<string, Set<string>>();
	const add = (note: string, label?: string) => {
		const labels = groups.get(note) ?? new Set<string>();
		if (label) labels.add(label.replace(/:.*$/, ""));
		groups.set(note, labels);
	};
	for (const note of shared.limitations) add(note);
	for (const view of specific) {
		for (const note of view.model.limitations) add(note, view.label);
		for (const note of options.viewOptions?.[view.id]?.limitations ?? [])
			add(note, `AI inference (${view.label.replace(/:.*$/, "")})`);
	}
	for (const note of options.limitations ?? []) add(note, "AI inference");
	return [...groups].map(([note, labels]) => {
		if (!labels.size || labels.size === specific.length) return note;
		return `${[...labels].join(", ")}: ${note}`;
	});
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
