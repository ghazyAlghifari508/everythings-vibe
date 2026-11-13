import { describe, expect, it } from "vitest";
import { FIXTURE } from "@/lib/design-fixture";
import { buildDesignModel } from "../services/design-model";
import type { VisualEvidence } from "../services/design-visual-evidence";
import { designSettingsSchema } from "../types/scrape-contract";
import {
	type RenderDesignMdOptions,
	renderDesignMd,
	validateDesignMd,
} from "../utils/design-md-render";

// p2 §9: fixture-based coverage for DESIGN.md accuracy. Every case asserts a
// deterministic document invariant (identity, scope, dedup, status, syntax),
// never prose quality.

function designSettings(overrides: Record<string, string> = {}) {
	return designSettingsSchema.parse({
		viewport: "both",
		theme: "both",
		depth: "detailed",
		focus: "complete",
		codeReference: "both",
		...overrides,
	});
}

function capture(
	width: number,
	colorScheme: "light" | "dark",
	adjust?: (view: VisualEvidence) => void,
	overrides: Record<string, string> = {},
): VisualEvidence {
	const view: VisualEvidence = {
		...structuredClone(FIXTURE),
		viewport: { width, height: width >= 1024 ? 900 : 844 },
		colorScheme,
		settings: designSettings(overrides),
	};
	adjust?.(view);
	return view;
}

function documentFor(
	views: VisualEvidence[],
	options: RenderDesignMdOptions = {},
): string {
	const [first, ...rest] = views;
	if (!first) throw new Error("A document needs at least one capture.");
	return renderDesignMd(
		buildDesignModel({ ...first, additionalViews: rest }),
		options,
	);
}

function cssBlocks(document: string): string[] {
	return [...document.matchAll(/```css\n([\s\S]*?)```/g)].map(
		(match) => match[1] ?? "",
	);
}

function rootBlock(document: string): string {
	return cssBlocks(document).find((block) => block.includes(":root")) ?? "";
}

function ruleSection(document: string): string {
	return document.split("## Do's & Don'ts")[1]?.split("\n## ")[0] ?? "";
}

function addAccent(view: VisualEvidence, value: string): void {
	view.elements.push({
		selector: "body > div.measured-accent",
		role: "element",
		text: "Accent",
		width: 300,
		height: 40,
		properties: { "background-color": value },
	});
}

