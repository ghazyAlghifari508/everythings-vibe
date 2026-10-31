import { describe, expect, it } from "vitest";
import { validateSynthesisClaims } from "@/features/scrape/services/design-synthesis-claims";
import { buildFixtureModel } from "@/lib/design-fixture";

const model = buildFixtureModel();

describe("component claim evidence", () => {
	it("rejects a radius supported only as spacing for that component", () => {
		expect(
			validateSynthesisClaims(["Buttons use a 14px radius."], model),
		).not.toEqual([]);
	});

	it("rejects spacing supported only as radius for that component", () => {
		expect(
			validateSynthesisClaims(["Buttons use 8px padding."], model),
		).not.toEqual([]);
	});

	it("rejects a universal radius contradicted by another observed treatment", () => {
		const radius = model.radii.find((token) => token.roles.includes("cta"));
		if (!radius) throw new Error("Fixture lacks button radius");
		const varied = {
			...model,
			radii: [...model.radii, { ...radius, value: "12px", valuePx: 12 }],
		};
		expect(
			validateSynthesisClaims(["All buttons use 8px radius."], varied),
		).not.toEqual([]);
		expect(
			validateSynthesisClaims(["Some buttons use 8px radius."], varied),
		).toEqual([]);
	});

	it("does not interpret a button font size as radius or spacing", () => {
		expect(
			validateSynthesisClaims(["Buttons use 15px font size."], model),
		).toEqual([]);
	});

	it("does not treat a negated component rule as an affirmative measurement", () => {
		expect(
			validateSynthesisClaims(["Don't give buttons a 14px radius."], model),
		).toEqual([]);
	});
});
