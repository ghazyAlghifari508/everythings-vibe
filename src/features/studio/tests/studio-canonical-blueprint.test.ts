import { describe, expect, it } from "vitest";
import { validateBlueprint } from "../services/studio-design-blueprint";

const legacy = {
	productIdentity: {
		productName: "Sample",
		targetAudience: "General",
		platform: "mobile",
		visualDirection: "Editorial",
	},
	designTokens: {
		primary: "#123456",
		secondary: "#555555",
		background: "#ffffff",
		surface: "#fafafa",
		fontFamily: "Arial",
		radius: 8,
		border: "1px solid #dddddd",
		elevation: "none",
	},
	sharedComponents: {
		header: "App bar",
		navigation: "Bottom tabs",
		buttons: "Solid",
		inputs: "Bordered",
		cards: "Flat",
		tabs: "Underline",
		icons: "Outline",
	},
	navigationContract: {
		destinations: ["overview", "entry"],
		labels: ["Overview", "Entry"],
		iconMapping: { overview: "home", entry: "plus" },
		ordering: ["entry", "overview"],
		activeItemRule: "Match screen",
	},
	screenPlan: [
		{ name: "Overview", role: "Summary", order: 0 },
		{ name: "Entry", role: "Form", order: 1 },
	],
};

function canonical(input: unknown) {
	const result = validateBlueprint(input);
	if (!result.ok) throw new Error(result.error);
	return result.blueprint;
}

describe("canonical blueprint normalization", () => {
	it("upgrades legacy decisions without mutating the stored record", () => {
		const before = JSON.stringify(legacy);
		const blueprint = canonical(legacy);
		expect(blueprint.canonicalShell).toEqual({
			version: 1,
			navigation: "bottom",
			statusBar: "none",
			density: "comfortable",
			activeDestinations: { Overview: "overview", Entry: "entry" },
		});
		expect(JSON.stringify(legacy)).toBe(before);
		expect(blueprint.navigationContract.ordering).toEqual([
			"entry",
			"overview",
		]);
		expect(canonical(blueprint)).toEqual(blueprint);
	});

	it("normalizes missing legacy icons to one known asset instead of arbitrary SVG", () => {
		const blueprint = canonical({
			...legacy,
			navigationContract: {
				...legacy.navigationContract,
				iconMapping: { overview: "untrusted-icon" },
			},
		});
		expect(blueprint.navigationContract.iconMapping).toEqual({
			overview: "circle",
			entry: "circle",
		});
	});

	it("accepts explicit per-screen destinations even when titles and labels differ", () => {
		const blueprint = canonical({
			...legacy,
			canonicalShell: {
				version: 1,
				navigation: "bottom",
				statusBar: "none",
				density: "compact",
				activeDestinations: { Overview: "entry", Entry: "overview" },
			},
		});
		expect(blueprint.canonicalShell?.activeDestinations).toEqual({
			Overview: "entry",
			Entry: "overview",
		});
	});

	it.each([
		{
			version: 2,
			navigation: "bottom",
			statusBar: "none",
			density: "compact",
			activeDestinations: {},
		},
		{
			version: 1,
			navigation: "sidebar",
			statusBar: "none",
			density: "compact",
			activeDestinations: {},
		},
		{
			version: 1,
			navigation: "bottom",
			statusBar: "simulated",
			density: "compact",
			activeDestinations: {},
		},
		{
			version: 1,
			navigation: "bottom",
			statusBar: "none",
			density: "compact",
			activeDestinations: { Overview: "absent" },
		},
	])("rejects invalid version, platform, policy or destination: %j", (canonicalShell) => {
		expect(validateBlueprint({ ...legacy, canonicalShell }).ok).toBe(false);
	});

	it("uses a desktop shell for legacy web records", () => {
		const blueprint = canonical({
			...legacy,
			productIdentity: { ...legacy.productIdentity, platform: "web" },
		});
		expect(blueprint.canonicalShell?.navigation).toBe("sidebar");
		expect(blueprint.canonicalShell?.statusBar).toBe("none");
	});

	it.each([
		{
			...legacy,
			designTokens: {
				...legacy.designTokens,
				primary: "red;}</style><script>",
			},
		},
		{
			...legacy,
			designTokens: {
				...legacy.designTokens,
				fontFamily: "Arial; background:url(https://invalid.test)",
			},
		},
		{
			...legacy,
			navigationContract: {
				...legacy.navigationContract,
				destinations: ["overview", "overview"],
				ordering: ["overview", "overview"],
			},
		},
	])("rejects unsafe style injection or ambiguous identity", (input) => {
		expect(validateBlueprint(input).ok).toBe(false);
	});
});
