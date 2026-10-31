// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { collectVisualEvidence } from "@/features/scrape/services/design-visual-evidence";
import { visualEvidenceSchema } from "@/features/scrape/types/design-evidence-contract";
import { groupTypeSpecimens } from "@/features/scrape/utils/design-normalize-typography";

const innerTextDescriptor = Object.getOwnPropertyDescriptor(
	HTMLElement.prototype,
	"innerText",
);

afterEach(() => {
	vi.restoreAllMocks();
	if (innerTextDescriptor)
		Object.defineProperty(
			HTMLElement.prototype,
			"innerText",
			innerTextDescriptor,
		);
	else Reflect.deleteProperty(HTMLElement.prototype, "innerText");
	document.body.innerHTML = "";
});

it("uses direct text for typography while preserving descendant text for identity", () => {
	document.body.innerHTML =
		"<section><p>Alpha <strong>Beta</strong></p></section>";
	Object.defineProperty(document, "fonts", { configurable: true, value: [] });
	const style = document.createElement("div").style;
	style.visibility = "visible";
	style.opacity = "1";
	style.fontFamily = "Example";
	style.fontSize = "16px";
	vi.spyOn(window, "getComputedStyle").mockReturnValue(style);
	vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
		new DOMRect(0, 0, 100, 44),
	);
	Object.defineProperty(HTMLElement.prototype, "innerText", {
		configurable: true,
		get() {
			return this.textContent;
		},
	});
	const evidence = collectVisualEvidence();
	const section = evidence.elements.find((item) => item.role === "section");
	const paragraph = evidence.elements.find((item) => item.role === "body");
	expect(section?.text).toBe("Alpha Beta");
	expect(section?.directText).toBe("");
	expect(paragraph?.directText).toBe("Alpha ");
	expect(visualEvidenceSchema.safeParse(evidence).success).toBe(true);
	const specimens = groupTypeSpecimens(evidence.elements, true);
	expect(specimens[0]?.frequency).toBe(2);
	expect(specimens[0]?.selectors).not.toContain(section?.selector);
});

it("accepts legacy evidence with no direct text field", () => {
	const legacy = {
		selector: "p",
		role: "body",
		text: "Sample",
		width: 1,
		height: 1,
		properties: { "font-family": "Example", "font-size": "16px" },
	};
	expect(groupTypeSpecimens([legacy])[0]?.sample).toBe("Sample");
});
