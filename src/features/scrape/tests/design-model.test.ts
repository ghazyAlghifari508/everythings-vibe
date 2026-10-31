import { describe, expect, it } from "vitest";
import {
	buildDesignModel,
	deriveModelGuidelines,
	inferTheme,
} from "@/features/scrape/services/design-model";
import type { VisualElementEvidence } from "@/features/scrape/services/design-visual-evidence";
import { buildFixtureModel, FIXTURE } from "@/lib/design-fixture";

function element(
	properties: Record<string, string>,
	overrides: Partial<VisualElementEvidence> = {},
): VisualElementEvidence {
	return {
		selector: "body:nth-child(1) > div:nth-child(1)",
		role: "element",
		text: "Sample",
		width: 100,
		height: 40,
		properties,
		...overrides,
	};
}

describe("inferTheme", () => {
	it("does not classify a translucent paint without its composited background", () => {
		expect(
			inferTheme({
				...FIXTURE,
				elements: [
					element(
						{ "background-color": "rgba(0, 0, 0, 0.1)" },
						{ role: "canvas" },
					),
				],
			}),
		).toBe("unknown");
	});
	it("does not infer a canvas theme from a non-canvas background", () => {
		const theme = inferTheme({
			...FIXTURE,
			elements: [
				element({ "background-color": "rgba(0, 0, 0, 0)" }, { role: "canvas" }),
				element({ "background-color": "rgb(255, 255, 255)" }, { role: "body" }),
			],
		});
		expect(theme).toBe("unknown");
	});

	it("still reports unknown when every measured background is transparent", () => {
		const theme = inferTheme({
			...FIXTURE,
			elements: [
				element({ "background-color": "rgba(0, 0, 0, 0)" }, { role: "canvas" }),
				element({ "background-color": "transparent" }, { role: "body" }),
			],
		});
		expect(theme).toBe("unknown");
	});
});

describe("surface honesty", () => {
	it("states a limitation when only a single surface was measured", () => {
		const model = buildDesignModel({
			...FIXTURE,
			elements: [
				element(
					{ "background-color": "rgb(255, 255, 255)" },
					{ role: "canvas" },
				),
				element(
					{ "background-color": "rgb(255, 255, 255)" },
					{ role: "section" },
				),
			],
		});
		expect(model.surfaces).toHaveLength(1);
		expect(model.limitations.some((note) => /single surface/i.test(note))).toBe(
			true,
		);
	});

	it("states a limitation when the only surfaces are translucent", () => {
		const model = buildDesignModel({
			...FIXTURE,
			elements: [
				element(
					{ "background-color": "rgba(21, 94, 239, 0.5)" },
					{ role: "canvas" },
				),
				element(
					{ "background-color": "rgba(21, 94, 239, 0.5)" },
					{ role: "section" },
				),
			],
		});
		expect(
			model.limitations.some((note) => /translucent|alpha|opacity/i.test(note)),
		).toBe(true);
	});
});

describe("unsupported colour evidence", () => {
	it("records modern colour spaces as a limitation instead of dropping them", () => {
		const model = buildDesignModel({
			...FIXTURE,
			elements: [
				element(
					{ "background-color": "oklch(0.7 0.1 250)" },
					{ role: "section" },
				),
				element(
					{ "background-color": "oklch(0.7 0.1 250)" },
					{ role: "section" },
				),
			],
		});
		expect(
			model.limitations.some((note) => /oklch|modern|colour space/i.test(note)),
		).toBe(true);
	});
});

describe("guideline budget", () => {
	it("keeps the fixture model within twenty useful rules", () => {
		const model = buildFixtureModel();
		const total = model.guidelines.dos.length + model.guidelines.donts.length;
		expect(total).toBeLessThanOrEqual(20);
		for (const rule of [...model.guidelines.dos, ...model.guidelines.donts])
			expect(rule.evidence.trim().length).toBeGreaterThan(0);
	});

	it("caps derived guidelines at twenty rules", () => {
		const guidelines = deriveModelGuidelines(FIXTURE, [], [], [], []);
		expect(guidelines.dos.length + guidelines.donts.length).toBeLessThanOrEqual(
			20,
		);
	});
});
