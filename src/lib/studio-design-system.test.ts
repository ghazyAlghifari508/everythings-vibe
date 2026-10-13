import { describe, expect, it } from "vitest";
import type { StudioDesignBlueprint } from "@/lib/studio-design-blueprint";
import {
	enforceDesignSystemOnHtml,
	extractDesignSystemTokens,
	generateDesignSystemHtmlHeader,
	validateGeneratedHtml,
} from "./studio-design-system";

const sampleBlueprint: StudioDesignBlueprint = {
	productIdentity: {
		productName: "Kopi",
		targetAudience: "Umum",
		platform: "mobile",
		visualDirection: "Hangat",
	},
	designTokens: {
		primary: "#0f0f0f",
		secondary: "#606060",
		background: "#ffffff",
		surface: "#f8f8f8",
		fontFamily: "system-ui",
		radius: 12,
		border: "1px solid #d3d3d3",
		elevation: "none",
	},
	sharedComponents: {
		header: "Bar",
		navigation: "Tabs",
		buttons: "Ink",
		inputs: "8px",
		cards: "12px",
		tabs: "Seg",
		icons: "Lucide",
	},
	navigationContract: {
		destinations: ["jelajah", "kustom"],
		labels: ["Jelajah", "Kustom"],
		iconMapping: { jelajah: "compass", kustom: "sliders" },
		ordering: ["jelajah", "kustom"],
		activeItemRule: "Highlight aktif",
	},
	screenPlan: [
		{ name: "Jelajah", role: "Katalog", order: 0 },
		{ name: "Kustom", role: "Opsi", order: 1 },
	],
};

const sampleDesignMd = `# MindMarket — Style Reference
> Warm storybook on cream paper — a friendly editorial canvas where oversized Inter headlines and paper-cut characters share a sunlit, sticker-soft surface.

**Theme:** light

## Tokens — Colors

| Name | Value | Token | Role |
|------|-------|-------|------|
| Fresh Grass | \`#8ed462\` | \`--color-fresh-grass\` | Primary brand accent — navigation strokes, card borders, decorative highlights |
| Cream Paper | \`#f5f1e4\` | \`--color-cream-paper\` | Dominant page background and soft card surface |
| Ink Black | \`#2c2e2a\` | \`--color-ink-black\` | Primary text, icons, nav borders |
| Pure White | \`#ffffff\` | \`--color-pure-white\` | Elevated card surfaces |
| Sky Pop | \`#2ba0ff\` | \`--color-sky-pop\` | Decorative illustration accent |

## Tokens — Typography

### Inter — Single-family system
- **Substitute:** Inter (Google Fonts)
- **Weights:** 400, 500

### Type Scale
| Role | Size | Line Height |
| body-sm | 15px | 1.5 |
| heading | 53px | 1.15 |

## Tokens — Spacing & Shapes

### Border Radius

| Element | Value |
|---------|-------|
| nav | 50px |
| cards | 50px |
| buttons | 50px |
| small | 10px |

## Do's and Don'ts

### Do
- Use #f5f1e4 cream as the page canvas — never #ffffff as the primary background.
- Set border-radius to 50px for all cards, buttons, and nav containers.
`;

