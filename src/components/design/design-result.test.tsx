// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DesignResult } from "./design-result";

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

const DESIGN_MD = `# Acme - Style Reference
> A crisp ledger console under morning light.

**Theme:** light

Acme pairs a paper canvas with ink typography.

## Tokens - Colors
| Name | Value | Token | Role |
| --- | --- | --- | --- |
| Canvas | #ffffff | --color-canvas | Page background |
| Cobalt | #155eef | --color-cobalt | Primary CTA |

## Tokens - Typography
| Style | Family | Size | Weight | Line Height |
| --- | --- | --- | --- | --- |
| Display | Inter | 48px | 700 | 1.1 |

## Tokens - Spacing & Shapes
Base unit: 4px.

| Token | Value |
| --- | --- |
| space-1 | 4px |

| Radius | Value |
| --- | --- |
| radius-md | 8px |

## Components
### Hero Display
Role and anatomy.

## Do's and Don'ts
- Do use observed colors.
- Don't copy the brand logo.

## Surfaces
| Level | Name | Value | Purpose |
| --- | --- | --- | --- |
| 0 | Canvas | #ffffff | Base |

## Elevation
Hairline borders carry depth.

## Imagery
Spare illustration.

## Layout
Single column rhythm.

## Agent Prompt Guide
### Quick Color Reference
Canvas and cobalt.

### Example Component Prompts
1. Build a hero with display type.

## Similar Brands
Ledger consoles.

## Quick Start
### CSS Custom Properties
Variables here.

### Tailwind v4
Theme here.

## Limitations & Confidence Notes
Single page analyzed.
`;

function renderResult() {
	return render(
		<DesignResult
			sourceUrl="https://acme.example/"
			domain="acme.example"
			designMd={DESIGN_MD}
		/>,
	);
}

describe("DesignResult", () => {
	it("renders site identity from the domain, not the SEO title", () => {
		renderResult();
		expect(screen.getByRole("heading", { name: "Acme" })).toBeDefined();
		expect(screen.getByText("acme.example")).toBeDefined();
	});

	it("pairs the visual inspector with the raw DESIGN.md source", () => {
		const { container } = renderResult();
		expect(screen.getByRole("heading", { name: /palet warna/i })).toBeDefined();
		expect(screen.getByRole("heading", { name: /tipografi/i })).toBeDefined();
		expect(screen.getByRole("heading", { name: /^font$/i })).toBeDefined();
		expect(
			screen.getByRole("heading", { name: /spasi.*bentuk/i }),
		).toBeDefined();
		expect(screen.getByRole("heading", { name: /panduan/i })).toBeDefined();
		expect(screen.getByText("DESIGN.md")).toBeDefined();
		expect(
			screen.getByRole("button", { name: "Salin DESIGN.md" }),
		).toBeDefined();
		expect(
			screen.getByRole("button", { name: "Download DESIGN.md" }),
		).toBeDefined();
		expect(
			screen.getByRole("button", { name: /implement ke ai agent/i }),
		).toBeDefined();
		expect(container.textContent).toContain("# Acme - Style Reference");
	});

	it("exposes no framework tabs or density modes", () => {
		const { container } = renderResult();
		expect(screen.queryByRole("tab")).toBeNull();
		expect(container.textContent).not.toMatch(/css variables/i);
		expect(container.textContent).not.toMatch(/design tokens/i);
		expect(container.textContent).not.toMatch(/compact|extended/i);
	});

	it("opens the AI agent handoff with the live document", () => {
		renderResult();
		fireEvent.click(
			screen.getByRole("button", { name: /implement ke ai agent/i }),
		);
		expect(
			screen.getByRole("heading", { name: "Implement ke AI Agent" }),
		).toBeDefined();
		const prompt = screen.getByLabelText(/prompt implementasi/i);
		expect((prompt as HTMLTextAreaElement).value).toContain(
			"https://acme.example/",
		);
		expect((prompt as HTMLTextAreaElement).value).toContain(
			"# Acme - Style Reference",
		);
	});
});
