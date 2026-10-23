import { describe, expect, it } from "vitest";
import type { VisualElementEvidence } from "@/features/scrape/services/design-visual-evidence";
import {
	classifyColors,
	collectColorMeasurements,
	collectUnsupportedColors,
	normalizeColor,
	normalizeColors,
} from "@/features/scrape/utils/design-normalize-color";

function element(
	overrides: Partial<VisualElementEvidence> = {},
): VisualElementEvidence {
	return {
		selector: "body:nth-child(1) > div:nth-child(1)",
		role: "element",
		text: "Sample",
		width: 100,
		height: 40,
		properties: {},
		...overrides,
	};
}

describe("color normalization", () => {
	it("collapses equivalent representations into one canonical value", () => {
		const equivalent = [
			"#ffffff",
			"#FFF",
			"rgb(255, 255, 255)",
			"rgb(255 255 255)",
			"rgba(255, 255, 255, 1)",
			"rgba(255 255 255 / 100%)",
			"white",
		];
		const canonical = equivalent.map((value) => normalizeColor(value)?.hex);
		expect(new Set(canonical).size).toBe(1);
		expect(canonical[0]).toBe("#ffffff");
	});

	it("emits canonical CSS that a stylesheet can paste directly", () => {
		expect(normalizeColor("rgb(21, 94, 239)")?.css).toBe("#155eef");
		expect(normalizeColor("rgba(21, 94, 239, 0.5)")?.css).toBe(
			"rgba(21, 94, 239, 0.5)",
		);
	});

	it("separates alpha from opaque colours", () => {
		const opaque = normalizeColor("#155eef");
		const translucent = normalizeColor("rgba(21, 94, 239, 0.4)");
		expect(opaque?.hasAlpha).toBe(false);
		expect(translucent?.hasAlpha).toBe(true);
		expect(opaque?.hex).toBe(translucent?.hex);
	});

	it("marks fully transparent paint as a no-op", () => {
		expect(normalizeColor("transparent")?.isNoOp).toBe(true);
		expect(normalizeColor("rgba(0, 0, 0, 0)")?.isNoOp).toBe(true);
		expect(normalizeColor("rgba(21, 94, 239, 0.001)")?.isNoOp).toBe(false);
	});

	it("reports unparsable colour spaces instead of guessing a value", () => {
		expect(normalizeColor("oklch(0.7 0.1 250)")).toBeNull();
		expect(normalizeColor("color(display-p3 1 0 0)")).toBeNull();
		expect(normalizeColor("")).toBeNull();
	});

	it("never turns a transparent or zero-width border into a palette entry", () => {
		const measurements = collectColorMeasurements([
			element({
				properties: {
					"background-color": "rgba(0, 0, 0, 0)",
					color: "transparent",
					"border-top-color": "rgb(0, 0, 0)",
					"border-top-width": "0px",
					"border-top-style": "none",
				},
			}),
		]);
		expect(measurements).toEqual([]);
	});

	it("counts a real border as a colour measurement", () => {
		const measurements = collectColorMeasurements([
			element({
				properties: {
					"border-top-color": "rgb(208, 213, 221)",
					"border-top-width": "1px",
					"border-top-style": "solid",
				},
			}),
		]);
		expect(measurements).toHaveLength(1);
	});

	it("merges equivalent values measured on different elements into one token", () => {
		const tokens = normalizeColors([
			element({
				role: "cta",
				properties: { "background-color": "#155eef" },
			}),
			element({
				role: "cta",
				properties: { "background-color": "rgb(21, 94, 239)" },
			}),
		]);
		expect(tokens).toHaveLength(1);
		expect(tokens[0]?.usage.frequency).toBe(2);
	});

	it("keeps an alpha variant distinct from its opaque base", () => {
		const tokens = normalizeColors([
			element({ properties: { "background-color": "#155eef" } }),
			element({ properties: { "background-color": "rgba(21, 94, 239, 0.5)" } }),
		]);
		expect(tokens).toHaveLength(2);
	});
});

