import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import {
	assembleCanonicalShell,
	validateCanonicalShell,
} from "../services/studio-canonical-shell";
import { enforceDesignSystemOnHtml } from "../services/studio-design-system-html";
import {
	financeBlueprint,
	travelBlueprint,
	webSaaSBlueprint,
} from "./fixtures/studio-evaluation-fixtures";

// Component-first review outcome for standalone HTML frames:
// - shadcn/ui: Radix + React + cn() helpers cannot run in a single-file document
//   without shipping a framework runtime; only its Tailwind token/class patterns
//   transfer.
// - HeroUI, Magic UI, React Bits: React/TSX components (some requiring
//   framer-motion) — same limitation.
// - Thinking Orbs: canvas/WebGL orbs need a script; Studio frames are static.
// Therefore the verified component surface stays semantic HTML + inline
// CSS/Tailwind from the shared blueprint, and the skill layer adds no generic UI
// instructions of its own. This test locks that compatibility in.
const RAW_HTML =
	'<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main data-studio-content><section data-card><h2>Ringkasan</h2><p>Data contoh</p><button data-primary>Lihat detail</button></section></main></body></html>';

describe("Standalone-HTML component compatibility (Task 02)", () => {
	for (const blueprint of [
		financeBlueprint,
		travelBlueprint,
		webSaaSBlueprint,
	]) {
		it(`keeps ${blueprint.productIdentity.platform} component guidance renderable without a framework runtime`, () => {
			const screen = blueprint.screenPlan[0]?.name ?? "Screen";
			const enforced = enforceDesignSystemOnHtml(
				RAW_HTML,
				null,
				null,
				blueprint,
			);
			const html = assembleCanonicalShell(enforced, blueprint, screen, null);

			expect(html).not.toMatch(/\bReact\b|className=|createRoot/);
			expect(html).not.toMatch(
				/@heroui|@radix-ui|framer-motion|styled-components|emotion/i,
			);

			const doc = new JSDOM(html).window.document;
			// The only executable content is Studio's deterministic Tailwind token
			// config; no component-library runtime is required to render the page.
			const scripts = [...doc.querySelectorAll("script")];
			expect(
				scripts.every((script) => script.id === "studio-tailwind-tokens"),
			).toBe(true);

			// Shared components are real semantic HTML nodes, not placeholders.
			expect(doc.querySelector("nav[data-studio-navigation]")).toBeTruthy();
			expect(doc.querySelector("[data-studio-content]")).toBeTruthy();
			expect(doc.querySelector("[data-card]")).toBeTruthy();
			expect(doc.querySelector("[data-primary]")).toBeTruthy();

			expect(
				validateCanonicalShell(html, blueprint, screen, null),
				`${blueprint.productIdentity.productName}/${screen}`,
			).toEqual([]);
		});
	}
});
