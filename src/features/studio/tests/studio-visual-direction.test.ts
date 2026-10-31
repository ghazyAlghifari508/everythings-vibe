import { describe, expect, it } from "vitest";
import { extendStudioBlueprintWithScreen } from "../services/studio-blueprint-navigation";
import {
	assembleCanonicalShell,
	validateCanonicalShell,
} from "../services/studio-canonical-shell";
import {
	studioColorContrast,
	studioDesignBlueprintSchema,
} from "../services/studio-design-blueprint";
import { extractDesignSystemTokens } from "../services/studio-design-tokens";
import { parseStudioPlanningWithBlueprint } from "../services/studio-planning-parser";
import { getStudioPresetDesignMd } from "../services/studio-presets";

const tokens = studioDesignBlueprintSchema.shape.designTokens;
const valid = {
	primary: "#2455aa",
	secondary: "#8033aa",
	background: "#fff",
	surface: "#fff",
	ink: "#111",
	muted: "#555",
	onPrimary: "#fff",
	fontFamily: "Arial",
	radius: 8,
	border: "1px solid #ddd",
	elevation: "none",
};

function planningOutput(brief: string, primary: string) {
	const screens = [
		{ name: "Overview", description: brief, viewport: "web", order: 0 },
	];
	return JSON.stringify({
		projectTitle: brief,
		screens,
		blueprint: {
			productIdentity: {
				productName: brief,
				targetAudience: "Specialists",
				platform: "web",
				visualDirection: `Focused reading for ${brief}`,
			},
			designTokens: { ...valid, primary },
			sharedComponents: {
				header: "Title",
				navigation: "Sidebar",
				buttons: "Solid",
				inputs: "Bordered",
				cards: "Flat",
				tabs: "Underline",
				icons: "Outline",
			},
			navigationContract: {
				destinations: ["overview"],
				labels: ["Overview"],
				ordering: ["overview"],
				iconMapping: { overview: "home" },
				activeItemRule: "Match screen",
			},
			screenPlan: [{ name: "Overview", role: brief, order: 0 }],
		},
	});
}

describe("mocked project identity remains project-scoped", () => {
	it.each([
		["Finance reporting for auditors", "#243b80"],
		["Portfolio for an illustrator", "#69258a"],
		["Travel reservations for field researchers", "#075985"],
		["Healthcare scheduling for clinicians", "#166534"],
		["Finance receipts for market vendors", "#9a3412"],
		["Explicit green brand requirement", "#166534"],
	])("preserves the mocked planning decision for %s", (brief, primary) => {
		const parsed = parseStudioPlanningWithBlueprint(
			planningOutput(brief, primary),
			"web",
			1,
		);
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) throw new Error(parsed.error);
		expect(parsed.blueprint.designTokens).toEqual({ ...valid, primary });
		const before = structuredClone(parsed.blueprint);
		const extended = extendStudioBlueprintWithScreen({
			blueprint: parsed.blueprint,
			screenName: "Details",
			screenRole: {
				role: "contextual",
				reason: "Details",
				parentDestinationId: "overview",
			},
		});
		expect(extended.designTokens).toEqual(before.designTokens);
		expect(parsed.blueprint).toEqual(before);
		for (const screen of extended.screenPlan) {
			const html = assembleCanonicalShell(
				"<html><head></head><body><main data-studio-content>Content</main></body></html>",
				extended,
				screen.name,
				null,
			);
			expect(validateCanonicalShell(html, extended, screen.name, null)).toEqual(
				[],
			);
		}
	});
	it.each([
		"midnight",
		"custom",
		"scrape",
	])("keeps %s reference authoritative over mocked automatic tokens", (reference) => {
		const md =
			reference === "midnight"
				? getStudioPresetDesignMd("midnight")
				: "## Colors\n| Name | Hex | Role |\n| Primary | #9a3412 | Brand accent |\n| Canvas | #ffffff | Page background |\n| Ink | #111111 | Primary text |";
		const parsed = parseStudioPlanningWithBlueprint(
			planningOutput("Sample", valid.primary),
			"web",
			1,
		);
		if (!parsed.ok) throw new Error(parsed.error);
		const referenceTokens = extractDesignSystemTokens(md);
		const html = assembleCanonicalShell(
			"<html><head></head><body><main>Content</main></body></html>",
			parsed.blueprint,
			"Overview",
			referenceTokens,
		);
		expect(
			validateCanonicalShell(
				html,
				parsed.blueprint,
				"Overview",
				referenceTokens,
			),
		).toEqual([]);
		expect(referenceTokens?.colors.primary).not.toBe(
			parsed.blueprint.designTokens.primary,
		);
	});
});

describe("visual direction token boundaries", () => {
	it("requires complete new automatic direction but reads legacy persisted blueprints", () => {
		const raw = planningOutput("Sample", valid.primary);
		const legacy = raw.replace(
			/,"ink":"#111"|,"muted":"#555"|,"onPrimary":"#fff"/g,
			"",
		);
		expect(parseStudioPlanningWithBlueprint(legacy, "web", 1).ok).toBe(true);
		expect(parseStudioPlanningWithBlueprint(legacy, "web", 1, true).ok).toBe(
			false,
		);
		expect(parseStudioPlanningWithBlueprint(raw, "web", 1, true).ok).toBe(true);
	});
	it("computes WCAG reference ratios symmetrically", () => {
		expect(studioColorContrast("#000", "#fff")).toBe(21);
		expect(studioColorContrast("#fff", "#000")).toBe(21);
		expect(studioColorContrast("#123", "#123")).toBe(1);
	});
	it("retains distinct ink, muted and action foreground tokens", () => {
		expect(tokens.parse(valid)).toEqual(valid);
	});
	it("rejects unreadable text rather than replacing the palette", () => {
		expect(tokens.safeParse({ ...valid, ink: "#eee" }).success).toBe(false);
	});
	it("rejects unreadable action labels", () => {
		expect(
			tokens.safeParse({ ...valid, onPrimary: valid.primary }).success,
		).toBe(false);
	});
	it.each([
		"#12",
		"#12345",
		"#ffffff00",
		"url(x)",
	])("rejects unsafe or translucent paint %s", (primary) => {
		expect(tokens.safeParse({ ...valid, primary }).success).toBe(false);
	});
	it.each([
		"#123",
		"#123456",
		"#123456ff",
	])("accepts opaque hex %s", (primary) => {
		expect(
			tokens.safeParse({ ...valid, primary, onPrimary: undefined }).success,
		).toBe(true);
	});
});
