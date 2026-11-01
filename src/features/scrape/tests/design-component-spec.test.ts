import { describe, expect, it } from "vitest";
import { buildDesignAgentPrompt } from "@/features/scrape/components/design-agent-prompt-dialog";
import { buildDesignModel } from "@/features/scrape/services/design-model";
import {
	deriveObservedComponents,
	TREATMENT_LIMIT,
} from "@/features/scrape/services/design-model-observation";
import type { VisualElementEvidence } from "@/features/scrape/services/design-visual-evidence";
import {
	inspectorFromEvidence,
	inspectorFromModel,
} from "@/features/scrape/utils/design-md-inspector";
import {
	renderDesignMd,
	validateDesignMd,
} from "@/features/scrape/utils/design-md-render";
import { FIXTURE } from "@/lib/design-fixture";

// The component specification is the public contract: measured values with a
// semantic label, one entry per measured variant, and no raw computed CSS.

function element(
	properties: Record<string, string>,
	overrides: Partial<VisualElementEvidence> = {},
): VisualElementEvidence {
	return {
		selector: "body:nth-child(1) > button:nth-child(2)",
		role: "cta",
		text: "Start",
		width: 160,
		height: 48,
		properties,
		...overrides,
	};
}

const NOISE = {
	"background-image": "none",
	"border-top-width": "0px",
	"border-top-style": "none",
	"border-top-color": "rgb(0, 0, 0)",
	"box-shadow": "none",
	"font-style": "normal",
	"letter-spacing": "normal",
	display: "block",
};

function captureOf(elements: VisualElementEvidence[]) {
	return {
		...FIXTURE,
		elements,
		limitations: [],
	};
}

const BUTTON = {
	"background-color": "rgb(21, 94, 239)",
	color: "rgb(255, 255, 255)",
	"font-family": "Inter, sans-serif",
	"font-size": "15px",
	"font-weight": "600",
	"line-height": "20px",
	padding: "14px",
	"border-radius": "8px",
};

const componentText = (document: string) =>
	document.split("## Components")[1]?.split("\n## ")[0] ?? "";

