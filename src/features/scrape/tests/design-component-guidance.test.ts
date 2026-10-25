import { expect, it } from "vitest";
import { buildDesignModel } from "@/features/scrape/services/design-model";
import { buildSynthesisPayload } from "@/features/scrape/services/design-synthesis";
import { inspectorFromModel } from "@/features/scrape/utils/design-md-inspector";
import { renderDesignMd } from "@/features/scrape/utils/design-md-render";
import { FIXTURE } from "@/lib/design-fixture";

it("preserves component-specific properties and source selectors without AI", () => {
	const model = buildDesignModel(FIXTURE);
	const buttons = model.observedComponents.find((component) =>
		component.roles.includes("cta"),
	);
	expect(buttons?.description).toContain("border-radius: 8px");
	expect(buttons?.description).toContain("padding: 14px");
	expect(buttons?.description).toContain("font-size: 15px");
	expect(buttons?.evidence).toContain("button:nth-child(5)");
	expect(renderDesignMd(model)).not.toMatch(/nth-child\(/);
	expect(buttons?.treatments?.[0]?.properties["border-radius"]).toBe("8px");
	expect(
		inspectorFromModel(model, "observed").components.find(
			(component) => component.name === buttons?.name,
		)?.description,
	).toBe(buttons?.description);
});

it("retains alternate measured typefaces and weights within the same type role", () => {
	const model = buildDesignModel({
		...FIXTURE,
		elements: [
			...FIXTURE.elements,
			{
				selector: "aside p",
				role: "body",
				text: "Sample",
				width: 200,
				height: 24,
				properties: {
					"font-family": "Example Serif, serif",
					"font-size": "16px",
					"font-weight": "500",
				},
			},
		],
	});
	expect(
		model.typefaces.find((font) => font.family === "Example Serif")
			?.measuredWeights,
	).toEqual(["500"]);
	expect(
		model.typefaces.find((font) => font.family === "Inter")?.measuredWeights,
	).toContain("600");
});

it("does not promote repeated unnamed action fills to primary or brand", () => {
	const model = buildDesignModel({
		...FIXTURE,
		elements: FIXTURE.elements.map((element) => ({
			...element,
			variables: {},
		})),
	});
	const action = model.colors.find((color) => color.value === "#155eef");
	expect(action?.roleClass).toBe("accent");
	expect(action?.role).toBe("Action accent");
});

it("keeps conflicting button treatments instead of asserting consistency", () => {
	const model = buildDesignModel({
		...FIXTURE,
		elements: FIXTURE.elements.map((element) =>
			element.selector.endsWith("button:nth-child(6)")
				? {
						...element,
						properties: { ...element.properties, "border-radius": "22px" },
					}
				: element,
		),
	});
	const buttons = model.observedComponents.find((component) =>
		component.roles.includes("cta"),
	);
	expect(buttons?.description).toContain("8px");
	expect(buttons?.description).toContain("22px");
	expect(buttons?.description).not.toMatch(/consistent measured styling/);
	expect(buttons?.evidence).toContain("button:nth-child(6)");
});

it("supplies observed components and confidence to synthesis instead of flat tokens alone", () => {
	const model = buildDesignModel(FIXTURE);
	const payload = JSON.parse(buildSynthesisPayload(model));
	expect(payload.observedComponents).toEqual(model.observedComponents);
	expect(payload.colors[0].confidence).toBe(model.colors[0]?.confidence);
	expect(payload.radii[0].roles).toEqual(model.radii[0]?.roles);
});
