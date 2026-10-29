import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import {
	assembleCanonicalShell,
	validateCanonicalShell,
} from "../services/studio-canonical-shell";
import { enforceDesignSystemOnHtml } from "../services/studio-design-system-html";
import { validateGeneratedHtml } from "../services/studio-generated-html-validation";
import { inspectStudioHtml } from "../services/studio-html-diagnostics";
import { extractCleanHtml } from "../utils/clean-html";
import { financeBlueprint } from "./fixtures/studio-evaluation-fixtures";

const doc = (html: string) => new JSDOM(html).window.document;

const head = `<head><meta name="viewport" content="width=device-width, initial-scale=1"></head>`;

function assemble(body: string, screen = "Beranda") {
	const enforced = enforceDesignSystemOnHtml(
		`<!DOCTYPE html><html>${head}<body>${body}</body></html>`,
		null,
		null,
		financeBlueprint,
	);
	return assembleCanonicalShell(enforced, financeBlueprint, screen, null);
}

function contractIssues(html: string) {
	return validateGeneratedHtml(html, {
		blueprint: financeBlueprint,
		viewport: "mobile",
		expectTokens: false,
	});
}

describe("P1 output fixtures", () => {
	it("preserves a complete HTML document through assembly", () => {
		const assembled = assemble(
			"<main data-studio-content><section data-card><h2>Saldo Kas</h2><p>Rp 12.450.000</p></section></main>",
		);
		expect(
			validateCanonicalShell(assembled, financeBlueprint, "Beranda", null),
		).toEqual([]);
		expect(inspectStudioHtml(assembled).hard).toEqual([]);
		expect(contractIssues(assembled)).toEqual([]);
		expect(
			doc(assembled).querySelector("[data-studio-content]")?.textContent,
		).toContain("Rp 12.450.000");
	});

	it("adopts a body-only content fragment into the canonical content region", () => {
		const assembled = assemble(
			"<section><h2>Anggaran</h2><p>Plafon Rp 10.000.000</p></section>",
			"Anggaran & Target",
		);
		expect(
			validateCanonicalShell(
				assembled,
				financeBlueprint,
				"Anggaran & Target",
				null,
			),
		).toEqual([]);
		expect(contractIssues(assembled)).toEqual([]);
		expect(
			doc(assembled).querySelector("[data-studio-content]")?.textContent,
		).toContain("Plafon Rp 10.000.000");
	});

	it("strips a markdown fence before assembly instead of treating it as content", () => {
		const fenced = `\`\`\`html\n<!DOCTYPE html><html>${head}<body><main data-studio-content><p>Konten bersih</p></main></body></html>\n\`\`\``;
		const cleaned = extractCleanHtml(fenced);
		expect(cleaned.startsWith("<!DOCTYPE html>")).toBe(true);
		const enforced = enforceDesignSystemOnHtml(
			cleaned,
			null,
			null,
			financeBlueprint,
		);
		const assembled = assembleCanonicalShell(
			enforced,
			financeBlueprint,
			"Beranda",
			null,
		);
		expect(contractIssues(assembled)).toEqual([]);
		expect(assembled).not.toContain("```");
		expect(
			doc(assembled).querySelector("[data-studio-content]")?.textContent,
		).toContain("Konten bersih");
	});

	it("removes independently generated duplicate headers and keeps exactly one canonical header", () => {
		const assembled = assemble(
			"<header>Header AI Pertama</header><main data-studio-content><p>Konten</p></main><header>Header AI Kedua</header>",
		);
		const document = doc(assembled);
		expect(document.querySelectorAll("header")).toHaveLength(1);
		expect(document.querySelectorAll("[data-studio-header]")).toHaveLength(1);
		expect(document.body.textContent).not.toContain("Header AI");
		expect(
			validateCanonicalShell(assembled, financeBlueprint, "Beranda", null),
		).toEqual([]);
	});

	it("rejects a document whose body has no renderable content", () => {
		expect(
			validateGeneratedHtml(
				"<!DOCTYPE html><html><head></head><body></body></html>",
				{
					blueprint: null,
					viewport: "web",
					expectTokens: false,
				},
			).some((issue) => /Body HTML kosong/i.test(issue)),
		).toBe(true);
	});

	it("keeps screen content when a CSS declaration is malformed", () => {
		const assembled = assemble(
			'<style>.card{border-radius: ;color:}</style><main data-studio-content><article class="card"><h2>Laporan</h2><p>Arus kas Rp 4.850.000</p></article></main>',
			"Laporan & Analitik",
		);
		expect(
			doc(assembled).querySelector("[data-studio-content]")?.textContent,
		).toContain("Arus kas Rp 4.850.000");
		expect(
			validateCanonicalShell(
				assembled,
				financeBlueprint,
				"Laporan & Analitik",
				null,
			),
		).toEqual([]);
	});

	it("keeps a budget dropdown labelled and inside the content region", () => {
		const assembled = assemble(
			'<main data-studio-content><div class="row"><span>Batas Pengeluaran per Kategori</span><span>6 Kategori</span></div><label for="kategori">Kategori</label><select id="kategori"><option>Operasional</option></select></main>',
			"Anggaran & Target",
		);
		expect(inspectStudioHtml(assembled).hard).toEqual([]);
		expect(contractIssues(assembled)).toEqual([]);
		const document = doc(assembled);
		expect(
			document.querySelector("[data-studio-content] select#kategori"),
		).not.toBeNull();
		expect(document.body.textContent).toContain(
			"Batas Pengeluaran per Kategori",
		);
	});

	it("keeps long currency values inside the layout without forcing fixed width", () => {
		const assembled = assemble(
			'<main data-studio-content><label for="plafon">Plafon Bulanan</label><input id="plafon" value="Rp 5.935.000"></main>',
			"Anggaran & Target",
		);
		expect(
			contractIssues(assembled).some((issue) => /lebar tetap/i.test(issue)),
		).toBe(false);
		expect(doc(assembled).querySelector("#plafon")?.getAttribute("value")).toBe(
			"Rp 5.935.000",
		);
	});

	it("uses break-word so normal prose cannot wrap character by character", () => {
		const assembled = assemble(
			"<main data-studio-content><p>Konten</p></main>",
		);
		const style =
			doc(assembled).querySelector("#studio-canonical-style")?.textContent ??
			"";
		expect(style).toContain("overflow-wrap:break-word");
		expect(style).not.toContain("overflow-wrap:anywhere");
	});
});
