// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
	DESIGN_DETAILED_EVIDENCE_LIMITS,
	DESIGN_EVIDENCE_LIMITS,
	visualEvidenceSchema,
} from "./design-evidence-contract";
import { collectVisualEvidence } from "./design-visual-evidence";

afterEach(() => {
	vi.restoreAllMocks();
	document.body.innerHTML = "";
});

it("detailed sampling observes elements beyond the standard cap without exceeding its own bound", () => {
	document.body.innerHTML =
		`<section>${"<button>Sample action</button>".repeat(30)}</section>`.repeat(
			20,
		);
	Object.defineProperty(document, "fonts", { configurable: true, value: [] });
	const measuredStyle = document.createElement("div").style;
	measuredStyle.visibility = "visible";
	measuredStyle.opacity = "1";
	vi.spyOn(window, "getComputedStyle").mockReturnValue(measuredStyle);
	vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
		new DOMRect(0, 0, 100, 44),
	);
	const standard = collectVisualEvidence(DESIGN_EVIDENCE_LIMITS);
	const detailed = collectVisualEvidence(DESIGN_DETAILED_EVIDENCE_LIMITS);
	expect(standard.elements).toHaveLength(250);
	expect(detailed.elements).toHaveLength(500);
	expect(visualEvidenceSchema.safeParse(detailed).success).toBe(true);
});
