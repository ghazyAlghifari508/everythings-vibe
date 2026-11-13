import type {
	DesignTokenModel,
	ModelComponent,
	ModelComponentCharacteristic,
	ModelComponentTreatment,
} from "../services/design-model";
import type { DesignView } from "../types/design-model";
import { escapeCell, heading } from "./design-md-markdown";
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

interface MergedVariant {
	label: string;
	samples: number;
	characteristics: Map<string, string>;
}

function variantSignature(treatment: ModelComponentTreatment): string {
	return JSON.stringify(
		treatment.characteristics
			.map(({ label, value }) => [label, value])
			.sort(([left], [right]) => String(left).localeCompare(String(right))),
	);
}

// Two variants that share a positional label are told apart by the measured
// characteristic that actually differs, never by a capture suffix alone.
function differingCharacteristic(
	variant: MergedVariant,
	siblings: MergedVariant[],
): string | null {
	const others = siblings.filter((entry) => entry !== variant);
	for (const [key, value] of variant.characteristics) {
		if (others.some((entry) => entry.characteristics.get(key) !== value))
			return `${key} ${value}`;
	}
	return null;
}

function characteristicLines(
	characteristics: ModelComponentCharacteristic[],
): string[] {
	return characteristics.map(
		(entry) => `- ${escapeCell(`${entry.label}: ${entry.value}`)}`,
	);
}

// Components, rules, surfaces, elevation, imagery and layout (sections 7-12).

// In a combined document the same component is measured in every capture. It is
// summarized once as a base style plus the values that actually change, instead
// of repeating the whole component under each capture.
export function renderMergedComponentSections(
	lines: string[],
	views: DesignView[],
	options: RenderDesignMdOptions,
): void {
	const first = views[0];
	if (!first) return;
	const focus = first.model.settings?.focus ?? "complete";

	// Imagery and layout describe the component family, so a token-only document
	// leaves them out.
	const imageryNotes =
		focus === "visual-tokens" ? [] : (options.imageryNotes ?? []);
	const layoutPrinciples =
		focus === "visual-tokens" ? [] : (options.layoutPrinciples ?? []);
	let renderedComponents = false;

	if (focus !== "visual-tokens") {
		const order: string[] = [];
		const perComponent = new Map<
			string,
			{
				component: ModelComponent;
				perView: Map<string, Map<string, string>>;
				variants: Map<string, MergedVariant>;
				/** True when at least one capture measured several treatments. */
				multiVariant: boolean;
			}
		>();
		for (const view of views)
			for (const component of view.model.observedComponents ?? []) {
				let entry = perComponent.get(component.name);
				if (!entry) {
					entry = {
						component,
						perView: new Map<string, Map<string, string>>(),
						variants: new Map(),
						multiVariant: false,
					};
					perComponent.set(component.name, entry);
					order.push(component.name);
				}
				if ((component.treatments?.length ?? 0) > 1) entry.multiVariant = true;
				entry.perView.set(
					view.label,
					new Map(
						component.sharedCharacteristics.map((entry) => [
							entry.label,
							entry.value,
						]),
					),
				);
				// Variants are keyed by their measured treatment, not by their positional
				// label: "Variant 1" of one capture is a different treatment from "Variant 1"
				// of another when the measured values differ.
				for (const treatment of component.treatments ?? []) {
					const key = `${treatment.label}\u0000${variantSignature(treatment)}`;
					const variant = entry.variants.get(key) ?? {
						label: treatment.label,
						samples: 0,
						characteristics: new Map<string, string>(),
					};
					variant.samples += treatment.samples;
					for (const characteristic of treatment.characteristics)
						variant.characteristics.set(
							characteristic.label,
							characteristic.value,
						);
					entry.variants.set(key, variant);
				}
			}

		if (order.length) {
			lines.push("", heading(2, "Component Specifications"), "");
			renderedComponents = true;
			// The handoff caveat applies to every measured component, so it is
			// stated once for the section.
			const commonNotes = (
				perComponent.get(order[0] ?? "")?.component.guidance ?? []
			).filter((rule) =>
				order.every((name) =>
					(perComponent.get(name)?.component.guidance ?? []).includes(rule),
				),
			);
			if (order.length > 1 && commonNotes.length) {
				lines.push("**Applies to every measured component:**");
				for (const rule of commonNotes) lines.push(`- ${escapeCell(rule)}`);
				lines.push("");
			}
			for (const name of order) {
				const entry = perComponent.get(name);
				if (entry) renderMergedComponent(lines, name, entry, commonNotes);
			}
		}
	}

	// Rules are stated once for the document: a general rule repeated per capture
	// is the same instruction, not new evidence. Rule text never carries a capture
	// scope, so identical rules collapse and only a rule limited to some captures
	// names the captures that measured it.
	const groupedRules = (
		read: (view: DesignView) => { rule: string; evidence: string }[],
	): string[] => {
		const groups = new Map<
			string,
			{ rule: string; evidence: string; scopes: string[] }
		>();
		for (const view of views)
			for (const entry of read(view)) {
				const group = groups.get(entry.rule) ?? {
					rule: entry.rule,
					evidence: entry.evidence,
					scopes: [],
				};
				if (!group.scopes.includes(view.label)) group.scopes.push(view.label);
				groups.set(entry.rule, group);
			}
		return [...groups.values()].map((group) => {
			const scope =
				group.scopes.length < views.length
					? ` Measured in: ${group.scopes.join("; ")}.`
					: ` Measured in all ${views.length} captured contexts.`;
			return `- ${escapeCell(group.rule)} _(evidence: ${escapeCell(`${group.evidence}${scope}`)})_`;
		});
	};
	const dos = groupedRules((view) => view.model.guidelines.dos);
	const donts = groupedRules((view) => view.model.guidelines.donts);
	if (dos.length || donts.length) {
		lines.push("", heading(2, "Do's & Don'ts"));
		if (dos.length) lines.push("", heading(3, "DO"), ...dos);
		if (donts.length) lines.push("", heading(3, "DON'T"), ...donts);
	}

	if (imageryNotes.length || layoutPrinciples.length) {
		if (!renderedComponents)
			lines.push("", heading(2, "Component Specifications"));
		if (imageryNotes.length) {
			lines.push("", heading(3, "Imagery & Iconography"));
			for (const note of imageryNotes) lines.push("", escapeCell(note));
		}
		if (layoutPrinciples.length) {
			lines.push("", heading(3, "Layout"));
			for (const principle of layoutPrinciples)
				lines.push(`- ${escapeCell(principle)}`);
		}
	}
}