describe("component treatment normalization", () => {
	it("collapses duplicate measurements into one variant", () => {
		const elements = Array.from({ length: 6 }, (_, index) =>
			element(
				{ ...NOISE, ...BUTTON },
				{ selector: `body:nth-child(1) > button:nth-child(${index + 2})` },
			),
		);
		const [component] = deriveObservedComponents(captureOf(elements));
		expect(component?.treatmentCount).toBe(1);
		expect(component?.treatments).toHaveLength(1);
		expect(component?.treatments?.[0]?.samples).toBe(6);
		expect(component?.frequency).toBe(6);
	});

	it("drops no-op CSS defaults instead of dumping them", () => {
		const model = buildDesignModel(
			captureOf([element({ ...NOISE, ...BUTTON })]),
		);
		const [component] = model.observedComponents;
		const properties = component?.treatments?.[0]?.properties ?? {};
		expect(properties).not.toHaveProperty("background-image");
		expect(properties).not.toHaveProperty("box-shadow");
		expect(properties).not.toHaveProperty("border-top-width");
		expect(properties).not.toHaveProperty("border-top-style");
		expect(properties).not.toHaveProperty("border-top-color");
		expect(properties.display).toBeUndefined();
		expect(properties["letter-spacing"]).toBeUndefined();
		const text = renderDesignMd(model);
		const section = componentText(text);
		expect(section).not.toContain("border-top");
		expect(section).not.toContain("background-image");
		expect(section).not.toContain("box-shadow: none");
		expect(section).not.toContain("letter-spacing");
		expect(text).toContain("Corner radius: 8px");
		expect(text).toContain("Padding: 14px");
	});

	it("keeps visually important variants and hoists shared values", () => {
		const model = buildDesignModel(
			captureOf([
				element({ ...BUTTON }),
				element({ ...BUTTON, "background-color": "rgb(16, 24, 40)" }),
			]),
		);
		const [component] = model.observedComponents;
		expect(component?.treatmentCount).toBe(2);
		expect(
			component?.sharedCharacteristics.map((entry) => entry.label),
		).toEqual(
			expect.arrayContaining(["Typography", "Padding", "Corner radius"]),
		);
		const variantBackgrounds = (component?.treatments ?? []).flatMap(
			(treatment) =>
				treatment.characteristics
					.filter((entry) => entry.label === "Background")
					.map((entry) => entry.value),
		);
		expect(variantBackgrounds).toEqual(["rgb(21, 94, 239)", "rgb(16, 24, 40)"]);
		const section = componentText(renderDesignMd(model));
		expect(section.match(/Typography: /g)).toHaveLength(1);
		expect(section).toContain("Variant 1");
		expect(section).toContain("Variant 2");
	});

	it("omits a component when the evidence holds no meaningful property", () => {
		const model = buildDesignModel(captureOf([element({ ...NOISE })]));
		expect(model.observedComponents).toEqual([]);
		expect(renderDesignMd(model)).not.toContain("## Components");
	});

	it("bounds how many variants and properties reach the document", () => {
		const elements = Array.from({ length: 40 }, (_, index) =>
			element(
				{ ...BUTTON, padding: `${index + 1}px` },
				{ selector: `body:nth-child(1) > button:nth-child(${index + 2})` },
			),
		);
		const model = buildDesignModel(captureOf(elements));
		const [component] = model.observedComponents;
		expect(component?.treatmentCount).toBe(40);
		expect(component?.treatments).toHaveLength(TREATMENT_LIMIT);
		expect(model.limitations.join(" ")).toMatch(
			/remaining treatments are omitted/,
		);
		const document = renderDesignMd(model);
		expect(document.length).toBeLessThan(20_000);
		expect(document).not.toMatch(/nth-child\(/);
		expect(validateDesignMd(document)).toEqual([]);
	});

	it("produces a deterministic specification", () => {
		const evidence = captureOf([
			element({ ...BUTTON }),
			element({ ...BUTTON, padding: "20px" }),
		]);
		const first = JSON.stringify(buildDesignModel(evidence).observedComponents);
		const second = JSON.stringify(
			buildDesignModel(evidence).observedComponents,
		);
		expect(first).toBe(second);
	});
});

describe("multi-capture component scoping", () => {
	const desktop = () => ({
		...FIXTURE,
		colorScheme: "light" as "light" | "dark",
		elements: FIXTURE.elements.map((entry) =>
			entry.role === "cta"
				? {
						...entry,
						properties: { ...entry.properties, "border-radius": "8px" },
					}
				: entry,
		),
	});
	const mobile = () => {
		const view = structuredClone(desktop());
		view.viewport = { width: 390, height: 844 };
		for (const entry of view.elements)
			if (entry.role === "cta") entry.properties["border-radius"] = "16px";
		return view;
	};
	const dark = () => {
		const view = structuredClone(desktop());
		view.colorScheme = "dark" as const;
		for (const entry of view.elements) {
			entry.properties["background-color"] = "rgb(0, 0, 0)";
			entry.properties.color = "rgb(255, 255, 255)";
		}
		return view;
	};

	const buttonRadii = (model: ReturnType<typeof buildDesignModel>) =>
		(model.views ?? []).map(
			(view) =>
				view.model.observedComponents.find((component) =>
					component.roles.includes("cta"),
				)?.treatments?.[0]?.properties["border-radius"] ?? "",
		);

	it("keeps a radius measured per viewport scoped to its capture", () => {
		const model = buildDesignModel({
			...desktop(),
			additionalViews: [mobile()],
		});
		expect(buttonRadii(model)).toEqual(["8px", "16px"]);
		const document = renderDesignMd(model);
		expect(document).toMatch(/Capture 1: 1440x900/);
		expect(document).toMatch(/Capture 2: 390x844/);
		expect(document).not.toMatch(/nth-child\(|\[capture \d/);
		const inspector = inspectorFromEvidence(
			{ ...desktop(), additionalViews: [mobile()] },
			document,
		);
		const radiusFor = (label: string) =>
			inspector?.components
				.filter((component) => component.name.includes(label))
				.flatMap((component) => [
					...component.sharedCharacteristics,
					...component.variants.flatMap((variant) => variant.characteristics),
				])
				.filter((entry) => entry.label === "Corner radius")
				.map((entry) => entry.value);
		expect(radiusFor("1440x900")).toContain("8px");
		expect(radiusFor("390x844")).toContain("16px");
		expect(radiusFor("1440x900")).not.toContain("16px");
	});

	it("scopes theme captures without inventing a dark override", () => {
		const model = buildDesignModel({ ...desktop(), additionalViews: [dark()] });
		expect(buttonRadii(model)).toEqual(["8px", "8px"]);
		const document = renderDesignMd(model);
		expect(document).toMatch(/Capture 2: 1440x900, browser preference dark/);
		expect(document).not.toMatch(/nth-child\(/);
	});

	it("handles desktop/mobile and light/dark together without mixing values", () => {
		const model = buildDesignModel({
			...desktop(),
			additionalViews: [mobile(), dark()],
		});
		expect(buttonRadii(model)).toEqual(["8px", "16px", "8px"]);
		const inspector = inspectorFromModel(model, "observed");
		const radiiValues = inspector.components.flatMap((component) =>
			[
				...component.sharedCharacteristics,
				...component.variants.flatMap((variant) => variant.characteristics),
			]
				.filter((entry) => entry.label === "Corner radius")
				.map((entry) => entry.value),
		);
		expect(radiiValues.join(" ")).toContain("8px");
		expect(radiiValues.join(" ")).toContain("16px");
		const document = renderDesignMd(model);
		expect(validateDesignMd(document)).toEqual([]);
		expect(document).not.toMatch(/nth-child\(|\[capture \d/);
	});
});

describe("public guidance consistency", () => {
	const model = buildDesignModel(FIXTURE);

	it("renders the same specification in the document and the inspector", () => {
		const document = renderDesignMd(model);
		const inspector = inspectorFromModel(model, "observed");
		for (const component of inspector.components) {
			expect(document).toContain(component.name);
			expect(document).toContain(component.purpose);
			for (const entry of component.sharedCharacteristics) {
				expect(document).toContain(`${entry.label}: ${entry.value}`);
				expect(document).toContain(entry.value);
			}
		}
		expect(JSON.stringify(inspector.components)).not.toMatch(/nth-child\(/);
		expect(document).not.toMatch(/nth-child\(/);
	});

	it("keeps implementation guidance honest and non-copying in the handoff", () => {
		const document = renderDesignMd(model);
		const prompt = buildDesignAgentPrompt({
			siteName: "Acme",
			sourceUrl: FIXTURE.sourceUrl,
			designMd: document,
		});
		expect(prompt).toContain(document);
		expect(prompt).toContain("Jangan menyalin logo");
		expect(prompt).toContain("Corner radius: 8px");
		expect(prompt).not.toMatch(/nth-child\(/);
		expect(document).toContain(
			"Do not copy the reference site's text, links, images, or brand assets as product content.",
		);
	});
});
