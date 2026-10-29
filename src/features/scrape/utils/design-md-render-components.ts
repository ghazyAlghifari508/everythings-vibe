import type {
	DesignTokenModel,
	ModelComponentCharacteristic,
	ModelComponentTreatment,
} from "../services/design-model";
import { escapeCell, heading, table } from "./design-md-markdown";
import type { RenderDesignMdOptions } from "./design-md-render";

// Components are rendered from the normalized component specification, never
// from raw computed CSS. Measured values carry a semantic label, identical
// measurements are stated once, and nothing the capture did not measure is
// asserted.
interface ComponentBlock {
	name: string;
	purpose?: string;
	shared: ModelComponentCharacteristic[];
	treatments: ModelComponentTreatment[];
	description: string;
	evidence: string;
	guidance: string[];
}

function characteristicLines(
	characteristics: ModelComponentCharacteristic[],
): string[] {
	return characteristics.map(
		(entry) => `- ${escapeCell(`${entry.label}: ${entry.value}`)}`,
	);
}

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
	const observedComponents: ComponentBlock[] = (
		model.observedComponents ?? []
	).map((component) => ({
		name: component.name,
		purpose: component.purpose,
		shared: component.sharedCharacteristics,
		treatments: component.treatments ?? [],
		description: component.description,
		evidence: `Measured on ${component.frequency} ${component.roles.join(", ")} element${component.frequency === 1 ? "" : "s"}; ${component.treatmentCount} distinct measured treatment${component.treatmentCount === 1 ? "" : "s"}. Role inferred from DOM.`,
		guidance: component.guidance,
	}));
	const aiComponents: ComponentBlock[] = (options.componentPatterns ?? []).map(
		(component) => ({
			name: `${component.name} (AI inference)`,
			shared: [],
			treatments: [],
			description: component.description,
			evidence: component.evidence,
			guidance: [],
		}),
	);
	const mergedComponents = [...observedComponents, ...aiComponents];
	if (focus !== "visual-tokens" && mergedComponents.length) {
		lines.push("", heading(2, "Components"), "");
		for (const component of mergedComponents) {
			lines.push(heading(3, escapeCell(component.name)), "");
			if (component.purpose)
				lines.push(`**Purpose:** ${escapeCell(component.purpose)}`, "");
			if (component.shared.length) {
				lines.push("**Visual characteristics:**");
				lines.push(...characteristicLines(component.shared), "");
			}
			if (component.treatments.length > 1)
				for (const treatment of component.treatments) {
					lines.push(
						`**${escapeCell(treatment.label)}** (${treatment.samples} measured sample${treatment.samples === 1 ? "" : "s"}):`,
					);
					lines.push(
						...(treatment.characteristics.length
							? characteristicLines(treatment.characteristics)
							: ["- Shares every measured characteristic listed above."]),
						"",
					);
				}
			for (const line of component.description.split("\n").filter(Boolean))
				lines.push(escapeCell(line), "");
			lines.push(`**Evidence:** ${escapeCell(component.evidence)}`);
			if (component.guidance.length) {
				lines.push("", "**Implementation guidance:**");
				for (const rule of component.guidance)
					lines.push(`- ${escapeCell(rule)}`);
			} else {
				lines.push(
					"",
					"Map this treatment only to matching components and the cited capture scope. Component roles and hierarchy are inferred; measurements do not establish unseen variants or interaction states.",
				);
			}
			lines.push("");
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
