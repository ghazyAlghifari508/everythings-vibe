import { describe, expect, it } from "vitest";
import { extendStudioBlueprintWithScreen } from "../services/studio-blueprint-navigation";
import { validateBlueprint } from "../services/studio-design-blueprint";
import { parseStudioPlanningWithBlueprint } from "../services/studio-planning-parser";
import { financeBlueprint } from "./fixtures/studio-evaluation-fixtures";

const composition = {
	primaryTask: "Choose an option and review its price",
	layout: "form",
	hierarchy: ["Options", "Quantity", "Total and action"],
	patterns: ["options", "stepper", "actions"],
	responsive: "stack",
	media: "whole-product",
};
const blueprint = () => ({
	...financeBlueprint,
	productIdentity: {
		...financeBlueprint.productIdentity,
		brandTone: "Calm and precise",
		layoutIntent: "mobile-application",
	},
	sharedComponents: {
		...financeBlueprint.sharedComponents,
		media: "Whole products use contain; photography may crop intentionally",
	},
	layout: {
		gutter: 18,
		contentMaxWidth: 390,
		spacing: [4, 8, 16, 24],
		typography: [14, 16, 24, 32],
	},
	screenPlan: financeBlueprint.screenPlan.map((screen) => ({
		...screen,
		navigationRole: "primary",
		composition,
	})),
});
const planning = () => {
	const value = blueprint();
	return {
		projectTitle: value.productIdentity.productName,
		screens: value.screenPlan.map((screen) => ({
			...screen,
			viewport: "mobile",
		})),
		blueprint: value,
	};
};

describe("P6 domain-aware planning contracts", () => {
	it("retains task hierarchy and responsive/media intent instead of dropping them during validation", () => {
		const result = validateBlueprint(blueprint());
		expect(result).toMatchObject({
			ok: true,
			blueprint: {
				productIdentity: { brandTone: "Calm and precise" },
				sharedComponents: { media: blueprint().sharedComponents.media },
				screenPlan: blueprint().screenPlan,
			},
		});
	});

	it.each([
		{ ...composition, layout: "unrelated-dashboard" },
		{ ...composition, hierarchy: [] },
		{ ...composition, patterns: ["unknown-runtime"] },
		{ ...composition, responsive: "shrink-to-phone" },
		{ ...composition, media: "crop-everything" },
	])("rejects malformed composition rather than silently discarding it: %j", (invalid) => {
		const value = blueprint();
		expect(
			validateBlueprint({
				...value,
				screenPlan: [{ ...value.screenPlan[0], composition: invalid }],
			}).ok,
		).toBe(false);
	});

	it.each([
		"name",
		"order",
	] as const)("rejects same-count screen plans whose %s no longer matches the shared blueprint", (key) => {
		const value = planning();
		if (key === "name") value.blueprint.screenPlan[0].name = "Different screen";
		else value.blueprint.screenPlan[0].order = 40;
		expect(
			parseStudioPlanningWithBlueprint(
				JSON.stringify(value),
				"mobile",
				value.screens.length,
			).ok,
		).toBe(false);
	});

	it("requires structured quality for new plans without rejecting persisted legacy blueprints", () => {
		const value = planning();
		expect(
			parseStudioPlanningWithBlueprint(
				JSON.stringify(value),
				"mobile",
				value.screens.length,
				false,
				true,
			).ok,
		).toBe(true);
		const legacy = { ...value, blueprint: financeBlueprint };
		expect(validateBlueprint(legacy.blueprint).ok).toBe(true);
		expect(
			parseStudioPlanningWithBlueprint(
				JSON.stringify(legacy),
				"mobile",
				value.screens.length,
				false,
				true,
			).ok,
		).toBe(false);
	});

	it.each([
		"brandTone",
		"layoutIntent",
		"layout",
		"media",
		"composition",
		"navigationRole",
	])("rejects new planning that omits %s before legacy normalization", (missing) => {
		const value = planning();
		const shared = value.blueprint;
		const invalid = {
			...value,
			blueprint: {
				...shared,
				layout: missing === "layout" ? undefined : shared.layout,
				productIdentity: { ...shared.productIdentity, [missing]: undefined },
				sharedComponents: {
					...shared.sharedComponents,
					media:
						missing === "media" ? undefined : shared.sharedComponents.media,
				},
				screenPlan: shared.screenPlan.map((screen) => ({
					...screen,
					[missing]: undefined,
				})),
			},
		};
		expect(
			parseStudioPlanningWithBlueprint(
				JSON.stringify(invalid),
				"mobile",
				value.screens.length,
				false,
				true,
			).ok,
		).toBe(false);
	});

	it("keeps distinct screen compositions and shared identity when extending contextual navigation", () => {
		const value = blueprint();
		const result = validateBlueprint(value);
		if (!result.ok) throw new Error(result.error);
		const extended = extendStudioBlueprintWithScreen({
			blueprint: result.blueprint,
			screenName: "Review",
			screenRole: {
				role: "contextual",
				reason: "Review follows selection",
				parentDestinationId: value.navigationContract.destinations[0],
			},
			screenDescription: "Review the selected options",
		});
		expect(extended.productIdentity).toEqual(result.blueprint.productIdentity);
		expect(extended.designTokens).toEqual(result.blueprint.designTokens);
		expect(extended.sharedComponents).toEqual(
			result.blueprint.sharedComponents,
		);
		expect(extended.screenPlan.slice(0, -1)).toEqual(
			result.blueprint.screenPlan,
		);
		expect(result.blueprint.screenPlan[0]).toHaveProperty(
			"composition",
			composition,
		);
		expect(extended.screenPlan.at(-1)).toMatchObject({
			name: "Review",
			navigationRole: "contextual",
		});
	});
});
