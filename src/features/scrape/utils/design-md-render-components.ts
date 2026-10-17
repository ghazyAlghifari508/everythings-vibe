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
			description: component.description,
			evidence: component.evidence,
		}),
	);
	const aiComponents = options.componentPatterns ?? [];
	const seenNames = new Set(
		aiComponents.map((component) => component.name.toLowerCase()),
	);
	const mergedComponents = [
		...aiComponents,
		...observedComponents.filter(
			(component) => !seenNames.has(component.name.toLowerCase()),
		),
	];
	if (focus !== "visual-tokens" && mergedComponents.length) {
		lines.push("", heading(2, "Components"), "");
		for (const component of mergedComponents) {
			lines.push(heading(3, escapeCell(component.name)));
			lines.push("", escapeCell(component.description), "");
			lines.push(`**Evidence:** ${escapeCell(component.evidence)}`);
			lines.push(
				"",
				"Reuse this treatment for the same class of elements to retain visual consistency.",
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
	} else {
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
