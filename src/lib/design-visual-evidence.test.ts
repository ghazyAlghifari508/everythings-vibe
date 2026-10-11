import { chromium } from "playwright";
import { expect, it } from "vitest";
import {
	collectVisualEvidence,
	extractionFromVisualEvidence,
} from "./design-visual-evidence";

it("measures rendered styles and excludes hidden and unused declarations", async () => {
	const browser = await chromium.launch({ headless: true });
	try {
		const page = await browser.newPage();
		await page.setContent(`<style>
		.unused {color:#123456} :root {--action:rgba(90,200,40,.8)}
		body {font-family:serif} button {background:var(--action);font-size:19px}
		.hidden {display:none;color:#654321}
		</style><h1>Example</h1><button>Action</button><div class="hidden">Hidden</div>`);
		const evidence = await page.evaluate(collectVisualEvidence);
		const button = evidence.elements.find((element) => element.role === "cta");
		expect(button?.properties["background-color"]).toBe(
			"rgba(90, 200, 40, 0.8)",
		);
		expect(button?.properties["font-size"]).toBe("19px");
		expect(
			evidence.elements.some((element) =>
				Object.values(element.properties).some((value) =>
					/18, 52, 86|101, 67, 33/.test(value),
				),
			),
		).toBe(false);
		expect(evidence.fonts).toEqual([]);
		const extraction = extractionFromVisualEvidence(evidence);
		expect(extraction.colors).toContainEqual({
			role: "cta-background",
			value: "rgba(90, 200, 40, 0.8)",
		});
		expect(
			extraction.typographyRoles?.find((role) => role.role === "cta")?.size,
		).toBe("19px");
		expect(
			evidence.elements.every(
				(element) =>
					element.selector.length > 0 &&
					element.width > 0 &&
					element.height > 0,
			),
		).toBe(true);
	} finally {
		await browser.close();
	}
});
