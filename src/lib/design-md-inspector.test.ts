import { describe, expect, it } from "vitest";
import { parseDesignMd } from "./design-md-inspector";

const FIXTURE = `# Acme - Style Reference
> A crisp ledger console under morning light.

**Theme:** light

Acme pairs a paper canvas with ink typography and a single cobalt action color. Hierarchy comes from size contrast rather than decoration. Spacing stays airy while section rhythm holds steady across pages.

## Tokens - Colors
| Name | Value | Token | Role |
| --- | --- | --- | --- |
| Canvas | #ffffff | --color-canvas | Page background |
| Ink | #101828 | --color-ink | Primary text |
| Cobalt | #155eef | --color-cobalt | Primary CTA |
| Mist | #eef2f6 | --color-mist | Subtle surface |
| Graphite | #667085 | --color-graphite | Secondary text |
| Hairline | #d0d5dd | --color-hairline | Borders |
| Success | #067647 | --color-success | Positive states |
| Danger | #b42318 | --color-danger | Destructive states |

## Tokens - Typography
Acme sets **Inter** with a system fallback across weights 400 to 700.

| Style | Family | Size | Weight | Line Height |
| --- | --- | --- | --- | --- |
| Display | Inter | 48px | 700 | 1.1 |
| Heading | Inter | 32px | 600 | 1.25 |
| Body | Inter | 16px | 400 | 1.5 |

## Tokens - Spacing & Shapes
Base unit: 4px.

| Token | Value |
| --- | --- |
| space-1 | 4px |
| space-2 | 8px |
| section-gap | 64px |

| Radius | Value |
| --- | --- |
| radius-sm | 4px |
| radius-md | 8px |
| radius-lg | 12px |

## Components
### Hero Display
Role and anatomy for the hero primitive.

### Primary CTA
Role and anatomy for the call-to-action primitive.

## Do's and Don'ts
- Do use observed colors for surfaces.
- Do keep hierarchy through size contrast.
- Do map new components to observed primitives.
- Don't copy the source brand name or logo.
- Don't mix unobserved accent colors.
- Do not flatten typography into one size.

## Surfaces
| Level | Name | Value | Purpose |
| --- | --- | --- | --- |
| 0 | Canvas | #ffffff | Page base |

## Elevation
Depth comes from hairline borders rather than shadows.

## Imagery
Spare product illustration on plain surfaces.

## Layout
Single column with a 1120px measure and steady section rhythm.

## Agent Prompt Guide
### Quick Color Reference
Use canvas, ink, and cobalt.

### Example Component Prompts
1. Build a hero with the observed display type and cobalt CTA.
2. Build a card with hairline borders and 12px radius.

## Similar Brands
Comparable ledger consoles with restrained palettes.

## Quick Start
### CSS Custom Properties
Starter variables from observed tokens.

### Tailwind v4
Starter theme from observed tokens.

## Limitations & Confidence Notes
Single page analyzed; verify motion tokens manually.
`;

describe("parseDesignMd", () => {
	it("parses the header block into title, essence, theme, and overview", () => {
		const model = parseDesignMd(FIXTURE);
		expect(model.title).toBe("Acme - Style Reference");
		expect(model.essence).toBe("A crisp ledger console under morning light.");
		expect(model.theme).toBe("light");
		expect(model.overview).toContain("paper canvas");
	});

	it("parses the color table into named tokens with roles", () => {
		const model = parseDesignMd(FIXTURE);
		expect(model.colors.length).toBe(8);
		expect(model.colors[0]).toEqual({
			name: "Canvas",
			value: "#ffffff",
			token: "--color-canvas",
			role: "Page background",
		});
		expect(model.colors[2]?.value).toBe("#155eef");
	});

	it("parses the type scale table into visual entries", () => {
		const model = parseDesignMd(FIXTURE);
		expect(model.typography.length).toBe(3);
		expect(model.typography[0]).toMatchObject({
			label: "Display",
			family: "Inter",
			size: "48px",
			weight: "700",
			lineHeight: "1.1",
		});
	});

	it("groups font families with their observed weights and roles", () => {
		const model = parseDesignMd(FIXTURE);
		expect(model.fonts.length).toBe(1);
		expect(model.fonts[0]?.family).toBe("Inter");
		expect(model.fonts[0]?.weights).toEqual(
			expect.arrayContaining(["700", "600", "400"]),
		);
		expect(model.fonts[0]?.roles).toEqual(
			expect.arrayContaining(["Display", "Heading", "Body"]),
		);
	});

	it("parses spacing and radius tables separately", () => {
		const model = parseDesignMd(FIXTURE);
		expect(model.spacing.length).toBe(3);
		expect(model.spacing[2]).toEqual({
			label: "section-gap",
			value: "64px",
		});
		expect(model.radii.length).toBe(3);
		expect(model.radii[2]).toEqual({ label: "radius-lg", value: "12px" });
		expect(model.baseUnit).toBe("4px");
	});

	it("splits Do and Don't bullets without paraphrasing", () => {
		const model = parseDesignMd(FIXTURE);
		expect(model.dos.length).toBe(3);
		expect(model.donts.length).toBe(3);
		expect(model.dos[0]).toBe("Do use observed colors for surfaces.");
		expect(model.donts).toContain("Don't copy the source brand name or logo.");
		expect(model.donts).toContain("Do not flatten typography into one size.");
	});

	it("omits missing optional sections instead of inventing values", () => {
		const model = parseDesignMd("# Bare - Style Reference\n");
		expect(model.title).toBe("Bare - Style Reference");
		expect(model.essence).toBe("");
		expect(model.theme).toBe("unknown");
		expect(model.overview).toBe("");
		expect(model.colors).toEqual([]);
		expect(model.typography).toEqual([]);
		expect(model.fonts).toEqual([]);
		expect(model.spacing).toEqual([]);
		expect(model.radii).toEqual([]);
		expect(model.baseUnit).toBe("");
		expect(model.dos).toEqual([]);
		expect(model.donts).toEqual([]);
	});

	it("tolerates CRLF, bold cells, and heading variants", () => {
		const raw = [
			"# Acme - Style Reference",
			"> Essence here.",
			"",
			"**Theme:** dark",
			"",
			"## Tokens - colors",
			"| **Name** | **Value** | **Token** | **Role** |",
			"| --- | --- | --- | --- |",
			"| **Canvas** | **#ffffff** | **--color-canvas** | **Base** |",
			"",
			"## Limitations & Confidence",
			"Notes here.",
			"",
		].join("\r\n");
		const model = parseDesignMd(raw);
		expect(model.theme).toBe("dark");
		expect(model.colors.length).toBe(1);
		expect(model.colors[0]).toEqual({
			name: "Canvas",
			value: "#ffffff",
			token: "--color-canvas",
			role: "Base",
		});
	});

	it("ignores non-canonical sections instead of leaking them", () => {
		const model = parseDesignMd(
			"# Acme - Style Reference\n\n## Custom Notes\n| A | B |\n| --- | --- |\n| x | y |\n",
		);
		expect(model.colors).toEqual([]);
		expect(model.typography).toEqual([]);
		expect(model.dos).toEqual([]);
		expect(model.donts).toEqual([]);
	});
});
