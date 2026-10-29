import { describe, expect, it } from "vitest";
import { buildDesignModel } from "@/features/scrape/services/design-model";
import { buildSynthesisPayload } from "@/features/scrape/services/design-synthesis";
import {
	DESIGN_SYNTHESIS_MAX_OBSERVED_COMPONENTS,
	DESIGN_SYNTHESIS_PAYLOAD_MAX_CHARS,
} from "@/features/scrape/types/scrape-constants";
import type { VisualElementEvidence } from "../services/design-visual-evidence";

function button(selector: string, pad = 14): VisualElementEvidence {
	return {
		selector,
		role: "cta",
		text: "Start",
		width: 160,
		height: 48,
		properties: {
			"background-color": "rgb(21, 94, 239)",
			color: "rgb(255, 255, 255)",
			"font-family": "Inter, sans-serif",
			"font-size": "15px",
			"font-weight": "600",
			"line-height": "20px",
			"letter-spacing": "normal",
			padding: `${pad}px`,
			"border-radius": "8px",
		},
	};
}

function modelFor(elements: VisualElementEvidence[]) {
	return buildDesignModel({
		version: 1,
		sourceUrl: "https://example.test",
		capturedAt: "2026-01-01T00:00:00Z",
		viewport: { width: 1200, height: 800 },
		elements,
		fonts: [],
		limitations: [],
	});
}

describe("single-sample component evidence", () => {
	it("keeps a fully measured single sample as a scoped recipe", () => {
		const model = modelFor([button("body:nth-child(1) > button:nth-child(2)")]);
		const observed = model.observedComponents.find((component) =>
			component.roles.includes("cta"),
		);
		expect(observed).toBeDefined();
		const treatment = observed?.treatments?.[0];
		expect(treatment?.properties["border-radius"]).toBe("8px");
		expect(treatment?.properties.padding).toBe("14px");
		expect(
			observed?.sharedCharacteristics.map(
				(entry) => `${entry.label}: ${entry.value}`,
			),
		).toEqual(expect.arrayContaining(["Corner radius: 8px", "Padding: 14px"]));
		expect(treatment?.selectors).toContain(
			"body:nth-child(1) > button:nth-child(2)",
		);
	});

	it("does not turn a single sample into a shared rule", () => {
		const model = modelFor([button("body:nth-child(1) > button:nth-child(2)")]);
		expect(
			model.guidelines.dos.some((rule) => rule.rule.includes("action buttons")),
		).toBe(false);
	});
});

describe("synthesis payload bounds", () => {
	it("keeps the observed component payload within the provider budget", () => {
		const elements = Array.from({ length: 500 }, (_, index) =>
			button(
				`body:nth-child(1) > div:nth-child(${index + 2}) > button:nth-child(${index + 3}) > span:nth-child(${index + 4}) > a:nth-child(${index + 5})`,
			),
		);
		const model = modelFor(elements);
		const payload = buildSynthesisPayload(model);
		expect(payload.length).toBeLessThanOrEqual(
			DESIGN_SYNTHESIS_PAYLOAD_MAX_CHARS,
		);
	});

	it("reports a cut when the component list exceeds the payload bound", () => {
		const model = modelFor([button("body:nth-child(1) > button:nth-child(2)")]);
		const oversized = {
			...model,
			observedComponents: Array.from(
				{ length: DESIGN_SYNTHESIS_MAX_OBSERVED_COMPONENTS + 3 },
				(_, index) => ({
					...model.observedComponents[0],
					name: `Component ${index}`,
					description: "x".repeat(5000),
				}),
			),
		};
		const payload = buildSynthesisPayload(oversized);
		const parsed = JSON.parse(payload);
		expect(parsed.payloadTruncated).toBe(true);
		expect(payload.length).toBeLessThanOrEqual(
			DESIGN_SYNTHESIS_PAYLOAD_MAX_CHARS,
		);
	});

	it("keeps the complete raw evidence available outside the payload", () => {
		const elements = Array.from({ length: 120 }, (_, index) =>
			button(`body:nth-child(1) > button:nth-child(${index + 2})`),
		);
		const model = modelFor(elements);
		expect(
			model.measurementProvenance.radiusObservations +
				model.measurementProvenance.spacingObservations,
		).toBeGreaterThan(0);
	});
});
