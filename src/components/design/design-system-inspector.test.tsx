// @vitest-environment jsdom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
	DesignInspectorModel,
	InspectorColorToken,
} from "@/lib/design-md-inspector";
import { parseDesignMd } from "@/lib/design-md-inspector";
import {
	classifyPaletteGroup,
	DesignSystemInspector,
	groupPaletteColors,
} from "./design-system-inspector";

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

const MODEL: DesignInspectorModel = {
	title: "Acme - Style Reference",
	essence: "A crisp ledger console under morning light.",
	theme: "light",
	overview: "Acme pairs a paper canvas with ink typography.",
	colors: [
		{
			name: "Canvas",
			value: "#ffffff",
			token: "--color-canvas",
			role: "Page background",
		},
		{
			name: "Cobalt",
			value: "#155eef",
			token: "--color-cobalt",
			role: "Primary CTA",
		},
	],
	typography: [
		{
			label: "Display",
			family: "Inter",
			size: "48px",
			weight: "700",
			lineHeight: "1.1",
		},
		{
			label: "Body",
			family: "Inter",
			size: "16px",
			weight: "400",
			lineHeight: "1.5",
		},
	],
	fonts: [
		{ family: "Inter", weights: ["700", "400"], roles: ["Display", "Body"] },
	],
	spacing: [
		{ label: "space-1", value: "4px" },
		{ label: "section-gap", value: "64px" },
	],
	radii: [{ label: "radius-md", value: "8px" }],
	baseUnit: "4px",
	dos: ["Do use observed colors for surfaces."],
	donts: ["Don't copy the source brand name or logo."],
};

const EMPTY_MODEL: DesignInspectorModel = {
	title: "",
	essence: "",
	theme: "unknown",
	overview: "",
	colors: [],
	typography: [],
	fonts: [],
	spacing: [],
	radii: [],
	baseUnit: "",
	dos: [],
	donts: [],
};

function renderInspector(model: DesignInspectorModel = MODEL) {
	return render(
		<DesignSystemInspector
			siteName="Acme"
			domain="acme.example"
			sourceUrl="https://acme.example/"
			model={model}
		/>,
	);
}

describe("DesignSystemInspector", () => {
	it("renders site identity from props, not from hardcoded brand data", () => {
		renderInspector();
		expect(screen.getByRole("heading", { name: "Acme" })).toBeDefined();
		expect(screen.getByText("acme.example")).toBeDefined();
		expect(
			screen.getByText("A crisp ledger console under morning light."),
		).toBeDefined();
	});

	it("renders the parsed color palette with values", () => {
		renderInspector();
		expect(screen.getByRole("heading", { name: /palet warna/i })).toBeDefined();
		expect(screen.getByText("#155eef")).toBeDefined();
		expect(screen.getByText("Cobalt")).toBeDefined();
		expect(screen.getByText("Primary CTA")).toBeDefined();
	});

	it("renders the parsed type scale with size metadata", () => {
		renderInspector();
		expect(screen.getByRole("heading", { name: /tipografi/i })).toBeDefined();
		expect(screen.getByText("Display")).toBeDefined();
		expect(screen.getByText("48px · 700 · 1.1")).toBeDefined();
	});

	it("renders parsed font families with weights", () => {
		renderInspector();
		expect(screen.getByRole("heading", { name: /^font$/i })).toBeDefined();
		expect(screen.getByText("Inter")).toBeDefined();
		expect(screen.getByText("700, 400")).toBeDefined();
	});

	it("renders spacing and shape tokens", () => {
		renderInspector();
		expect(
			screen.getByRole("heading", { name: /spasi.*bentuk/i }),
		).toBeDefined();
		expect(screen.getByText("section-gap")).toBeDefined();
		expect(screen.getByText("64px")).toBeDefined();
		expect(screen.getByText("radius-md")).toBeDefined();
	});

	it("renders guideline rules verbatim", () => {
		renderInspector();
		expect(screen.getByRole("heading", { name: /panduan/i })).toBeDefined();
		expect(
			screen.getByText("Do use observed colors for surfaces."),
		).toBeDefined();
		expect(
			screen.getByText("Don't copy the source brand name or logo."),
		).toBeDefined();
	});

	it("omits sections without data instead of inventing values", () => {
		const { container } = renderInspector(EMPTY_MODEL);
		expect(screen.queryByRole("heading", { name: /palet warna/i })).toBeNull();
		expect(screen.queryByRole("heading", { name: /tipografi/i })).toBeNull();
		expect(screen.queryByRole("heading", { name: /^font$/i })).toBeNull();
		expect(
			screen.queryByRole("heading", { name: /spasi.*bentuk/i }),
		).toBeNull();
		expect(screen.queryByRole("heading", { name: /panduan/i })).toBeNull();
		expect(container.querySelectorAll('[role="img"]').length).toBe(0);
	});

	it("never renders source-document tabs", () => {
		const { container } = renderInspector();
		expect(container.textContent).not.toMatch(/tailwind v4/i);
		expect(container.textContent).not.toMatch(/css variables/i);
		expect(container.textContent).not.toMatch(/design tokens/i);
		expect(container.textContent).not.toMatch(/compact|extended/i);
	});
});

