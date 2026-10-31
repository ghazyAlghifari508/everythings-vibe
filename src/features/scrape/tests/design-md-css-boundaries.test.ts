import { describe, expect, it } from "vitest";
import { buildFixtureModel } from "@/lib/design-fixture";
import { isValidCssRadius } from "../utils/design-md-css";
import { renderCodeSections } from "../utils/design-md-render-code";

describe("CSS radius validation", () => {
	it.each([
		"0",
		"0 8px",
		"1px 2px 3px 4px / 5px 6px 7px 8px",
		"2cqw",
	])("accepts %s", (value) => expect(isValidCssRadius(value)).toBe(true));
	it.each([
		"-1px",
		"1px -2px",
		"1px / -2px",
		"1px /",
		"1px / 1px 2px 3px 4px 5px",
	])("rejects %s", (value) => expect(isValidCssRadius(value)).toBe(false));
});

describe("Tailwind output availability", () => {
	it("emits a theme for each available token group and omits an empty theme", () => {
		const fixture = buildFixtureModel();
		const render = (model: typeof fixture) => {
			const lines: string[] = [];
			renderCodeSections(lines, model, {});
			return lines.join("\n");
		};
		const base = {
			...fixture,
			colors: [],
			typography: [],
			typefaces: [],
			spacing: [],
			radii: [],
		};
		expect(render(base)).not.toContain("@theme {");
		expect(render({ ...base, colors: fixture.colors })).toContain("@theme {");
		expect(render({ ...base, typography: fixture.typography })).toContain(
			"@theme {",
		);
		const cases = [
			{ model: { ...base, typefaces: fixture.typefaces }, prefix: "--font-" },
			{
				model: {
					...base,
					spacing: fixture.spacing.filter(
						(token) => token.purpose !== "Container max-width",
					),
				},
				prefix: "--spacing-",
			},
			{
				model: {
					...base,
					spacing: fixture.spacing.filter(
						(token) => token.purpose === "Container max-width",
					),
				},
				prefix: "--container-",
			},
			{ model: { ...base, radii: fixture.radii }, prefix: "--radius-" },
		];
		expect(
			cases.map(
				({ model, prefix }) =>
					render(model).split("@theme {")[1]?.includes(prefix) ?? false,
			),
		).toEqual([true, true, true, true]);
		expect(
			render({
				...base,
				colors: fixture.colors.map((color) => ({ ...color, value: "invalid" })),
			}),
		).not.toContain("@theme {");
	});
});
