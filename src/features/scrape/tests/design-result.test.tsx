// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DesignResult } from "../components/design-result";

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

function renderResult(designMd = DESIGN_MD) {
	return render(
		<DesignResult
			sourceUrl="https://acme.example/"
			domain="acme.example"
			designMd={designMd}
		/>,
	);
}

describe("DesignResult", () => {
	it("renders the site name and canonical source link", () => {
		renderResult();
		expect(screen.getByRole("heading", { name: "Acme" })).toBeDefined();
		expect(screen.queryByText("acme.example", { exact: true })).toBeNull();
		expect(
			screen.getByRole("link", { name: "https://acme.example/" }),
		).toBeDefined();
	});

	it("pairs the visual inspector with the raw DESIGN.md source", () => {
		const { container } = renderResult();
		expect(screen.getByRole("heading", { name: /palet warna/i })).toBeDefined();
		expect(screen.getByRole("heading", { name: /type scale/i })).toBeDefined();
		expect(
			screen.getByRole("heading", { name: /typeface inspector/i }),
		).toBeDefined();
		expect(
			screen.getByRole("heading", { name: /spacing & bentuk/i }),
		).toBeDefined();
		expect(screen.getByRole("heading", { name: /panduan/i })).toBeDefined();
		expect(screen.getAllByText("DESIGN.md").length).toBeGreaterThan(0);
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

	it("exposes rendered/source tabs without framework tabs", () => {
		const { container } = renderResult();
		expect(screen.getByRole("tab", { name: /rendered/i })).toBeDefined();
		expect(screen.getByRole("tab", { name: /source/i })).toBeDefined();
		expect(screen.queryByRole("tab", { name: /tailwind/i })).toBeNull();
		expect(container.textContent).not.toMatch(/css variables/i);
		expect(container.textContent).not.toMatch(/design tokens/i);
		expect(container.textContent).not.toMatch(/compact|extended/i);
	});

	it("opens the AI agent handoff with the exact raw source", () => {
		const longUrl = `https://source.example/${"path-segment-".repeat(16)}`;
		const rawSource = `${DESIGN_MD}\n\n| url | ${longUrl} |\n\n\`\`\`css\n--source-url: url(${longUrl});\n\`\`\`  \n`;
		renderResult(rawSource);
		fireEvent.click(
			screen.getByRole("button", { name: /implement ke ai agent/i }),
		);
		expect(
			screen.getByRole("heading", { name: "Implement ke AI Agent" }),
		).toBeDefined();
		const prompt = screen.getByLabelText(/prompt implementasi/i);
		if (!(prompt instanceof HTMLTextAreaElement)) {
			throw new Error("Expected the prompt control to be a textarea");
		}
		expect(prompt.value.endsWith(`## DESIGN.md\n\n${rawSource}`)).toBe(true);
	});

	it("exposes section navigation and a mobile inspector/design switch", () => {
		renderResult();
		expect(
			screen.getByRole("navigation", { name: /bagian style reference/i }),
		).toBeDefined();
		expect(screen.getByRole("link", { name: "Colors" })).toBeDefined();
		expect(screen.getByRole("tab", { name: "Inspector" })).toBeDefined();
		expect(screen.getByRole("tab", { name: "DESIGN.md" })).toBeDefined();
	});

	it("anchors every rendered inspector section in the navigation", () => {
		renderResult();
		for (const name of [
			"Overview",
			"Colors",
			"Typography",
			"Spacing",
			"Panduan",
			"Keterbatasan",
		]) {
			expect(screen.getByRole("link", { name })).toBeDefined();
		}
		expect(
			screen.getByRole("link", { name: "Panduan" }).getAttribute("href"),
		).toBe("#guidelines");
		expect(
			screen.getByRole("link", { name: "Keterbatasan" }).getAttribute("href"),
		).toBe("#limitations");
	});

	it("links mobile tabs to their panels with unique ids per instance", () => {
		const first = renderResult();
		const second = renderResult();
		const tabs = screen.getAllByRole("tab", { name: /inspector|design\.md/i });
		expect(tabs.length).toBeGreaterThanOrEqual(4);
		const ids = tabs.map((tab) => tab.getAttribute("id"));
		expect(new Set(ids).size).toBe(ids.length);
		for (const tab of tabs) {
			const controls = tab.getAttribute("aria-controls");
			expect(controls).toBeTruthy();
			const panel = document.getElementById(controls ?? "");
			expect(panel).toBeTruthy();
			expect(panel?.getAttribute("role")).toBe("tabpanel");
		}
		first.unmount();
		second.unmount();
	});

	it("moves focus with arrow keys between mobile tabs", () => {
		renderResult();
		const inspectorTab = screen.getByRole("tab", {
			name: "Inspector",
		}) as HTMLElement;
		inspectorTab.focus();
		fireEvent.keyDown(inspectorTab, { key: "ArrowRight" });
		expect(
			(screen.getByRole("tab", { name: "DESIGN.md" }) as HTMLElement) ===
				document.activeElement,
		).toBe(true);
	});

	it("keeps responsive containers from overflowing narrow viewports", () => {
		const { container } = renderResult();
		expect(container.querySelector(".min-w-0.w-full")).toBeTruthy();
		expect(container.querySelector(".overflow-x-auto")).toBeTruthy();
		const mobileTabs = screen.getAllByRole("tab", {
			name: /inspector|design\.md/i,
		});
		for (const tab of mobileTabs.slice(0, 2))
			expect((tab as HTMLElement).className).toMatch(/min-h-\[44px\]/);
	});

	it("keeps the two-column composition with a sticky source panel", () => {
		const { container } = renderResult();
		expect(
			container.querySelector(
				".lg\\:grid-cols-\\[minmax\\(0\\,45fr\\)_minmax\\(0\\,55fr\\)\\]",
			),
		).toBeTruthy();
	});

	it("forwards enrichment retry handler and avoids internal status leakage when components missing", () => {
		const onRetryEnrichment = vi.fn();
		const incompleteMd = `# Acme - Style Reference
> A crisp ledger console under morning light.

**Theme:** light

## Tokens - Colors
| Name | Value | Token | Role |
| --- | --- | --- | --- |
| Canvas | #ffffff | --color-canvas | Page background |
| Cobalt | #155eef | --color-cobalt | Primary CTA |

## Tokens - Typography
| Style | Family | Size | Weight | Line Height |
| --- | --- | --- | --- | --- |
| Display | Inter | 48px | 700 | 1.1 |
`;

		render(
			<DesignResult
				sourceUrl="https://acme.example/"
				domain="acme.example"
				designMd={incompleteMd}
				enrichment="unavailable"
				enrichmentDetail="Model timeout."
				onRetryEnrichment={onRetryEnrichment}
			/>,
		);

		expect(
			screen.getByText(/sebagian panduan komponen belum tersedia/i),
		).toBeDefined();
		expect(
			screen.queryByText(/panduan desain belum sepenuhnya selesai/i),
		).toBeNull();
		expect(screen.queryByText(/ai tidak memenuhi kontrak/i)).toBeNull();
		expect(screen.queryByText(/schema validation failed/i)).toBeNull();
		expect(screen.queryByText(/enrichment unavailable/i)).toBeNull();

		const retryBtn = screen.getByRole("button", {
			name: /lengkapi panduan komponen/i,
		});
		expect(retryBtn).toBeDefined();
		fireEvent.click(retryBtn);
		expect(onRetryEnrichment).toHaveBeenCalledTimes(1);
	});

	it("renders clean without warnings when enrichment is applied", () => {
		render(
			<DesignResult
				sourceUrl="https://acme.example/"
				domain="acme.example"
				designMd={DESIGN_MD}
				enrichment="applied"
			/>,
		);

		expect(
			screen.queryByText(/sebagian panduan komponen belum tersedia/i),
		).toBeNull();
		expect(
			screen.queryByText(/panduan desain belum sepenuhnya selesai/i),
		).toBeNull();
		expect(screen.queryByText(/analisis ai belum lengkap/i)).toBeNull();
		expect(
			screen.queryByRole("button", { name: /lengkapi panduan komponen/i }),
		).toBeNull();
	});
});
