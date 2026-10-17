// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { VisualEvidence } from "@/features/scrape/services/design-visual-evidence";
import { renderEvidenceDesignMd } from "@/features/scrape/services/design-visual-evidence";
import { DesignResult, resolveInspector } from "../components/design-result";

afterEach(() => {
	cleanup();
});

function capturedEvidence(): VisualEvidence {
	const element = (selector: string) => ({
		selector,
		role: "cta",
		text: "Action",
		width: 120,
		height: 44,
		properties: {
			"background-color": "rgb(10, 20, 30)",
			"border-radius": "8px",
			"font-family": "Example, serif",
			"font-size": "16px",
			"font-weight": "500",
		},
	});
	return {
		version: 1,
		sourceUrl: "https://example.test/",
		capturedAt: new Date().toISOString(),
		viewport: { width: 1440, height: 900 },
		elements: [element("button:nth-child(1)"), element("button:nth-child(2)")],
		fonts: [],
		limitations: [],
	};
}

describe("resolveInspector", () => {
	it("marks a capture-backed inspector as observed", () => {
		const evidence = capturedEvidence();
		const resolved = resolveInspector(
			evidence,
			renderEvidenceDesignMd(evidence),
		);
		expect(resolved.source).toBe("observed");
		expect(resolved.model.verification).toBe("observed");
		expect(resolved.model.colors.length).toBeGreaterThan(0);
	});

	it("falls back to the archived markdown but marks it unverified", () => {
		const resolved = resolveInspector(
			undefined,
			"# Legacy - Style Reference\n",
		);
		expect(resolved.source).toBe("unverified");
		expect(resolved.model.verification).toBe("unverified");
	});

	it("refuses evidence whose document no longer matches the capture", () => {
		const evidence = capturedEvidence();
		const document = renderEvidenceDesignMd(evidence).replace(
			"rgb(10, 20, 30)",
			"rgb(255, 0, 0)",
		);
		const resolved = resolveInspector(evidence, document);
		expect(resolved.source).toBe("unverified");
		expect(resolved.model.verification).toBe("unverified");
	});

	it("never claims observed verification without evidence", () => {
		for (const value of [null, undefined, {}, "not evidence", []]) {
			expect(resolveInspector(value, "# Doc\n").source).toBe("unverified");
		}
	});
});

describe("DesignResult verification labelling", () => {
	it("labels a capture-backed document as measured browser evidence", () => {
		const evidence = capturedEvidence();
		render(
			<DesignResult
				sourceUrl="https://example.test/"
				domain="example.test"
				designMd={renderEvidenceDesignMd(evidence)}
				visualEvidence={evidence}
			/>,
		);
		expect(
			screen.getByText(
				/analisis berdasarkan tampilan website yang berhasil diperiksa/i,
			),
		).toBeDefined();
		expect(screen.queryByText(/arsip/i)).toBeNull();
	});

	it("labels an archived document as unverified rather than measured", () => {
		render(
			<DesignResult
				sourceUrl="https://example.test/"
				domain="example.test"
				designMd="# Legacy - Style Reference\n"
			/>,
		);
		// The label appears on the inspector and on the source panel, so the
		// archived state is visible wherever the reader looks.
		expect(screen.getAllByText(/belum terverifikasi/i).length).toBeGreaterThan(
			0,
		);
		expect(
			screen.queryByText(
				/analisis berdasarkan tampilan website yang berhasil diperiksa/i,
			),
		).toBeNull();
	});

	it("still exposes the archived raw document for copy and download", () => {
		const archived = "# Legacy - Style Reference\n\n## Tokens - Colors\n";
		render(
			<DesignResult
				sourceUrl="https://example.test/"
				domain="example.test"
				designMd={archived}
			/>,
		);
		expect(
			screen.getByRole("button", { name: "Salin DESIGN.md" }),
		).toBeDefined();
		expect(
			screen.getByRole("button", { name: "Download DESIGN.md" }),
		).toBeDefined();
		expect(screen.getByText(/# Legacy - Style Reference/)).toBeDefined();
	});
});
