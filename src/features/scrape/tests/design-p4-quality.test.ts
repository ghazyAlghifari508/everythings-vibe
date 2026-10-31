import { describe, expect, it } from "vitest";
import { FIXTURE } from "@/lib/design-fixture";
import { buildDesignModel } from "../services/design-model";
import type {
	VisualElementEvidence,
	VisualEvidence,
} from "../services/design-visual-evidence";
import { renderDesignMd, validateDesignMd } from "../utils/design-md-render";
import {
	classifyTypeRole,
	groupTypeSpecimens,
} from "../utils/design-normalize-typography";

function text(
	fontSize: string,
	role = "body",
	extra: Record<string, string> = {},
): VisualElementEvidence {
	return {
		selector: `${role}-${fontSize}`,
		role,
		text: "Sample text",
		width: 200,
		height: 40,
		properties: {
			"font-family": "Inter, sans-serif",
			"font-size": fontSize,
			"font-weight": "400",
			"line-height": "24px",
			"letter-spacing": "normal",
			...extra,
		},
	};
}

describe("p4 §4 outlier typography never becomes a guideline token", () => {
	it("excludes a non-positive icon size while reporting it as excluded", () => {
		const model = buildDesignModel({
			...FIXTURE,
			elements: [
				...FIXTURE.elements,
				text("0px", "element", { "font-family": "Icons, sans-serif" }),
			],
		});
		expect(model.typography.some((entry) => entry.fontSize === "0px")).toBe(
			false,
		);
		expect(
			model.limitations.some((note) =>
				note.includes("non-positive computed font size"),
			),
		).toBe(true);
	});

	it("classifies an 88px statistic as Display, never as Body large", () => {
		expect(classifyTypeRole(88, ["element"], "Inter, sans-serif")).toBe(
			"Display",
		);
		const specimens = groupTypeSpecimens([text("88px"), text("16px")]);
		expect(specimens.some((entry) => entry.role === "Body large")).toBe(false);
		expect(specimens.find((entry) => entry.fontSize === "88px")?.role).toBe(
			"Display",
		);
	});
});

function view(
	elements: VisualElementEvidence[],
	extra: Partial<VisualEvidence> = {},
): VisualEvidence {
	return {
		version: 1,
		sourceUrl: "https://example.test",
		capturedAt: "2026-01-01T00:00:00Z",
		viewport: { width: 1440, height: 900 },
		elements,
		fonts: [],
		limitations: [],
		...extra,
	};
}

describe("p4 §2/§8 multi-capture normalization keeps shared facts once", () => {
	it("declares identical tokens once and scopes only real differences", () => {
		const desktop = view(FIXTURE.elements, { colorScheme: "light" });
		const mobile = view(structuredClone(FIXTURE.elements), {
			viewport: { width: 390, height: 844 },
			colorScheme: "light",
		});
		const model = buildDesignModel({
			...desktop,
			additionalViews: [mobile],
		});
		const document = renderDesignMd(model, { enrichmentUnavailable: true });
		expect(validateDesignMd(document)).toEqual([]);
		expect(document.match(/## Theme & Overview/g)).toHaveLength(1);
		expect(document).not.toContain("--radius-measured-radius-2");
	});

	it("aggregates the same limitation across captures instead of repeating it", () => {
		const desktop = view(FIXTURE.elements, { colorScheme: "dark" });
		const mobile = view(structuredClone(FIXTURE.elements), {
			viewport: { width: 390, height: 844 },
			colorScheme: "dark",
		});
		const document = renderDesignMd(
			buildDesignModel({ ...desktop, additionalViews: [mobile] }),
			{
				enrichmentUnavailable: true,
			},
		);
		const section =
			document.split("## Limitations & Confidence Notes")[1]?.split("## ")[0] ??
			"";
		expect(
			section.match(/requested but the measured canvas rendered/g),
		).toHaveLength(1);
	});
});
