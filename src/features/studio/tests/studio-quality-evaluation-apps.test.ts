import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import {
	assembleCanonicalShell,
	validateCanonicalShell,
} from "../services/studio-canonical-shell";
import { enforceDesignSystemOnHtml } from "../services/studio-design-system-html";
import { validateGeneratedHtml } from "../services/studio-generated-html-validation";
import { inspectStudioHtml } from "../services/studio-html-diagnostics";
import {
	financeBlueprint,
	financeScreens,
	travelBlueprint,
	webSaaSBlueprint,
} from "./fixtures/studio-evaluation-fixtures";

const doc = (html: string) => new JSDOM(html).window.document;

describe("Studio Quality Evaluation - Applications (Cases A-C)", () => {
	// Case A: Mobile finance application
	describe("Case A: Mobile finance application", () => {
		it("enforces canonical navigation structure, icons, order and active state across all 4 screens", () => {
			const assembledScreens = financeScreens.map((s) => {
				const raw = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>${s.content}</body></html>`;
				const enforced = enforceDesignSystemOnHtml(
					raw,
					null,
					null,
					financeBlueprint,
				);
				return {
					name: s.name,
					html: assembleCanonicalShell(
						enforced,
						financeBlueprint,
						s.name,
						null,
					),
				};
			});

			for (const screen of assembledScreens) {
				expect(
					validateCanonicalShell(
						screen.html,
						financeBlueprint,
						screen.name,
						null,
					),
				).toEqual([]);
				expect(inspectStudioHtml(screen.html).hard).toEqual([]);
				expect(
					validateGeneratedHtml(screen.html, {
						blueprint: financeBlueprint,
						viewport: "mobile",
						expectTokens: false,
					}),
				).toEqual([]);
			}

			const navLists = assembledScreens.map((s) => {
				const d = doc(s.html);
				const links = Array.from(
					d.querySelectorAll("nav[data-studio-navigation] > a"),
				);
				return {
					destinations: links.map((l) => l.getAttribute("data-destination")),
					labels: links.map((l) =>
						l.querySelector("span")?.textContent?.trim(),
					),
					svgs: links.map((l) => l.querySelector("svg")?.outerHTML),
					active: d
						.querySelector('nav a[aria-current="page"]')
						?.getAttribute("data-destination"),
				};
			});

			const expectedOrder = ["home", "plus", "wallet", "analytics"];
			const expectedLabels = [
				"Beranda",
				"Catat Transaksi",
				"Anggaran & Target",
				"Laporan & Analitik",
			];

			for (let i = 0; i < navLists.length; i++) {
				expect(navLists[i].destinations).toEqual(expectedOrder);
				expect(navLists[i].labels).toEqual(expectedLabels);
				expect(navLists[i].svgs).toEqual(navLists[0].svgs);
			}

			expect(navLists[0].active).toBe("home");
			expect(navLists[1].active).toBe("plus");
			expect(navLists[2].active).toBe("wallet");
			expect(navLists[3].active).toBe("analytics");

			for (const screen of assembledScreens) {
				expect(screen.html).toContain("--app-font:Inter, sans-serif");
				expect(screen.html).toContain("--app-primary:#059669");
				const d = doc(screen.html);
				expect(
					d.querySelector(
						"[data-studio-status-bar], [data-status-bar], .status-bar, .system-status-bar",
					),
				).toBeNull();
			}

			const contents = assembledScreens.map((s) =>
				doc(s.html).querySelector("[data-studio-content]")?.textContent?.trim(),
			);
			expect(new Set(contents).size).toBe(4);
		});
	});

	// Case B: Mobile travel application
	describe("Case B: Mobile travel application", () => {
		it("preserves consistent booking structure and shared travel brand tokens", () => {
			const screenHtml = assembleCanonicalShell(
				'<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main data-studio-content><article data-card><h2>Labuan Bajo</h2><p>Paket 3 Hari 2 Malam</p><button data-primary>Pesan Sekarang</button></article></main></body></html>',
				travelBlueprint,
				"Eksplorasi",
				null,
			);

			expect(
				validateCanonicalShell(screenHtml, travelBlueprint, "Eksplorasi", null),
			).toEqual([]);
			const d = doc(screenHtml);

			expect(screenHtml).toContain("--app-primary:#0284c7");
			expect(screenHtml).toContain("--app-font:Poppins, sans-serif");
			expect(screenHtml).toContain("--app-radius:16px");

			expect(
				d
					.querySelector('nav a[aria-current="page"]')
					?.getAttribute("data-destination"),
			).toBe("plane");

			expect(d.querySelector("[data-studio-content]")?.textContent).toContain(
				"Labuan Bajo",
			);
			expect(d.querySelector("[data-studio-content]")?.textContent).toContain(
				"Pesan Sekarang",
			);
		});
	});

	// Case C: Web SaaS dashboard
	describe("Case C: Web SaaS dashboard", () => {
		it("enforces desktop sidebar layout, compact density, and zero fixed-width overflow", () => {
			const rawHtml =
				'<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main data-studio-content><section data-card><h2>API Throughput</h2><p>14,200 req/sec</p></section></main></body></html>';
			const enforced = enforceDesignSystemOnHtml(
				rawHtml,
				null,
				null,
				webSaaSBlueprint,
			);
			const saasHtml = assembleCanonicalShell(
				enforced,
				webSaaSBlueprint,
				"Dashboard",
				null,
			);

			expect(saasHtml).toContain(
				"grid-template-columns:minmax(160px,220px) minmax(0,1fr)",
			);
			expect(saasHtml).toContain("--app-gutter:16px");

			expect(
				validateCanonicalShell(saasHtml, webSaaSBlueprint, "Dashboard", null),
			).toEqual([]);

			const issues = validateGeneratedHtml(saasHtml, {
				blueprint: webSaaSBlueprint,
				viewport: "web",
				expectTokens: false,
			});
			expect(issues).toEqual([]);

			const d = doc(saasHtml);
			expect(
				d.querySelector("[data-studio-status-bar], .status-bar"),
			).toBeNull();
		});
	});
});
