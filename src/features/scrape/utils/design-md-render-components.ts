import { SEMANTIC_PROPERTIES } from "../services/design-capture-comparison";
import type { DesignTokenModel } from "../services/design-model";
import { escapeCell, heading, table } from "./design-md-markdown";
import type { RenderDesignMdOptions } from "./design-md-render";

// Components, rules, surfaces, elevation, imagery and layout (sections 7-12).

export function renderComponentSections(
	lines: string[],
	model: DesignTokenModel,
	options: RenderDesignMdOptions,
): void {
	const focus = model.settings?.focus ?? "complete";

	// --- 7. Components -------------------------------------------------------
	// Observed patterns are always rendered when justified by evidence; AI
	// patterns enrich them when synthesis succeeded.
	const observedComponents = (model.observedComponents ?? []).map(
		(component) => ({
			name: component.name,
			description:
				component.treatments
					?.map((treatment, index) =>
						[
							`Treatment ${index + 1} (${treatment.samples} measured samples):`,
							...Object.entries(treatment.properties).map(
								([property, value]) =>
									`${SEMANTIC_PROPERTIES[property] ?? property}: ${value}`,
							),
							`Measured size: ${treatment.width}px wide, ${treatment.height}px high (content-dependent).`,
						].join("\n"),
					)
					.join("\n\n") ?? component.description,
			evidence: `Measured on ${component.frequency} ${component.roles.join(", ")} elements; ${component.treatmentCount} distinct treatments. Role inferred from DOM; provenance retained in raw capture evidence.`,
		}),
	);
	const aiComponents = options.componentPatterns ?? [];
	const mergedComponents = [
		...observedComponents,
		...aiComponents.map((component) => ({
			...component,
			name: `${component.name} (AI inference)`,
		})),
	];
	if (focus !== "visual-tokens" && mergedComponents.length) {
		lines.push("", heading(2, "Components"), "");
		for (const component of mergedComponents) {
			lines.push(heading(3, escapeCell(component.name)));
			lines.push(
				"",
				...component.description
					.split("\n")
					.filter(Boolean)
					.map((line) => `- ${escapeCell(line)}`),
				"",
			);
			lines.push(`**Evidence:** ${escapeCell(component.evidence)}`);
			lines.push(
				"",
				"Map this treatment only to matching components and the cited capture scope. Component roles and hierarchy are inferred; measurements do not establish unseen variants or interaction states.",
			);
		}
	}

	// --- 8. Do's and Don'ts --------------------------------------------------
	const { dos, donts } = model.guidelines;
	if (dos.length || donts.length) {
		lines.push("", heading(2, "Do's and Don'ts"));
		lines.push(
			"",
			"Each rule is derived from a repeated measured pattern; the evidence line names it.",
		);
		if (dos.length) {
			lines.push("", heading(3, "Do"));
			for (const rule of dos)
				lines.push(
					`- ${escapeCell(rule.rule)}`,
					`  - _Evidence:_ ${escapeCell(rule.evidence)}`,
				);
		}
		if (donts.length) {
			lines.push("", heading(3, "Don't"));
			for (const rule of donts)
				lines.push(
					`- ${escapeCell(rule.rule)}`,
					`  - _Evidence:_ ${escapeCell(rule.evidence)}`,
				);
		}
	}

	// --- 9. Surfaces ---------------------------------------------------------
	if (model.surfaces.length) {
		lines.push("", heading(2, "Surfaces"), "");
		lines.push(
			table(
				["Level", "Value", "Measured on", "Purpose"],
				model.surfaces.map((surface, index) => [
					String(index),
					`\`${escapeCell(surface.value)}\``,
					String(surface.frequency),
					escapeCell(surface.roles.join(", ")),
				]),
			),
		);
	}

	// --- 10. Elevation -------------------------------------------------------
	if (model.elevation.length || !options.omitUnmeasuredElevation)
		lines.push("", heading(2, "Elevation"));
	if (model.elevation.length) {
		lines.push("");
		lines.push(
			table(
				["Shadow", "Measured on", "Notes"],
				model.elevation.map((token) => [
					`\`${escapeCell(token.value)}\``,
					String(token.frequency),
					escapeCell(token.usageNote),
				]),
			),
		);
	} else if (!options.omitUnmeasuredElevation) {
		lines.push(
			"",
			"No box-shadow was measured on visible elements, so elevation is not defined by shadows in this capture.",
		);
	}

	// --- 11. Imagery & Iconography ------------------------------------------
	const imagery = options.imageryNotes ?? [];
	if (imagery.length) {
		lines.push("", heading(2, "Imagery & Iconography"));
		for (const note of imagery) lines.push("", escapeCell(note));
	}

	// --- 12. Layout ----------------------------------------------------------
	const layout = options.layoutPrinciples ?? [];
	if (layout.length) {
		lines.push("", heading(2, "Layout"));
		for (const principle of layout) lines.push(`- ${escapeCell(principle)}`);
	}
}