const BRAND_COLOR: InspectorColorToken = {
	name: "Primary",
	value: "#155eef",
	token: "--color-primary",
	role: "Primary action",
};

const ACCENT_COLOR: InspectorColorToken = {
	name: "Highlight",
	value: "#f5b301",
	token: "--color-highlight",
	role: "Decorative highlight",
};

const NEUTRAL_COLOR: InspectorColorToken = {
	name: "Canvas",
	value: "#ffffff",
	token: "--color-canvas",
	role: "Page background",
};

const SEMANTIC_COLOR: InspectorColorToken = {
	name: "Success",
	value: "#16a34a",
	token: "--color-success",
	role: "Success state",
};

const AMBIGUOUS_COLOR: InspectorColorToken = {
	name: "Nebula",
	value: "#123456",
	token: "--color-nebula",
	role: "Khusus",
};

function paletteModel(colors: InspectorColorToken[]): DesignInspectorModel {
	return { ...EMPTY_MODEL, colors };
}

describe("classifyPaletteGroup", () => {
	it("maps brand, accent, neutral, and semantic signals deterministically", () => {
		expect(classifyPaletteGroup(BRAND_COLOR)).toBe("brand");
		expect(classifyPaletteGroup(ACCENT_COLOR)).toBe("accent");
		expect(classifyPaletteGroup(NEUTRAL_COLOR)).toBe("neutral");
		expect(classifyPaletteGroup(SEMANTIC_COLOR)).toBe("semantic");
	});

	it("returns the same group on repeated calls", () => {
		const colors = [
			BRAND_COLOR,
			ACCENT_COLOR,
			NEUTRAL_COLOR,
			SEMANTIC_COLOR,
			AMBIGUOUS_COLOR,
		];
		expect(groupPaletteColors(colors)).toEqual(groupPaletteColors(colors));
	});

	it("falls back to other for ambiguous colors", () => {
		expect(classifyPaletteGroup(AMBIGUOUS_COLOR)).toBe("other");
		const groups = groupPaletteColors([AMBIGUOUS_COLOR]);
		expect(groups).toHaveLength(1);
		expect(groups[0]?.key).toBe("other");
		expect(groups[0]?.colors).toEqual([AMBIGUOUS_COLOR]);
	});

	it("keeps surface-bound primary colors neutral instead of brand", () => {
		expect(
			classifyPaletteGroup({
				name: "Ink",
				value: "#0f0f0f",
				token: "--color-ink",
				role: "Primary text",
			}),
		).toBe("neutral");
	});
});

