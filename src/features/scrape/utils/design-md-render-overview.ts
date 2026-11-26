import type { DesignTokenModel } from "../services/design-model";
import { escapeCell, heading, table } from "./design-md-markdown";
import type { RenderDesignMdOptions } from "./design-md-render";
import { viewportLabelForWidth } from "./design-view-contexts";

// Section 1: what was captured, what the analysis actually achieved, and which
// contexts are verified. A requested preference is never reported as a verified
// result, and a failed enrichment is never hidden behind measured data.

interface CaptureContext {
	width: number;
	height: number;
	colorScheme: string;
	sourceUrl: string;
}

export function captureContexts(model: DesignTokenModel): CaptureContext[] {
	return (
		model.capturedViews ?? [
			{ ...model.viewport, colorScheme: "auto", sourceUrl: model.sourceUrl },
		]
	);
}

function observedThemes(model: DesignTokenModel): ("light" | "dark")[] {
	const themes = new Set<"light" | "dark">();
	for (const view of model.views ?? [])
		if (view.observedTheme === "light" || view.observedTheme === "dark")
			themes.add(view.observedTheme);
	if (
		!model.views?.length &&
		(model.theme === "light" || model.theme === "dark")
	)
		themes.add(model.theme);
	return [...themes];
}

function captureAppearance(
	model: DesignTokenModel,
	index: number,
): "light" | "dark" | "unknown" {
	const observed = model.views?.[index]?.observedTheme;
	if (observed === "light" || observed === "dark") return observed;
	return model.theme;
}

// The requested preference and the rendered appearance are two different facts,
// so the column states only whether the request was honoured.
function verifiedAppearance(
	requested: string,
	appearance: "light" | "dark" | "unknown",
): string {
	if (appearance === "unknown") return "unknown";
	if (requested === "auto") return "observed";
	return requested === appearance ? "yes" : "no";
}

function unverifiedNotes(
	model: DesignTokenModel,
	captures: CaptureContext[],
): string[] {
	const notes: string[] = [];
	const observed = new Set(observedThemes(model));
	const requested = model.settings?.theme ?? "auto";
	const requestedThemes =
		requested === "both"
			? (["light", "dark"] as const)
			: requested === "auto"
				? []
				: [requested];
	for (const theme of requestedThemes)
		if (!observed.has(theme))
			notes.push(
				`${theme} appearance — requested but never rendered, so no ${theme} tokens are defined`,
			);
	if (!observed.size)
		notes.push(
			"the page appearance — the measured canvas could not establish light or dark, so the theme is reported as unknown",
		);
	const widths = new Set(captures.map((capture) => capture.width));
	const first = captures[0];
	if (widths.size === 1 && first)
		notes.push(
			`a second viewport — only ${first.width}x${first.height} was measured, so no responsive rule is established`,
		);
	else if (widths.size > 1)
		notes.push("intermediate breakpoints between the measured widths");
	notes.push(
		"interaction states (hover, focus, disabled) and content outside the sampled elements",
	);
	return notes;
}

export function renderOverviewSection(
	lines: string[],
	model: DesignTokenModel,
	options: RenderDesignMdOptions,
): void {
	const captures = captureContexts(model);
	const settings = model.settings;
	const elements = model.measurementProvenance.elements;
	lines.push("", heading(2, "Overview & Capture Confidence"));
	lines.push(
		"",
		`**Source:** ${escapeCell(model.sourceUrl)} · captured ${escapeCell(model.capturedAt)}`,
		`**Requested scope:** ${settings ? `viewport ${settings.viewport}; theme ${settings.theme}; focus ${settings.focus}; depth ${settings.depth}; code reference ${settings.codeReference}` : "not recorded"}.`,
		`**Analysis status:** ${elements} visible element${elements === 1 ? "" : "s"} measured across ${captures.length} capture${captures.length === 1 ? "" : "s"}; ${
			options.enrichmentUnavailable
				? "AI synthesis unavailable, so this is a measurement-only document"
				: "AI synthesis applied, so the narrative sections are included"
		}.`,
	);
	if (options.enrichmentUnavailable) {
		lines.push(
			"",
			"The AI synthesis step did not produce a narrative for this capture. AI synthesis is unavailable or did not run. Available measurements remain usable within the capture scope, not a complete website specification.",
		);
		if (options.enrichmentDetail?.trim())
			lines.push(`- ${escapeCell(options.enrichmentDetail.trim())}`);
	}
	if (captures.length > 1) {
		lines.push(
			"",
			"Requested browser preference is not the same as a verified website theme; the appearance column is what the canvas actually rendered.",
			"",
			table(
				[
					"Capture",
					"Viewport",
					"Requested preference",
					"Observed appearance",
					"Preference honoured",
				],
				captures.map((capture, index) => {
					const appearance = captureAppearance(model, index);
					return [
						String(index + 1),
						`${capture.width}x${capture.height}`,
						escapeCell(capture.colorScheme),
						escapeCell(appearance),
						escapeCell(verifiedAppearance(capture.colorScheme, appearance)),
					];
				}),
			),
		);
	}
	// A single capture needs no context table: its viewport, preference and
	// appearance are already stated by the verified-contexts line below, and the
	// source URL is stated above.
	const verified = [
		...new Set(
			captures.map((capture, index) => {
				const appearance = captureAppearance(model, index);
				return `${viewportLabelForWidth(capture.width)} ${capture.width}x${capture.height} (${appearance})`;
			}),
		),
	];
	lines.push(
		"",
		`**Verified contexts:** ${verified.map(escapeCell).join("; ")}.`,
		`**Not verified:** ${unverifiedNotes(model, captures)
			.map(escapeCell)
			.join("; ")}.`,
	);
}

// The AI visual direction is one narrative block of its own, so a document with
// enrichment never repeats it inside the measurement sections.
export function renderIdentitySection(
	lines: string[],
	options: RenderDesignMdOptions,
): void {
	const identity = options.identityNarrative?.trim();
	if (!identity) return;
	lines.push("", heading(2, "Visual Identity"), "", identity);
}
