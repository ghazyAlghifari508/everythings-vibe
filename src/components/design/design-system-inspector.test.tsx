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

function color(
	overrides: Partial<InspectorColorToken> & {
		name: string;
		value: string;
		role: string;
	},
): InspectorColorToken {
	return {
		token: "",
		roleClass: "unknown",
		frequency: 1,
		rationale: "",
		confidence: "inferred",
		...overrides,
	};
}

const MODEL: DesignInspectorModel = {
	verification: "observed",
	modelVersion: 2,
	title: "Acme - Style Reference",
	essence: "A crisp ledger console under morning light.",
	theme: "light",
	overview: "Acme pairs a paper canvas with ink typography.",
	colors: [
		color({
			name: "Canvas 1",
			value: "#ffffff",
			token: "--color-canvas",
			role: "Surface",
			roleClass: "neutral",
			rationale: "Repeated on 4 measured surfaces.",
		}),
		color({
			name: "Primary action 2",
			value: "#155eef",
			token: "--color-primary",
			role: "Primary action",
			roleClass: "brand",
			frequency: 2,
			rationale: "Painted the background of 2 measured action elements.",
		}),
	],
	typography: [
		{
			role: "Display",
			family: "Inter",
			size: "48px",
			sizePx: 48,
			weight: "700",
			lineHeight: "1.1",
			letterSpacing: "-2px",
			frequency: 1,
			sample: "Pricing that scales with your team",
		},
		{
			role: "Body",
			family: "Inter",
			size: "16px",
			sizePx: 16,
			weight: "400",
			lineHeight: "1.5",
			letterSpacing: "normal",
			frequency: 3,
			sample: "Start free and upgrade when the team is ready.",
		},
	],
	typefaces: [
		{
			family: "Inter",
			stack: "Inter, sans-serif",
			weights: ["400", "700"],
			sizes: ["48px", "16px"],
			roles: ["Display", "Body"],
			lineHeights: ["1.1", "1.5"],
			letterSpacings: ["-2px"],
			loadedEvidence: true,
			declaredFaces: [
				{ family: "Inter", weight: "400", status: "loaded" },
				{ family: "Inter", weight: "700", status: "loaded" },
			],
			uncertainty: null,
			sample: "Pricing that scales with your team",
		},
	],
	spacing: [
		{
			label: "Card padding",
			value: "48px",
			context: "padding on 2 element",
			frequency: 2,
		},
		{
			label: "Element gap",
			value: "16px",
			context: "gap on 3 element",
			frequency: 3,
		},
	],
	radii: [
		{
			label: "Buttons",
			value: "8px",
			valuePx: 8,
			context: "2 element",
			frequency: 2,
		},
	],
	elevation: [
		{
			value: "rgba(16, 24, 40, 0.06) 0px 1px 3px 0px",
			frequency: 2,
			roles: ["section"],
			usageNote: "Repeated across 2 measured elements.",
			confidence: "observed",
		},
	],
	surfaces: [
		{
			value: "#ffffff",
			level: 0,
			frequency: 3,
			roles: ["canvas", "nav"],
		},
	],
	components: [],
	baseUnitPx: 4,
	dos: [
		{
			rule: "Use 8px for action buttons.",
			evidence: "Measured on 2 elements.",
		},
	],
	donts: [
		{
			rule: "Do not introduce a second action colour.",
			evidence: "Only one repeated action fill was measured.",
		},
	],
	limitations: ["Single viewport; responsive states were not measured."],
};

const EMPTY_MODEL: DesignInspectorModel = {
	verification: "observed",
	modelVersion: 2,
	title: "",
	essence: "",
	theme: "unknown",
	overview: "",
	colors: [],
	typography: [],
	typefaces: [],
	spacing: [],
	radii: [],
	elevation: [],
	surfaces: [],
	components: [],
	baseUnitPx: Number.NaN,
	dos: [],
	donts: [],
	limitations: [],
};

function renderInspector(
	model: DesignInspectorModel = MODEL,
	sourceUrl = "https://acme.example/",
) {
	return render(
		<DesignSystemInspector
			siteName="Acme"
			sourceUrl={sourceUrl}
			model={model}
		/>,
	);
}

