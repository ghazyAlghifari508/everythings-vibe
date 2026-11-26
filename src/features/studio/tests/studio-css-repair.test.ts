import { JSDOM } from "jsdom";
import { expect, it } from "vitest";
import { repairStudioCanonicalPositioning } from "../services/studio-css-repair";
import { validateGeneratedHtml } from "../services/studio-generated-html-validation";

it("repairs only Studio-owned chrome whose layout is normal document flow", () => {
	const source =
		'<html><head><meta name="viewport" content="width=device-width"><style id="studio-canonical-style">[data-studio-navigation]{position:sticky;bottom:0;color:red}</style></head><body><div data-studio-shell><main>Content</main><nav data-studio-navigation>Home</nav></div></body></html>';
	const repaired = repairStudioCanonicalPositioning(source);
	expect(repaired.repairCount).toBe(1);
	expect(
		validateGeneratedHtml(repaired.html, {
			blueprint: null,
			viewport: "mobile",
			expectTokens: false,
		}),
	).toEqual([]);
	const dom = new JSDOM(repaired.html);
	const navigation = dom.window.document.querySelector("nav");
	if (!navigation) throw new Error("Navigation removed during repair");
	expect(dom.window.getComputedStyle(navigation).position).toBe("static");
	expect(navigation.textContent).toBe("Home");
	dom.window.close();
});

it.each([
	".dialog{position:fixed;inset:0}",
	"[data-studio-navigation] .dialog{position:fixed}",
	"[data-studio-navigation],.dialog{position:fixed}",
])("leaves ambiguous or content positioning untouched: %s", (css) => {
	const source = `<html><head><style id="studio-canonical-style">${css}</style></head><body><div data-studio-shell><main>Content</main><nav data-studio-navigation>Home</nav><div class="dialog">Dialog</div></div></body></html>`;
	expect(repairStudioCanonicalPositioning(source)).toEqual({
		html: source,
		repairCount: 0,
	});
});

it("does not infer ownership from a navigation attribute alone", () => {
	const source =
		'<html><body><nav data-studio-navigation style="position:fixed">Home</nav></body></html>';
	expect(repairStudioCanonicalPositioning(source)).toEqual({
		html: source,
		repairCount: 0,
	});
});