describe("color role classification", () => {
	it("keeps repeated unnamed action fills below a brand or primary claim", () => {
		const [entry] = classifyColors([
			element({ role: "cta", properties: { "background-color": "#155eef" } }),
			element({ role: "cta", properties: { "background-color": "#155eef" } }),
		]);
		expect(entry?.roleClass).toBe("accent");
		expect(entry?.roleLabel).toBe("Action accent");
		expect(entry?.rationale).toMatch(/action/i);
	});

	it("does not promote a colour seen only once on an action element", () => {
		const [entry] = classifyColors([
			element({ role: "cta", properties: { "background-color": "#155eef" } }),
		]);
		expect(entry?.roleClass).toBe("accent");
	});

	it("classifies from a semantic custom property the page actually used", () => {
		const [entry] = classifyColors([
			element({
				properties: { "background-color": "#067647" },
				variables: { "--color-success": "#067647" },
			}),
		]);
		expect(entry?.roleClass).toBe("semantic");
	});

	it("never claims the user-agent default text colour as a brand colour", () => {
		const [entry] = classifyColors([
			element({ role: "body", properties: { color: "rgb(0, 0, 0)" } }),
			element({ role: "element", properties: { color: "#000000" } }),
		]);
		expect(entry?.roleClass).toBe("neutral");
		expect(entry?.userAgentDefault).toBe(true);
		expect(entry?.rationale).toMatch(/user-agent/i);
	});

	it("treats a repeated plain surface as neutral rather than brand", () => {
		const [entry] = classifyColors([
			element({
				role: "section",
				properties: { "background-color": "#ffffff" },
			}),
			element({
				role: "section",
				properties: { "background-color": "#ffffff" },
			}),
		]);
		expect(entry?.roleClass).toBe("neutral");
	});

	it("marks a thin single measurement as an unproven role", () => {
		const [entry] = classifyColors([
			element({
				role: "element",
				properties: { "background-color": "#ff00aa" },
			}),
		]);
		expect(entry?.roleClass).toBe("unknown");
		expect(entry?.rationale).toMatch(/too thin/i);
	});

	it("treats a single brand-named sighting with one action fill as an association, not proof", () => {
		const [entry] = classifyColors([
			element({
				role: "cta",
				properties: { "background-color": "#155eef" },
				variables: { "--color-brand": "#155eef" },
			}),
		]);
		expect(entry?.roleClass).toBe("accent");
		expect(entry?.rationale).toMatch(/once|single|association|confirmed/i);
	});

	it("never treats action text paint as an action fill", () => {
		const [entry] = classifyColors([
			element({ role: "cta", properties: { color: "#ffffff" } }),
			element({ role: "cta", properties: { color: "#ffffff" } }),
		]);
		expect(entry?.roleClass).not.toBe("brand");
		expect(entry?.roleClass).not.toBe("accent");
		expect(entry?.roleLabel).toMatch(/text/i);
	});

	it("reports modern colour spaces the parser cannot reduce instead of dropping them silently", () => {
		const unsupported = collectUnsupportedColors([
			element({ properties: { "background-color": "oklch(0.7 0.1 250)" } }),
			element({
				properties: { color: "color(display-p3 1 0.5 0)" },
			}),
			element({ properties: { "background-color": "rgb(21, 94, 239)" } }),
		]);
		expect(unsupported).toContain("oklch(0.7 0.1 250)");
		expect(unsupported).toContain("color(display-p3 1 0.5 0)");
		expect(unsupported).not.toContain("rgb(21, 94, 239)");
	});

	it("keeps the audit trail of variables and selectors behind a role", () => {
		const [entry] = classifyColors([
			element({
				role: "cta",
				properties: { "background-color": "#155eef" },
				variables: { "--color-primary": "#155eef" },
			}),
			element({ role: "cta", properties: { "background-color": "#155eef" } }),
		]);
		expect(entry?.token.usage.variableNames).toContain("--color-primary");
		expect(entry?.token.usage.selectors.length).toBeGreaterThan(0);
	});
});