describe("DesignSystemInspector", () => {
	it("renders site identity once with a canonical external source link", () => {
		renderInspector();
		expect(screen.getByRole("heading", { name: "Acme" })).toBeDefined();
		expect(screen.queryByText("acme.example", { exact: true })).toBeNull();
		const sourceLink = screen.getByRole("link", {
			name: "https://acme.example/",
		});
		expect(sourceLink.getAttribute("href")).toBe("https://acme.example/");
		expect(sourceLink.getAttribute("target")).toBe("_blank");
		expect(sourceLink.getAttribute("rel")).toBe("noreferrer noopener");
		expect(
			screen.getAllByText("https://acme.example/", { exact: true }),
		).toHaveLength(1);
		expect(
			screen.getByText("A crisp ledger console under morning light."),
		).toBeDefined();
	});

	it("does not link a source URL outside the HTTP protocols", () => {
		renderInspector(MODEL, "javascript:alert(1)");
		expect(screen.queryByRole("link")).toBeNull();
		expect(screen.getByText("javascript:alert(1)")).toBeDefined();
	});

	it("states the verification source instead of implying unverified data is measured", () => {
		const { rerender } = renderInspector();
		expect(
			screen.getByText(
				/analisis berdasarkan tampilan website yang berhasil diperiksa/i,
			),
		).toBeDefined();
		rerender(
			<DesignSystemInspector
				siteName="Acme"
				sourceUrl="https://acme.example/"
				model={{ ...MODEL, verification: "unverified" }}
			/>,
		);
		expect(screen.getByText(/belum terverifikasi/i)).toBeDefined();
	});

	it("renders the palette with values, roles and the evidence behind each role", () => {
		renderInspector();
		expect(screen.getByRole("heading", { name: /palet warna/i })).toBeDefined();
		expect(screen.getByText("#155eef")).toBeDefined();
		expect(screen.getByText("Primary action")).toBeDefined();
		expect(
			screen.getByText(/painted the background of 2 measured action elements/i),
		).toBeDefined();
	});

	it("renders the type scale with size, weight and line-height metadata", () => {
		renderInspector();
		expect(screen.getByRole("heading", { name: /type scale/i })).toBeDefined();
		expect(screen.getByText("Display")).toBeDefined();
		expect(screen.getByText("48px · w700 · lh 1.1 · ls -2px")).toBeDefined();
	});

	it("renders a display specimen at its measured size instead of flattening it", () => {
		renderInspector();
		const specimens = screen.getAllByText("Pricing that scales with your team");
		// The type scale row carries the measured size and weight; the typeface
		// card carries the family. Both show the real page sample.
		const scaleSpecimen = specimens.find(
			(node) => (node as HTMLElement).style.fontWeight === "700",
		);
		expect(scaleSpecimen).toBeDefined();
		expect((scaleSpecimen as HTMLElement).style.fontSize).toBe("48px");
		const bodySpecimen = screen.getByText(
			"Start free and upgrade when the team is ready.",
		);
		expect(bodySpecimen.style.fontSize).toBe("16px");
	});

	it("states the scale reduction instead of silently shrinking a display size", () => {
		const displayEntry = MODEL.typography[0];
		if (!displayEntry) throw new Error("type scale fixture missing");
		renderInspector({
			...MODEL,
			typefaces: [],
			typography: [
				{ ...displayEntry, role: "Display", size: "96px", sizePx: 96 },
			],
		});
		const specimen = screen.getByText("Pricing that scales with your team");
		expect(specimen.style.fontSize).toBe("48px");
		expect(screen.getByText(/ukuran terukur 96px/i)).toBeDefined();
	});

	it("uses the real page sample rather than a fabricated sentence", () => {
		renderInspector();
		expect(
			screen.getAllByText("Pricing that scales with your team").length,
		).toBeGreaterThan(0);
		expect(
			screen.queryByText("The quick brown fox jumps over the lazy dog"),
		).toBeNull();
	});

	it("renders a typeface inspector with real measured metrics", () => {
		renderInspector();
		expect(
			screen.getByRole("heading", { name: /typeface inspector/i }),
		).toBeDefined();
		expect(screen.getByText("Inter")).toBeDefined();
		expect(screen.getByText("400, 700")).toBeDefined();
		expect(screen.getByText("48px, 16px")).toBeDefined();
		expect(screen.getByText("Inter, sans-serif")).toBeDefined();
		expect(screen.getByText(/font resource loaded/i)).toBeDefined();
	});

	it("warns that the preview font may not be the rendered font", () => {
		renderInspector();
		expect(screen.getByText(/tersedia di browser Anda/i)).toBeDefined();
	});

	it("renders semantic spacing and radius context", () => {
		renderInspector();
		expect(
			screen.getByRole("heading", { name: /spacing.*bentuk/i }),
		).toBeDefined();
		expect(screen.getByText("Card padding")).toBeDefined();
		expect(screen.getByText("Element gap")).toBeDefined();
		expect(screen.getByText("Buttons")).toBeDefined();
		expect(screen.getByText("Unit dasar 4px")).toBeDefined();
	});

	it("renders surfaces and measured elevation", () => {
		renderInspector();
		expect(screen.getByRole("heading", { name: /^surface$/i })).toBeDefined();
		expect(screen.getByRole("heading", { name: /elevation/i })).toBeDefined();
		expect(
			screen.getByText("rgba(16, 24, 40, 0.06) 0px 1px 3px 0px"),
		).toBeDefined();
		expect(
			screen.getByText(/repeated across 2 measured elements/i),
		).toBeDefined();
	});

	it("renders guideline rules with their evidence", () => {
		renderInspector();
		expect(screen.getByRole("heading", { name: /panduan/i })).toBeDefined();
		expect(screen.getByText("Use 8px for action buttons.")).toBeDefined();
		expect(screen.getByText("Measured on 2 elements.")).toBeDefined();
		expect(
			screen.getByText("Do not introduce a second action colour."),
		).toBeDefined();
	});

	it("states the measurement limitations instead of hiding them", () => {
		renderInspector();
		expect(
			screen.getByRole("heading", { name: /keterbatasan pengukuran/i }),
		).toBeDefined();
		expect(
			screen.getByText(/responsive states were not measured/i),
		).toBeDefined();
	});

	it("omits sections without data instead of inventing values", () => {
		const { container } = renderInspector(EMPTY_MODEL);
		expect(screen.queryByRole("heading", { name: /palet warna/i })).toBeNull();
		expect(screen.queryByRole("heading", { name: /type scale/i })).toBeNull();
		expect(
			screen.queryByRole("heading", { name: /typeface inspector/i }),
		).toBeNull();
		expect(
			screen.queryByRole("heading", { name: /spacing.*bentuk/i }),
		).toBeNull();
		expect(screen.queryByRole("heading", { name: /panduan/i })).toBeNull();
		expect(screen.queryByRole("heading", { name: /elevation/i })).toBeNull();
		expect(container.querySelectorAll('[role="img"]').length).toBe(0);
	});

	it("never renders source-document tabs", () => {
		const { container } = renderInspector();
		expect(container.textContent).not.toMatch(/tailwind v4/i);
		expect(container.textContent).not.toMatch(/css variables/i);
		expect(container.textContent).not.toMatch(/compact|extended/i);
	});
});