describe("Studio Design System", () => {
	it("removes enforced token blocks when a reference is explicitly removed", () => {
		const old = enforceDesignSystemOnHtml(
			"<html><head></head><body>Sample</body></html>",
			extractDesignSystemTokens(sampleDesignMd),
		);
		expect(enforceDesignSystemOnHtml(old, null)).not.toContain(
			"studio-design-tokens",
		);
		expect(enforceDesignSystemOnHtml(old, null)).not.toContain(
			"studio-tailwind-tokens",
		);
	});
	it("reads the import modal's three-column color format and explicit font without inventing missing tokens", () => {
		const tokens = extractDesignSystemTokens(
			"# Sample\n| Name | Hex | Role |\n| Canvas | #ececec | Background |\n| Primary | #224488 | Brand |\nFont: Arial\n### Components\n",
		);
		expect(tokens?.colors.canvas).toBe("#ececec");
		expect(tokens?.colors.primary).toBe("#224488");
		expect(tokens?.colors.muted).toBeNull();
		expect(tokens?.typography.fontFamily).toContain("Arial");
	});
	it("replaces old enforced tokens when a reference changes", () => {
		const first = enforceDesignSystemOnHtml(
			"<html><head></head><body></body></html>",
			extractDesignSystemTokens(sampleDesignMd),
		);
		const next = enforceDesignSystemOnHtml(
			first,
			extractDesignSystemTokens(
				"# Sample\n| Canvas | #eeeeee | --canvas | Background |\nFont: Arial",
			),
		);
		expect(next).toContain("--canvas-bg: #eeeeee");
		expect(next).not.toContain("--canvas-bg: #f5f1e4");
	});
	it("extracts canonical colors, fonts, and border radius from DESIGN.md", () => {
		const tokens = extractDesignSystemTokens(sampleDesignMd);
		expect(tokens).not.toBeNull();
		if (!tokens) return;

		expect(tokens.colors.primary?.toLowerCase()).toBe("#8ed462");
		expect(tokens.colors.canvas?.toLowerCase()).toBe("#f5f1e4");
		expect(tokens.colors.ink?.toLowerCase()).toBe("#2c2e2a");
		expect(tokens.colors.surface?.toLowerCase()).toBe("#ffffff");

		expect(tokens.typography.fontFamily).toContain("Inter");
		expect(tokens.shapes.borderRadius.cards).toBe("50px");
		expect(tokens.shapes.borderRadius.buttons).toBe("50px");
		expect(tokens.shapes.borderRadius.nav).toBe("50px");
	});

	it("generates deterministic CSS custom properties and Tailwind config", () => {
		const tokens = extractDesignSystemTokens(sampleDesignMd);
		expect(tokens).not.toBeNull();
		if (!tokens) return;

		const headerHtml = generateDesignSystemHtmlHeader(tokens);
		expect(headerHtml).toContain("--color-primary: #8ed462");
		expect(headerHtml).toContain("--canvas-bg: #f5f1e4");
		expect(headerHtml).toContain("--radius-button: 50px");
		expect(headerHtml).toContain("tailwind.config");
		expect(headerHtml).toContain("fonts.googleapis.com");
	});

	it("enforces design system tokens and canvas background on generated HTML", () => {
		const tokens = extractDesignSystemTokens(sampleDesignMd);
		expect(tokens).not.toBeNull();
		if (!tokens) return;

		const rawHtml = `<!DOCTYPE html>
<html>
<head>
  <title>Test Page</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-white text-gray-900">
  <nav class="flex items-center justify-between p-4">
    <div class="logo">Brand</div>
  </nav>
  <main class="p-8">
    <h1 class="text-3xl font-bold">Welcome</h1>
    <button class="bg-blue-600 text-white px-4 py-2">Click Me</button>
  </main>
</body>
</html>`;

		const enforced = enforceDesignSystemOnHtml(
			rawHtml,
			tokens,
			"/api/studio/asset?id=123&cap=abc",
		);
		expect(enforced).toContain("studio-design-tokens");
		expect(enforced).toContain("--canvas-bg: #f5f1e4");
		expect(enforced).toContain("/api/studio/asset?id=123&cap=abc");
	});

	it("injects shared blueprint tokens deterministically", () => {
		const enforced = enforceDesignSystemOnHtml(
			"<html><head></head><body></body></html>",
			null,
			null,
			sampleBlueprint,
		);
		expect(enforced).toContain("studio-blueprint-tokens");
		expect(enforced).toContain("--bp-primary:#0f0f0f");
	});

	it("validates generated HTML against blueprint and viewport contract", () => {
		expect(
			validateGeneratedHtml("<html><body><p>Halo</p></body></html>", {
				blueprint: null,
				viewport: "mobile",
				expectTokens: false,
			}).length,
		).toBeGreaterThan(0);
		const valid = enforceDesignSystemOnHtml(
			'<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><nav>Jelajah Kustom</nav></body></html>',
			null,
			null,
			sampleBlueprint,
		);
		expect(
			validateGeneratedHtml(valid, {
				blueprint: sampleBlueprint,
				viewport: "mobile",
				expectTokens: false,
			}),
		).toEqual([]);
	});

	it("rejects a mobile artboard with a viewport-anchored bar", () => {
		const anchored = enforceDesignSystemOnHtml(
			'<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>.tab{position: fixed; bottom:0;}</style></head><body><nav>Jelajah Kustom</nav></body></html>',
			null,
			null,
			sampleBlueprint,
		);
		const issues = validateGeneratedHtml(anchored, {
			blueprint: sampleBlueprint,
			viewport: "mobile",
			expectTokens: false,
		});
		expect(issues.some((issue) => issue.includes("fixed"))).toBe(true);
	});

	it("rejects a sticky mobile element regardless of declaration spacing", () => {
		const sticky = enforceDesignSystemOnHtml(
			'<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>.bar{position:sticky;top:0}</style></head><body><nav>Jelajah Kustom</nav></body></html>',
			null,
			null,
			sampleBlueprint,
		);
		expect(
			validateGeneratedHtml(sticky, {
				blueprint: sampleBlueprint,
				viewport: "mobile",
				expectTokens: false,
			}).some((issue) => issue.includes("sticky")),
		).toBe(true);
	});

	it("accepts an in-flow bottom navigation for a mobile artboard", () => {
		const inFlow = enforceDesignSystemOnHtml(
			'<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>.tab{display:flex;padding-bottom:env(safe-area-inset-bottom)}</style></head><body><main style="padding-bottom:64px">Konten</main><nav class="tab">Jelajah Kustom</nav></body></html>',
			null,
			null,
			sampleBlueprint,
		);
		expect(
			validateGeneratedHtml(inFlow, {
				blueprint: sampleBlueprint,
				viewport: "mobile",
				expectTokens: false,
			}),
		).toEqual([]);
	});

	it("does not apply the mobile positioning contract to web artboards", () => {
		const web = enforceDesignSystemOnHtml(
			'<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>.hdr{position:sticky;top:0}</style></head><body><nav>Jelajah Kustom</nav></body></html>',
			null,
			null,
			sampleBlueprint,
		);
		expect(
			validateGeneratedHtml(web, {
				blueprint: sampleBlueprint,
				viewport: "web",
				expectTokens: false,
			}),
		).toEqual([]);
	});
});