// One component, summarized once: base style plus the captures whose values
// actually change. Captures that measure the same difference share one line.
function renderMergedComponent(
	lines: string[],
	name: string,
	entry: {
		component: ModelComponent;
		perView: Map<string, Map<string, string>>;
		variants: Map<string, MergedVariant>;
		multiVariant: boolean;
	},
	commonNotes: string[],
): void {
	const scopes = [...entry.perView];
	const labels = new Set<string>();
	for (const [, characteristics] of scopes)
		for (const label of characteristics.keys()) labels.add(label);
	// A characteristic is base only when every capture measured the same value.
	const baseValues = new Map<string, string>();
	for (const label of labels) {
		const values = scopes.map(([, characteristics]) =>
			characteristics.get(label),
		);
		if (
			values.every((value) => value !== undefined) &&
			new Set(values).size === 1
		)
			baseValues.set(label, values[0] ?? "");
	}
	lines.push(heading(3, escapeCell(name)), "");
	if (entry.component.purpose)
		lines.push(`**Purpose:** ${escapeCell(entry.component.purpose)}`, "");
	if (baseValues.size) {
		lines.push("**Base style**");
		for (const [label, value] of baseValues)
			lines.push(`- ${escapeCell(`${label}: ${value}`)}`);
		lines.push("");
	}
	// A capture that measured several treatments keeps each real variant; a
	// component measured once per capture is already described by its base style
	// and the measured differences below, so it adds no variant list.
	if (entry.multiVariant && entry.variants.size > 1) {
		const groups = [...entry.variants.values()];
		const byLabel = new Map<string, MergedVariant[]>();
		for (const group of groups)
			byLabel.set(group.label, [...(byLabel.get(group.label) ?? []), group]);
		lines.push("**Variants**");
		for (const group of groups) {
			const siblings = byLabel.get(group.label) ?? [];
			const differentiator =
				siblings.length > 1 ? differingCharacteristic(group, siblings) : null;
			const label = differentiator
				? `${group.label} (${differentiator})`
				: group.label;
			const samples = `${group.samples} measured sample${group.samples === 1 ? "" : "s"}`;
			const details = [...group.characteristics]
				.map(([key, value]) => `${key}: ${value}`)
				.join("; ");
			lines.push(
				`- **${escapeCell(label)}** (${samples})${details ? `: ${escapeCell(details)}` : ""}`,
			);
		}
		lines.push("");
	}
	// Captures with identical differences collapse into one line, so the same
	// override is never restated for every viewport.
	const grouped = new Map<
		string,
		{ differences: [string, string][]; labels: string[] }
	>();
	for (const [label, characteristics] of scopes) {
		const differences = [...characteristics].filter(
			([key, value]) => baseValues.get(key) !== value,
		);
		if (!differences.length) continue;
		const signature = JSON.stringify(differences);
		const group = grouped.get(signature) ?? { differences, labels: [] };
		group.labels.push(label);
		grouped.set(signature, group);
	}
	for (const { differences, labels: scopeLabels } of grouped.values()) {
		lines.push(`**${scopeLabels.map(escapeCell).join(", ")} - differences**`);
		for (const [key, value] of differences)
			lines.push(`- ${escapeCell(`${key}: ${value}`)}`);
		lines.push("");
	}
	const counts = `${entry.component.frequency} ${entry.component.roles.join(", ")} element${entry.component.frequency === 1 ? "" : "s"}`;
	lines.push(
		`**Evidence:** Measured on ${escapeCell(counts)}; ${entry.component.treatmentCount} distinct measured treatment${entry.component.treatmentCount === 1 ? "" : "s"} across ${scopes.length} capture${scopes.length === 1 ? "" : "s"}. Role inferred from DOM.`,
	);
	const ownGuidance = (entry.component.guidance ?? []).filter(
		(rule) => !commonNotes.includes(rule),
	);
	if (ownGuidance.length) {
		lines.push("", "**Notes**");
		for (const rule of ownGuidance) lines.push(`- ${escapeCell(rule)}`);
	}
	lines.push("");
}

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
	// The same measured caveat and the same handoff rule apply to every measured
	// component, so they are stated once for the section instead of repeated
	// under each one.
	const observedGuidance = observedComponents.map(
		(component) => component.guidance,
	);
	const commonGuidance = (observedGuidance[0] ?? []).filter((line) =>
		observedGuidance.every((list) => list.includes(line)),
	);
	const observedDescriptions = observedComponents.map(
		(component) => component.description,
	);
	const commonDescription =
		observedDescriptions.length > 1 &&
		observedDescriptions.every(
			(description) => description === observedDescriptions[0],
		)
			? observedDescriptions[0]
			: undefined;
	if (focus !== "visual-tokens" && mergedComponents.length) {
		lines.push("", heading(2, "Component Specifications"), "");
		if (commonDescription)
			for (const line of commonDescription.split("\n").filter(Boolean))
				lines.push(escapeCell(line), "");
		if (commonGuidance.length && observedComponents.length > 1) {
			lines.push("**Applies to every measured component:**");
			for (const rule of commonGuidance) lines.push(`- ${escapeCell(rule)}`);
			lines.push("");
		}
		for (const component of mergedComponents) {
			lines.push(heading(3, escapeCell(component.name)), "");
			if (component.purpose)
				lines.push(`**Purpose:** ${escapeCell(component.purpose)}`, "");

			// Base style (shared characteristics)
			if (component.shared.length) {
				lines.push("**Base style**");
				lines.push(...characteristicLines(component.shared), "");
			}

			// Variants / Treatments as differences
			if (component.treatments.length > 1) {
				for (const treatment of component.treatments) {
					lines.push(
						`**${escapeCell(treatment.label)}** (${treatment.samples} measured sample${treatment.samples === 1 ? "" : "s"}):`,
					);
					if (treatment.characteristics.length) {
						lines.push(...characteristicLines(treatment.characteristics));
					} else {
						lines.push("- Matches base style");
					}
					lines.push("");
				}
			}

			if (component.description !== commonDescription)
				for (const line of component.description.split("\n").filter(Boolean))
					lines.push(escapeCell(line), "");

			lines.push(`**Evidence:** ${escapeCell(component.evidence)}`);
			const ownGuidance = component.guidance.filter(
				(line) => !commonGuidance.includes(line),
			);
			if (ownGuidance.length) {
				lines.push("", "**Notes**");
				for (const rule of ownGuidance) lines.push(`- ${escapeCell(rule)}`);
			} else if (!commonGuidance.length) {
				lines.push(
					"",
					"**Notes**",
					"- Map this treatment only to matching components and the cited capture scope.",
				);
			}
			lines.push("");
		}
	}

	// --- Do's & Don'ts -------------------------------------------------------
	const { dos, donts } = model.guidelines;
	if (dos.length || donts.length) {
		lines.push("", heading(2, "Do's & Don'ts"));
		// Evidence stays attached to its rule but inline: the rule and its
		// measured basis read as one instruction instead of two blocks.
		const ruleLine = (rule: { rule: string; evidence: string }) =>
			`- ${escapeCell(rule.rule)} _(evidence: ${escapeCell(rule.evidence)})_`;
		if (dos.length) {
			lines.push("", heading(3, "DO"));
			for (const rule of dos) lines.push(ruleLine(rule));
		}
		if (donts.length) {
			lines.push("", heading(3, "DON'T"));
			for (const rule of donts) lines.push(ruleLine(rule));
		}
	}

	// --- Imagery, iconography and layout share the component section ---------
	// They are only rendered when the component family is in scope, and the
	// parent heading is emitted once when the components themselves were absent.
	const imagery = focus === "visual-tokens" ? [] : (options.imageryNotes ?? []);
	const layout =
		focus === "visual-tokens" ? [] : (options.layoutPrinciples ?? []);
	if (imagery.length || layout.length) {
		if (!mergedComponents.length)
			lines.push("", heading(2, "Component Specifications"));
		if (imagery.length) {
			lines.push("", heading(3, "Imagery & Iconography"));
			for (const note of imagery) lines.push("", escapeCell(note));
		}
		if (layout.length) {
			lines.push("", heading(3, "Layout"));
			for (const principle of layout) lines.push(`- ${escapeCell(principle)}`);
		}
	}
}
