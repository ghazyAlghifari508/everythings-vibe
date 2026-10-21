// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { collectVisualEvidence } from "@/features/scrape/services/design-visual-evidence";
import { DESIGN_EVIDENCE_LIMITS } from "@/features/scrape/types/design-evidence-contract";

beforeEach(() => {
	Object.defineProperty(document, "fonts", { configurable: true, value: [] });
	const measuredStyle = document.createElement("div").style;
	measuredStyle.visibility = "visible";
	measuredStyle.opacity = "1";
	vi.spyOn(window, "getComputedStyle").mockReturnValue(measuredStyle);
	vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
		new DOMRect(0, 0, 100, 44),
	);
});

afterEach(() => {
	vi.restoreAllMocks();
	document.body.innerHTML = "";
});

it.each([
	"input",
	"select",
	"textarea",
])("preserves the input role for native %s controls, including inside navigation", (tag) => {
	document.body.innerHTML = `<${tag}></${tag}><nav><${tag}></${tag}></nav>`;
	const evidence = collectVisualEvidence();
	const controls = evidence.elements.filter((element) =>
		document.querySelector(element.selector)?.matches(tag),
	);
	expect(controls.map((element) => element.role)).toEqual(["input", "input"]);
});

it("keeps native controls ahead of generic elements when the capture budget is exhausted", () => {
	document.body.innerHTML = `${"<div>Sample</div>".repeat(10)}<input><select></select><textarea></textarea>`;
	const evidence = collectVisualEvidence({
		...DESIGN_EVIDENCE_LIMITS,
		elements: 4,
	});
	expect(evidence.elements).toHaveLength(4);
	expect(
		evidence.elements
			.filter((element) =>
				document
					.querySelector(element.selector)
					?.matches("input, select, textarea"),
			)
			.map((element) => document.querySelector(element.selector)?.tagName),
	).toEqual(["INPUT", "SELECT", "TEXTAREA"]);
});

it("does not preserve hidden native controls as visible evidence", () => {
	document.body.innerHTML =
		'<input hidden><div inert><select></select></div><div aria-hidden="true"><textarea></textarea></div>';
	const evidence = collectVisualEvidence();
	expect(
		evidence.elements.filter((element) =>
			document
				.querySelector(element.selector)
				?.matches("input, select, textarea"),
		),
	).toEqual([]);
});

it("does not infer card roles from generic element styles or class names", () => {
	document.body.innerHTML =
		'<div class="card rounded-panel" style="border-radius:12px;border:1px solid;box-shadow:0 1px 2px">Sample</div>';
	const style = getComputedStyle(document.body);
	style.borderRadius = "12px";
	style.border = "1px solid";
	style.boxShadow = "0 1px 2px";
	const evidence = collectVisualEvidence();
	expect(
		evidence.elements
			.filter((element) =>
				document.querySelector(element.selector)?.matches("div"),
			)
			.map((element) => element.role),
	).toEqual(["element"]);
});