const BRAND_COLOR = color({
	name: "Primary 1",
	value: "#155eef",
	token: "--color-primary",
	role: "Primary action",
	roleClass: "brand",
});

const ACCENT_COLOR = color({
	name: "Accent 2",
	value: "#f5b301",
	token: "--color-accent",
	role: "Accent",
	roleClass: "accent",
});

const NEUTRAL_COLOR = color({
	name: "Surface 3",
	value: "#ffffff",
	token: "--color-surface",
	role: "Surface",
	roleClass: "neutral",
});

const SEMANTIC_COLOR = color({
	name: "Semantic 4",
	value: "#16a34a",
	token: "--color-semantic",
	role: "Semantic state",
	roleClass: "semantic",
});

const AMBIGUOUS_COLOR = color({
	name: "Unclassified 5",
	value: "#123456",
	role: "Neutral",
	roleClass: "unknown",
});

function paletteModel(colors: InspectorColorToken[]): DesignInspectorModel {
	return { ...EMPTY_MODEL, colors };
}

describe("classifyPaletteGroup", () => {
	it("uses the role class the model already derived from measured usage", () => {
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

	it("falls back to other for unclassified colors", () => {
		expect(classifyPaletteGroup(AMBIGUOUS_COLOR)).toBe("other");
		const groups = groupPaletteColors([AMBIGUOUS_COLOR]);
		expect(groups).toHaveLength(1);
		expect(groups[0]?.key).toBe("other");
		expect(groups[0]?.colors).toEqual([AMBIGUOUS_COLOR]);
	});

	it("keeps a text colour neutral even when its label says primary", () => {
		expect(
			classifyPaletteGroup(
				color({
					name: "Ink",
					value: "#0f0f0f",
					token: "--color-ink",
					role: "Base text",
					roleClass: "neutral",
				}),
			),
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
		expect(within(brand).getByText("Primary action")).toBeDefined();
		const neutral = screen.getByRole("region", { name: "Netral" });
		expect(within(neutral).getByText("Surface")).toBeDefined();
		const semantic = screen.getByRole("region", { name: "Semantik" });
		expect(within(semantic).getByText("Semantic state")).toBeDefined();
		const other = screen.getByRole("region", {
			name: "Warna lainnya",
		});
		expect(within(other).getByText("Neutral")).toBeDefined();
	});

	it("keeps the measured color value unchanged on the swatch", () => {
		renderInspector(paletteModel([BRAND_COLOR, NEUTRAL_COLOR]));
		const reference = document.createElement("div");
		for (const entry of [BRAND_COLOR, NEUTRAL_COLOR]) {
			const swatch = screen.getByRole("img", {
				name: `Swatch warna ${entry.role} ${entry.value}`,
			});
			reference.style.backgroundColor = entry.value;
			expect(swatch.style.backgroundColor).toBe(
				reference.style.backgroundColor,
			);
			expect(screen.getByText(entry.value)).toBeDefined();
		}
	});

	it("shows a brand group only when the model supports it", () => {
		const { rerender } = renderInspector(paletteModel([NEUTRAL_COLOR]));
		expect(screen.queryByRole("region", { name: "Brand" })).toBeNull();
		rerender(
			<DesignSystemInspector
				siteName="Acme"
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
			(_, index) =>
				color({
					name: `Warna ${index + 1}`,
					value: `#${(index + 1).toString(16).padStart(6, "0")}`,
					token: `--color-contoh-${index + 1}`,
					role: `Contoh peran ${index + 1}`,
					roleClass: "unknown",
				}),
		);
		const { container } = renderInspector(paletteModel(colors));
		const swatches = within(container).getAllByRole("img");
		expect(swatches).toHaveLength(colors.length);
		for (const swatch of swatches) expect(swatch.style.width).toBe("");
	});

	it("copies the exact measured value with an accessible action", async () => {
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

	it("renders an archived DESIGN.md as a grouped gallery labelled unverified", () => {
		const designMd = [
			"# Acme - Style Reference",
			"> A crisp ledger console under morning light.",
			"",
			"**Theme:** light",
			"",
			"## Tokens - Colors",
			"| Name | Value | Token | Role |",
			"| --- | --- | --- | --- |",
			"| Canvas | #ffffff | --color-canvas | Page background |",
			"| Cobalt | #155eef | --color-cobalt | Primary CTA |",
			"| Nebula | #123456 | --color-nebula | Khusus |",
		].join("\n");
		const model = parseDesignMd(designMd);
		expect(model.colors).toHaveLength(3);
		expect(model.verification).toBe("unverified");
		renderInspector(model);
		expect(screen.getByText(/belum terverifikasi/i)).toBeDefined();
		expect(screen.getByText("#155eef")).toBeDefined();
		expect(screen.getByText("#123456")).toBeDefined();
	});
});

describe("task E inspector composition", () => {
	it("does not claim capped specimens keep cross-role ratios", () => {
		const displayEntry = MODEL.typography[0];
		if (!displayEntry) throw new Error("type scale fixture missing");
		renderInspector({
			...MODEL,
			typefaces: [],
			typography: [
				{ ...displayEntry, role: "Display", size: "96px", sizePx: 96 },
			],
		});
		expect(screen.getByText(/ukuran terukur 96px/i)).toBeDefined();
		expect(screen.queryByText(/rasio antar peran tetap/i)).toBeNull();
	});

	it("treats mid-size radii as pills through the shared threshold", () => {
		renderInspector({
			...EMPTY_MODEL,
			radii: [
				{
					label: "Buttons",
					value: "150px",
					valuePx: 150,
					context: "",
					frequency: 2,
				},
			],
		});
		const preview = screen.getByRole("img", { name: "Buttons 150px" });
		expect((preview as HTMLElement).style.borderRadius).toBe("999px");
	});

	it("does not label surfaces from array position", () => {
		renderInspector({
			...MODEL,
			surfaces: [
				{ value: "#ffffff", level: 0, frequency: 3, roles: ["canvas"] },
				{ value: "#f8f8f8", level: 1, frequency: 2, roles: ["section"] },
				{ value: "#eeeeee", level: 2, frequency: 1, roles: ["card"] },
			],
		});
		expect(screen.queryByText(/kanvas ·/i)).toBeNull();
		expect(screen.queryByText(/sekunder ·/i)).toBeNull();
		expect(screen.queryByText(/komponen ·/i)).toBeNull();
		expect(screen.getByText(/level 0/i)).toBeDefined();
	});

	it("keeps surface labels outside arbitrary swatch backgrounds", () => {
		const { container } = renderInspector({
			...MODEL,
			surfaces: [
				{ value: "#ffffff", level: 0, frequency: 3, roles: ["canvas"] },
				{ value: "#f8f8f8", level: 1, frequency: 2, roles: ["section"] },
			],
		});
		const swatches = container.querySelectorAll('[style*="background-color"]');
		for (const swatch of swatches) {
			expect(swatch.textContent ?? "").not.toMatch(/#(?:[0-9a-f]{3,8})\b/i);
		}
	});

	it("shows failure feedback instead of silently dropping a copy error", async () => {
		vi.stubGlobal("navigator", {
			clipboard: {
				writeText: vi.fn(async () => {
					throw new Error("denied");
				}),
			},
		});
		renderInspector(paletteModel([BRAND_COLOR]));
		fireEvent.click(
			screen.getByRole("button", { name: `Salin warna ${BRAND_COLOR.value}` }),
		);
		expect(await screen.findByText(/gagal menyalin/i)).toBeDefined();
	});

	it("displays letter-spacing without claiming it is applied", () => {
		renderInspector();
		const specimen = screen.getByText(
			"Start free and upgrade when the team is ready.",
		);
		expect((specimen as HTMLElement).style.letterSpacing).toBe("");
		expect(screen.getByText("48px · w700 · lh 1.1 · ls -2px")).toBeDefined();
	});
});

describe("task F static readability", () => {
	it("exposes spacing and radius previews to assistive tech in any theme", () => {
		renderInspector({
			...MODEL,
			spacing: [
				{ label: "Celah", value: "16px", context: "gap", frequency: 3 },
			],
			radii: [
				{
					label: "Buttons",
					value: "8px",
					valuePx: 8,
					context: "",
					frequency: 2,
				},
			],
		});
		expect(screen.getByRole("img", { name: "Celah 16px" })).toBeDefined();
		expect(screen.getByRole("img", { name: "Buttons 8px" })).toBeDefined();
	});

	it("wraps long color tokens instead of clipping them", () => {
		const { container } = renderInspector(
			paletteModel([
				color({
					name: "Panjang",
					value: "#123456",
					token: "--color-contoh-token-yang-sangat-panjang-sekali",
					role: "Contoh peran",
					roleClass: "unknown",
				}),
			]),
		);
		expect(container.querySelector(".break-all")?.textContent).toContain(
			"--color-contoh-token-yang-sangat-panjang-sekali",
		);
	});
});

describe("task D ambiguous copy", () => {
	it("labels unclassified colors as other colors", () => {
		renderInspector(paletteModel([AMBIGUOUS_COLOR]));
		expect(screen.getByRole("region", { name: "Warna lainnya" })).toBeDefined();
		expect(
			screen.queryByRole("region", { name: "Belum terklasifikasi" }),
		).toBeNull();
	});

	it("explains observed analysis in user language", () => {
		renderInspector();
		expect(
			screen.getByText(
				/analisis berdasarkan tampilan website yang berhasil diperiksa/i,
			),
		).toBeDefined();
		expect(
			screen.queryByText(/pengukuran browser yang terverifikasi/i),
		).toBeNull();
	});
});

describe("phase 6 inspector overhaul", () => {
	it("collapses provenance into a compact disclosure instead of a long banner", () => {
		renderInspector();
		expect(
			screen.queryByText(/bukan klaim brand yang belum terbukti/i),
		).toBeNull();
		expect(screen.getByText(/tentang analisis/i)).toBeDefined();
		expect(
			screen.getByText(
				/analisis berdasarkan tampilan website yang berhasil diperiksa/i,
			),
		).toBeDefined();
	});

	it("renders spacing bars with a high-contrast fill and a zero indicator", () => {
		const { container } = renderInspector({
			...MODEL,
			spacing: [
				{ label: "Nol", value: "0px", context: "margin", frequency: 2 },
				{ label: "Celah", value: "16px", context: "gap", frequency: 3 },
			],
			radii: [],
		});
		expect(screen.getByText("0", { exact: true })).toBeDefined();
		const bar = container.querySelector(
			'[role="img"][aria-label="Celah 16px"]',
		);
		expect(bar).toBeDefined();
		expect((bar as HTMLElement).className).toMatch(/bg-snow/);
		expect(container.textContent).toMatch(/gap/);
	});

	it("renders component observations only when the model provides them", () => {
		const withComponents = renderInspector({
			...MODEL,
			components: [
				{
					name: "Navigasi",
					description: "Bar atas dengan tautan primer.",
					evidence: "Terukur pada 3 elemen.",
					frequency: 3,
				},
			],
		});
		expect(
			screen.getByRole("heading", { name: /pola komponen/i }),
		).toBeDefined();
		expect(screen.getByText("Navigasi")).toBeDefined();
		withComponents.unmount();
		renderInspector({ ...MODEL, components: [] });
		expect(
			screen.queryByRole("heading", { name: /pola komponen/i }),
		).toBeNull();
	});
});
