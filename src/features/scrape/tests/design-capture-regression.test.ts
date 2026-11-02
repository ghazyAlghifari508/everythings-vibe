import { describe, expect, it } from "vitest";
import { FIXTURE } from "@/lib/design-fixture";
import { compareCaptures } from "../services/design-capture-comparison";
import {
	deriveObservedComponents,
	inferTheme,
} from "../services/design-model-observation";
import { visualEvidenceSchema } from "../types/design-evidence-contract";

const sample = {
	selector: "html:nth-child(1) > body:nth-child(1) > input:nth-child(1)",
	role: "input",
	text: "",
	width: 200,
	height: 40,
	properties: { "border-radius": "20px" },
};

describe("capture model evidence boundaries", () => {
	it("ignores non-canvas backgrounds when no canvas paint is available", () => {
		expect(
			inferTheme({
				...FIXTURE,
				elements: [
					{ ...sample, properties: { "background-color": "rgb(0, 0, 0)" } },
				],
			}),
		).toBe("unknown");
	});

	it("requires all treatment samples to prove pill geometry", () => {
		const components = deriveObservedComponents({
			...FIXTURE,
			elements: [sample, { ...sample, selector: "other", height: 100 }],
		});
		expect(
			components[0]?.sharedCharacteristics.find(
				(entry) => entry.label === "Corner radius",
			)?.value,
		).toBe("20px");
		const rounded = deriveObservedComponents({
			...FIXTURE,
			elements: [sample],
		});
		expect(
			rounded[0]?.sharedCharacteristics.find(
				(entry) => entry.label === "Corner radius",
			)?.value,
		).toBe("20px (pill)");
		const large = deriveObservedComponents({
			...FIXTURE,
			elements: [
				{
					...sample,
					width: 1000,
					height: 1000,
					properties: { "border-radius": "120px" },
				},
			],
		});
		expect(
			large[0]?.sharedCharacteristics.find(
				(entry) => entry.label === "Corner radius",
			)?.value,
		).toBe("120px");
	});

	it("compares textless inputs only when a unique stable id agrees", () => {
		const left = {
			...FIXTURE,
			colorScheme: "light" as const,
			elements: [{ ...sample, elementId: "email" }],
		};
		const right = {
			...left,
			viewport: { width: 390, height: 844 },
			elements: [
				{ ...left.elements[0], properties: { "border-radius": "8px" } },
			],
		};
		expect(visualEvidenceSchema.safeParse(left).success).toBe(true);
		expect(compareCaptures([left, right])).toHaveLength(1);
		expect(
			compareCaptures([
				left,
				{ ...right, elements: [{ ...right.elements[0], elementId: "other" }] },
			]),
		).toHaveLength(0);
		expect(
			compareCaptures([
				left,
				{ ...right, elements: [right.elements[0], right.elements[0]] },
			]),
		).toHaveLength(0);
		expect(
			compareCaptures([
				{ ...left, elements: [left.elements[0], left.elements[0]] },
				right,
			]),
		).toHaveLength(0);
		expect(
			compareCaptures([
				{ ...left, elements: [sample] },
				{
					...right,
					elements: [{ ...sample, properties: { "border-radius": "8px" } }],
				},
			]),
		).toHaveLength(0);
	});
});