describe("p2 capture confidence", () => {
	it("treats desktop light and mobile light as two verified contexts of one document", () => {
		const document = documentFor([
			capture(1440, "light"),
			capture(390, "light"),
		]);
		expect(validateDesignMd(document)).toEqual([]);
		expect(document).toContain(
			"**Verified contexts:** Desktop 1440x900 (light); Mobile 390x844 (light).",
		);
		expect(document.match(/## Overview & Capture Confidence/g)).toHaveLength(1);
		expect(document).not.toMatch(/prefers-color-scheme:\s*dark/);
	});

	it("separates a requested dark preference from the observed appearance", () => {
		const document = documentFor(
			[capture(1440, "light"), capture(1440, "dark")],
			{ enrichmentUnavailable: true },
		);
		expect(document).toMatch(/\| 2 \| 1440x900 \| dark \| light \| no \|/);
		expect(document).toContain("no dark tokens are defined");
		expect(document).toMatch(
			/\*\*Analysis status:\*\*.*measurement-only document/,
		);
		expect(document).not.toMatch(/@media[^{]*prefers-color-scheme/);
	});

	it("reports analysis status honestly when synthesis is unavailable and when it is applied", () => {
		const fallback = documentFor([capture(1440, "light")], {
			enrichmentUnavailable: true,
		});
		expect(fallback).toMatch(/AI synthesis unavailable/);
		expect(fallback).toContain(
			"The AI synthesis step did not produce a narrative",
		);
		expect(fallback).toContain("### Colors & Semantic Roles");
		expect(fallback).toContain("### Typography Scale");
		expect(fallback).toContain("## Coverage & Important Limitations");

		const applied = documentFor([capture(1440, "light")], {
			identityNarrative: "A quiet ledger console.",
		});
		expect(applied).toMatch(/AI synthesis applied/);
		expect(applied).toContain("## Visual Identity");
		expect(applied).not.toContain(
			"AI synthesis is unavailable or did not run.",
		);
	});
});

describe("p2 token identity", () => {
	it("declares a token every capture measured exactly once", () => {
		const document = documentFor([
			capture(1440, "light"),
			capture(390, "light"),
		]);
		const names = [
			...(rootBlock(document).matchAll(/^\s*(--[\w-]+)\s*:/gm) ?? []),
		].map((match) => match[1] ?? "");
		expect(names.length).toBeGreaterThan(0);
		expect(new Set(names).size).toBe(names.length);
		// Nothing differs between the captures, so no scoped override may exist.
		expect(document).not.toContain("@media");
	});

	it("scopes a real viewport difference under the same token identity", () => {
		const mobile = capture(390, "light", (view) => {
			for (const element of view.elements)
				if (element.role === "cta")
					element.properties["border-radius"] = "16px";
		});
		const document = documentFor([capture(1440, "light"), mobile]);
		const scoped = document.slice(document.indexOf("@media"));
		expect(scoped).toContain("@media (max-width: 390px)");
		expect(scoped).toContain("--radius-buttons: 16px;");
		expect(rootBlock(document)).toContain("--radius-buttons: 8px;");
	});

	it("keeps two roles on one measured value as two tokens", () => {
		const base = buildDesignModel(capture(1440, "light"));
		const [sample] = base.colors;
		if (!sample) throw new Error("Fixture needs a colour");
		const shared = {
			...sample,
			value: "#097fe8",
			confidence: "inferred" as const,
			roleClass: "brand" as const,
			userAgentDefault: false,
		};
		const document = renderDesignMd({
			...base,
			colors: [
				{ ...shared, name: "Brand accent", role: "Brand accent" },
				{ ...shared, name: "Primary action", role: "Primary action" },
			],
		});
		const root = rootBlock(document);
		expect(root).toContain("--color-brand-accent: #097fe8;");
		expect(root).toContain("--color-primary-action: #097fe8;");
	});

	it("never reuses one numeric alias for two different measured colours", () => {
		const desktop = capture(1440, "light", (view) =>
			addAccent(view, "rgba(20, 30, 40, 0.898)"),
		);
		const mobile = capture(390, "light", (view) => addAccent(view, "#ffdec4"));
		const document = documentFor([desktop, mobile]);
		expect(document).not.toMatch(/--color-measured-1\b/);
		const measured = [
			...(rootBlock(document).matchAll(
				/(--color-measured-[\w-]+)\s*:\s*([^;]+);/g,
			) ?? []),
		];
		expect(measured.length).toBeGreaterThan(0);
		for (const [, name, value] of measured) {
			const slug = (value ?? "")
				.trim()
				.replace(/[^a-z0-9]+/gi, "-")
				.toLowerCase()
				.replace(/^-+|-+$/g, "");
			expect(name).toBe(`--color-measured-${slug}`);
		}
		// The mobile-only value stays in the document as capture evidence.
		expect(document).toContain("#ffdec4");
	});

	it("groups two equivalent CSS colour representations into one identity", () => {
		const desktop = capture(1440, "light", (view) => {
			for (const element of view.elements)
				if (element.role === "cta")
					element.properties["background-color"] = "#0044cc";
		});
		const mobile = capture(390, "light", (view) => {
			for (const element of view.elements)
				if (element.role === "cta")
					element.properties["background-color"] = "rgb(0, 68, 204)";
		});
		const document = documentFor([desktop, mobile]);
		expect(rootBlock(document)).toContain("--color-action-accent: #0044cc;");
		// One declaration per output block: an equal-valued capture adds no override.
		const values = [
			...document.matchAll(/--color-action-accent:\s*([^;]+);/g),
		].map((match) => (match[1] ?? "").trim());
		expect(values).toEqual(["#0044cc", "#0044cc"]);
	});
});

describe("p2 deduplication", () => {
	it("keeps one representative variant per measured treatment", () => {
		const twoTreatments = (radius: string) => (view: VisualEvidence) => {
			const ctas = view.elements.filter((element) => element.role === "cta");
			if (ctas[1]) ctas[1].properties["border-radius"] = radius;
		};
		const desktop = capture(1440, "light", twoTreatments("24px"));
		const mobile = capture(390, "light", twoTreatments("16px"));
		const document = documentFor([desktop, mobile]);
		const section =
			document.split("## Component Specifications")[1]?.split("\n## ")[0] ?? "";
		expect(section).toContain("**Variants**");
		// The identical treatment is one variant with pooled samples, while two
		// different treatments sharing a positional label are told apart by the
		// characteristic that differs instead of by a capture suffix.
		expect(section).toContain(
			"**Variant 1** (2 measured samples): Corner radius: 8px",
		);
		expect(section).toContain(
			"**Variant 2 (Corner radius 24px (pill))** (1 measured sample)",
		);
		expect(section).toContain(
			"**Variant 2 (Corner radius 16px)** (1 measured sample)",
		);
		expect(section).not.toMatch(/nth-child/);
	});

	it("states a rule shared by every capture once instead of once per capture", () => {
		const document = documentFor([
			capture(1440, "light"),
			capture(1440, "dark"),
			capture(390, "light"),
			capture(390, "dark"),
		]);
		const rules = ruleSection(document);
		expect(
			rules.match(/Use 8px only for matching action buttons/g) ?? [],
		).toHaveLength(1);
		expect(rules).toContain("Measured in all 4 captured contexts.");
		const ruleLines = rules
			.split("\n")
			.filter((line) => line.startsWith("- "))
			.map((line) => line.split(" _(evidence")[0]);
		expect(new Set(ruleLines).size).toBe(ruleLines.length);
	});

	it("attributes a rule that only some captures support to those captures", () => {
		const document = documentFor([
			capture(1440, "light"),
			capture(1440, "dark"),
			capture(390, "light"),
			capture(390, "dark"),
		]);
		expect(ruleSection(document)).toContain(
			"Measured in: Capture 2: 1440x900, browser preference dark; Capture 4: 390x844, browser preference dark.",
		);
	});

	it("keeps a canvas value out of the stylesheet while keeping it as evidence", () => {
		const view = capture(1440, "light", (input) => {
			for (const element of input.elements)
				if (element.role === "canvas")
					element.properties.color = "rgb(0, 0, 0)";
		});
		const document = documentFor([view]);
		expect(document).not.toContain("--color-measured-000000");
		expect(document).toContain("Default text");
	});

	it("keeps a single-sample radius and max-width out of the global tokens", () => {
		const view = capture(1440, "light", (input) => {
			input.elements.push({
				selector: "body > div.small-box",
				role: "element",
				text: "Small",
				width: 200,
				height: 80,
				properties: { "border-radius": "3px", "max-width": "320px" },
			});
		});
		const root = rootBlock(documentFor([view]));
		expect(root).not.toContain("--radius-navigation");
		expect(root).not.toContain("--container-max-width: 320px");
	});
});

describe("p2 CSS and Tailwind output", () => {
	it("emits syntactically valid custom properties", () => {
		const mobile = capture(390, "light", (view) => {
			for (const element of view.elements)
				if (element.role === "cta")
					element.properties["border-radius"] = "16px";
		});
		const document = documentFor([capture(1440, "light"), mobile]);
		for (const block of cssBlocks(document)) {
			const trimmed = block.trim();
			expect(trimmed.startsWith(":root") || trimmed.startsWith("@theme")).toBe(
				true,
			);
			for (const line of trimmed.split("\n")) {
				const declaration = line.trim();
				if (!declaration.startsWith("--")) continue;
				expect(declaration).toMatch(/^--[a-z0-9-]+:\s[^;{}]+;$/);
			}
		}
		expect(
			validateDesignMd(document).filter(
				(issue) => issue.code === "duplicate-token",
			),
		).toEqual([]);
	});

	it("emits only the requested code reference format", () => {
		const onlyTailwind = renderDesignMd(
			buildDesignModel({
				...capture(1440, "light", undefined, { codeReference: "tailwind-v4" }),
			}),
		);
		expect(onlyTailwind).toContain("@theme {");
		expect(onlyTailwind).not.toContain(":root {");
		expect(onlyTailwind).not.toContain("### CSS Custom Properties");

		const onlyCss = renderDesignMd(
			buildDesignModel({
				...capture(1440, "light", undefined, { codeReference: "css" }),
			}),
		);
		expect(onlyCss).toContain(":root {");
		expect(onlyCss).not.toContain("@theme {");
	});

	it("keeps every valid capture context in one canonical document", () => {
		const document = documentFor([
			capture(1440, "light"),
			capture(1440, "dark"),
			capture(390, "light"),
			capture(390, "dark"),
		]);
		expect(document.match(/^# /gm) ?? []).toHaveLength(1);
		// Every capture is stated in the overview even when nothing differed, so a
		// single canonical document still carries all measured contexts.
		for (const row of [
			"| 1 | 1440x900 | light",
			"| 2 | 1440x900 | dark",
			"| 3 | 390x844 | light",
			"| 4 | 390x844 | dark",
		])
			expect(document).toContain(row);
		expect(document).toContain("This document combines 4 captures.");
	});

	it("invents neither a dark theme nor an unmeasured breakpoint", () => {
		const mobile = capture(390, "light", (view) => {
			for (const element of view.elements)
				if (element.role === "cta")
					element.properties["border-radius"] = "16px";
		});
		const document = documentFor([capture(1440, "light"), mobile]);
		expect(document).not.toMatch(/prefers-color-scheme/);
		const queries = [...document.matchAll(/@media\s+([^{]+)\{/g)].map((match) =>
			(match[1] ?? "").trim(),
		);
		expect(queries.length).toBeGreaterThan(0);
		for (const query of queries)
			expect(query).toMatch(/^\(max-width: 390px\)$/);
	});
});