describe("palette gallery", () => {
	it("renders colors as grouped gallery sections", () => {
		renderInspector(
			paletteModel([
				BRAND_COLOR,
				NEUTRAL_COLOR,
				SEMANTIC_COLOR,
				AMBIGUOUS_COLOR,
			]),
		);
		const brand = screen.getByRole("region", { name: "Brand" });
		expect(within(brand).getByText("Primary")).toBeDefined();
		const neutral = screen.getByRole("region", { name: "Netral" });
		expect(within(neutral).getByText("Canvas")).toBeDefined();
		const semantic = screen.getByRole("region", { name: "Semantik" });
		expect(within(semantic).getByText("Success")).toBeDefined();
		const other = screen.getByRole("region", { name: "Lainnya" });
		expect(within(other).getByText("Nebula")).toBeDefined();
	});

	it("keeps actual parsed color values unchanged on swatches", () => {
		renderInspector(paletteModel([BRAND_COLOR, NEUTRAL_COLOR]));
		const reference = document.createElement("div");
		for (const color of [BRAND_COLOR, NEUTRAL_COLOR]) {
			const swatch = screen.getByRole("img", {
				name: `Swatch warna ${color.name} ${color.value}`,
			});
			reference.style.backgroundColor = color.value;
			expect(swatch.style.backgroundColor).toBe(
				reference.style.backgroundColor,
			);
			expect(screen.getByText(color.value)).toBeDefined();
		}
	});

	it("shows a brand group only when parsed data supports it", () => {
		const { rerender } = renderInspector(paletteModel([NEUTRAL_COLOR]));
		expect(screen.queryByRole("region", { name: "Brand" })).toBeNull();
		rerender(
			<DesignSystemInspector
				siteName="Acme"
				domain="acme.example"
				sourceUrl="https://acme.example/"
				model={paletteModel([NEUTRAL_COLOR, BRAND_COLOR])}
			/>,
		);
		expect(screen.getByRole("region", { name: "Brand" })).toBeDefined();
	});

	it("never promotes the first item to brand without evidence", () => {
		renderInspector(paletteModel([NEUTRAL_COLOR, SEMANTIC_COLOR]));
		expect(screen.queryByRole("region", { name: "Brand" })).toBeNull();
		expect(screen.getByRole("region", { name: "Netral" })).toBeDefined();
	});

	it("renders no hardcoded site-specific palette content", () => {
		const { container } = renderInspector(
			paletteModel([BRAND_COLOR, NEUTRAL_COLOR]),
		);
		expect(container.textContent).not.toMatch(/notion/i);
		expect(container.textContent).not.toMatch(/insforge/i);
	});

	it("renders many colors without dropping any or fixing widths", () => {
		const colors: InspectorColorToken[] = Array.from(
			{ length: 12 },
			(_, index) => ({
				name: `Warna ${index + 1}`,
				value: `#${(index + 1).toString(16).padStart(6, "0")}`,
				token: `--color-contoh-${index + 1}`,
				role: `Contoh peran ${index + 1}`,
			}),
		);
		const { container } = renderInspector(paletteModel(colors));
		const swatches = within(container).getAllByRole("img");
		expect(swatches).toHaveLength(colors.length);
		for (const swatch of swatches) {
			expect(swatch.style.width).toBe("");
		}
	});

	it("copies the exact source value with an accessible action", async () => {
		const writeText = vi.fn(async () => {});
		vi.stubGlobal("navigator", { clipboard: { writeText } });
		renderInspector(paletteModel([BRAND_COLOR]));
		fireEvent.click(
			screen.getByRole("button", { name: `Salin warna ${BRAND_COLOR.value}` }),
		);
		expect(writeText).toHaveBeenCalledWith(BRAND_COLOR.value);
		expect(
			await screen.findByRole("button", {
				name: `Tersalin ${BRAND_COLOR.value}`,
			}),
		).toBeDefined();
	});

	it("renders a realistic parsed DESIGN.md as a grouped gallery", () => {
		const designMd = [
			"# Acme - Style Reference",
			"> A crisp ledger console under morning light.",
			"",
			"**Theme:** light",
			"",
			"Acme pairs a paper canvas with ink typography.",
			"",
			"## Tokens - Colors",
			"| Name | Value | Token | Role |",
			"| --- | --- | --- | --- |",
			"| Canvas | #ffffff | --color-canvas | Page background |",
			"| Surface | #f7f8f8 | --color-surface | Card surface |",
			"| Ink | #0f0f0f | --color-ink | Primary text |",
			"| Muted | #606060 | --color-muted | Muted text |",
			"| Hairline | #d3d3d3 | --color-hairline | Hairline border |",
			"| Cobalt | #155eef | --color-cobalt | Primary CTA |",
			"| Accent | #6ee7b7 | --color-accent | Decorative highlight |",
			"| Success | #16a34a | --color-success | Success state |",
			"| Warning | #d97706 | --color-warning | Warning state |",
			"| Error | #dc2626 | --color-error | Error state |",
			"| Nebula | #123456 | --color-nebula | Khusus |",
		].join("\n");
		const model = parseDesignMd(designMd);
		expect(model.colors).toHaveLength(11);
		renderInspector(model);
		for (const label of ["Brand", "Aksen", "Netral", "Semantik", "Lainnya"]) {
			expect(screen.getByRole("region", { name: label })).toBeDefined();
		}
		expect(
			within(screen.getByRole("region", { name: "Brand" })).getByText("Cobalt"),
		).toBeDefined();
		expect(
			within(screen.getByRole("region", { name: "Lainnya" })).getByText(
				"Nebula",
			),
		).toBeDefined();
		for (const value of [
			"#ffffff",
			"#f7f8f8",
			"#0f0f0f",
			"#606060",
			"#d3d3d3",
			"#155eef",
			"#6ee7b7",
			"#16a34a",
			"#d97706",
			"#dc2626",
			"#123456",
		]) {
			expect(screen.getByText(value)).toBeDefined();
		}
	});
});
