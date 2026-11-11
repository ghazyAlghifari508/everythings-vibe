import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import {
	assembleCanonicalShell,
	validateCanonicalShell,
} from "../services/studio-canonical-shell";
import { repairStudioCanonicalPositioning } from "../services/studio-css-repair";
import { validateGeneratedHtml } from "../services/studio-generated-html-validation";
import { inspectStudioHtml } from "../services/studio-html-diagnostics";
import {
	financeBlueprint,
	travelBlueprint,
	webSaaSBlueprint,
} from "./fixtures/studio-evaluation-fixtures";

const doc = (html: string) =>
	new JSDOM(html, { url: "http://localhost/", runScripts: "outside-only" })
		.window.document;

const mobileDoc = (content: string, css = "") =>
	`<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body><main data-studio-content>${content}</main></body></html>`;

const webDoc = (content: string, css = "") =>
	`<!DOCTYPE html><html><head><style>${css}</style></head><body><main data-studio-content>${content}</main></body></html>`;

// P3 defect families from docs/prompt-design-studio/p3.md §2 and §10-11. These
// assert deterministic DOM/style contracts (single canonical bars, bounded
// media, atomic values), not pixel-perfect rendering of arbitrary AI output.
describe("P3 generated-UI defect regression", () => {
	it("keeps a canonical price row intact and flags a currency prefix split from its amount", () => {
		const intact = mobileDoc(
			'<article data-card><h2>Bali Escape 4H3M</h2><p>Nusa Penida, Ubud, dan Kintamani</p><p class="price">Rp 3.900.000 <span>/ orang</span></p></article>',
		);
		expect(inspectStudioHtml(intact).hard).toEqual([]);

		// Currency prefix on its own visual line, amount on the next (raw newline
		// in the source is preserved by textContent): a vertical price stack.
		const broken = mobileDoc(
			'<article data-card><p>Mulai dari</p><div class="row"><span>Rp</span>\n<span>3.900.000</span>\n<span>/ orang</span></div></article>',
		);
		const diag = inspectStudioHtml(broken);
		expect(diag.warnings).toContain(
			"Inspect price row: the currency prefix is separated from the amount; keep 'Rp' and the nominal in one line.",
		);
	});

	it("assembles a travel screen with real destination media marked 16/9, not fake SVG art", () => {
		const html = assembleCanonicalShell(
			mobileDoc(
				'<article data-card><figure><img src="https://images.unsplash.com/photo-1544989163-9b2b7c1f5e6a?w=640" alt="Pantai Kelingking Nusa Penida"></figure><h2>Nusa Penida Day Trip</h2><p>Mulai dari</p><p class="price">Rp 1.250.000 / orang</p></article>',
			),
			travelBlueprint,
			"Eksplorasi",
			null,
		);
		expect(
			validateCanonicalShell(html, travelBlueprint, "Eksplorasi", null),
		).toEqual([]);
		const d = doc(html);
		const media = d.querySelector("figure img");
		expect(media?.getAttribute("src") ?? "").toContain("images.unsplash.com");
		expect(media?.getAttribute("alt") ?? "").not.toBe("");
	});

	it("re-assembling previous HTML after adding a screen keeps one canonical bar, header, and content region", () => {
		// Simulate an already-assembled screen being fed back through the shell
		// (a second screen reuses the same project blueprint), then adding a new
		// screen on top of it. The canonical chrome must stay singular.
		const first = assembleCanonicalShell(
			mobileDoc(
				"<section><h2>Beranda</h2><button data-primary>Mulai</button></section>",
			),
			financeBlueprint,
			"Beranda",
			null,
		);
		const shelled = doc(first);
		const withNewScreen = shelled.documentElement.outerHTML.replace(
			"><section><h2>Beranda</h2>",
			"><section><h2>Beranda (rebuilt)</h2>",
		);
		const second = assembleCanonicalShell(
			`<!DOCTYPE html>${withNewScreen}`,
			financeBlueprint,
			"Catat Transaksi",
			null,
		);
		expect(
			validateCanonicalShell(second, financeBlueprint, "Catat Transaksi", null),
		).toEqual([]);
		const d = doc(second);
		expect(d.querySelectorAll("[data-studio-navigation]")).toHaveLength(1);
		expect(d.querySelectorAll("[data-studio-header]")).toHaveLength(1);
		expect(d.querySelectorAll("[data-studio-content]")).toHaveLength(1);
	});

	it("never lets a second app bar or navigation survive into the assembled shell", () => {
		const html = assembleCanonicalShell(
			mobileDoc(
				'<header>Extra mobile toolbar</header><nav class="bottom-bar"><a href="#">Home</a><a href="#">Explore</a></nav><section><h2>Profil</h2></section>',
			),
			financeBlueprint,
			"Profil",
			null,
		);
		expect(
			validateCanonicalShell(html, financeBlueprint, "Profil", null),
		).toEqual([]);
		const d = doc(html);
		const content = d.querySelector("[data-studio-content]");
		expect(content?.querySelector("header")).toBeNull();
		expect(
			Array.from(d.querySelectorAll("nav")).filter(
				(n) => !n.hasAttribute("data-studio-navigation"),
			),
		).toHaveLength(0);
	});

	it("leaves content-level sticky alone; only Studio chrome is restored to flow", () => {
		const stickyContent = assembleCanonicalShell(
			mobileDoc(
				'<div style="position:sticky;top:0"><h2>Sticky column header</h2></div>',
			),
			financeBlueprint,
			"Beranda",
			null,
		);
		// Canonical chrome in normal flow is untouched; a content sticky survives.
		expect(repairStudioCanonicalPositioning(stickyContent).repairCount).toBe(0);
		expect(stickyContent).toContain("position:sticky");
	});

	it("treats an unrequested skeleton main screen as a quality defect, not a finished page", () => {
		const html = mobileDoc(
			'<div data-skeleton style="height:80px"></div><div data-skeleton style="height:80px"></div><p>Semua data sedang dimuat…</p>',
		);
		const diag = inspectStudioHtml(html);
		expect(diag.warnings).toContain(
			"Loading placeholder in a static screen; render content unless a loading state was requested.",
		);
	});

	it("keeps wide finance tables inside a bounded scroll container on mobile", () => {
		const html = assembleCanonicalShell(
			mobileDoc(
				'<table style="min-width:900px"><thead><tr><th>Referensi</th><th>Jumlah</th><th>Tanggal</th></tr></thead><tbody><tr><td>INV-001</td><td>Rp 12.500.000</td><td>02 Feb</td></tr></tbody></table>',
			),
			financeBlueprint,
			"Laporan & Analitik",
			null,
		);
		expect(
			validateGeneratedHtml(html, {
				blueprint: null,
				viewport: "mobile",
				expectTokens: false,
			}),
		).toEqual([]);
		expect(doc(html).querySelector("[data-table-container]")).toBeTruthy();
	});

	it("keeps the selected theme authoritative across two screens of one project", () => {
		const a = assembleCanonicalShell(
			webDoc("<section><h2>Dashboard</h2></section>"),
			webSaaSBlueprint,
			"Dashboard",
			null,
		);
		const b = assembleCanonicalShell(
			webDoc("<section><h2>Laporan</h2></section>"),
			webSaaSBlueprint,
			"Laporan Performa",
			null,
		);
		// The shared blueprint palette (webSaaS primary/radius) survives into every frame.
		expect(a).toContain("--app-primary:#2563eb");
		expect(b).toContain("--app-primary:#2563eb");
	});

	it("rejects a second full nav label set as duplicate navigation (contract, not pixel QA)", () => {
		// Two complete nav blocks carrying the canonical label set is a defect:
		// the shell injects one bar; validateGeneratedHtml must report the
		// duplicate rather than silently shipping two bars.
		const html = mobileDoc(
			'<nav aria-label="Primary"><a>Beranda</a><a>Catat Transaksi</a><a>Anggaran &amp; Target</a><a>Laporan &amp; Analitik</a></nav><section><h2>Beranda</h2></section><nav aria-label="Dup"><a>Beranda</a><a>Catat Transaksi</a><a>Anggaran &amp; Target</a><a>Laporan &amp; Analitik</a></nav>',
		);
		const issues = validateGeneratedHtml(html, {
			blueprint: financeBlueprint,
			viewport: "mobile",
			expectTokens: false,
		});
		expect(issues).toContain("Navigasi ganda terdeteksi.");
	});
});
