import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { tryStreamWithFallback } from "@/lib/services/ai-orchestrator";
import {
	assembleCanonicalShell,
	validateCanonicalShell,
} from "../services/studio-canonical-shell";
import { generateValidatedFrameHtml } from "../services/studio-frame-generation";
import { validateGeneratedHtml } from "../services/studio-generated-html-validation";
import { inspectStudioHtml } from "../services/studio-html-diagnostics";
import { buildStudioFramePrompt } from "../services/studio-screen-prompts";
import {
	financeBlueprint,
	webSaaSBlueprint,
} from "./fixtures/studio-evaluation-fixtures";

vi.mock("@/lib/services/ai-orchestrator", () => ({
	selectModels: () => ["mock-model"],
	tryStreamWithFallback: vi.fn(),
}));

afterEach(() => {
	vi.mocked(tryStreamWithFallback).mockReset();
});

const doc = (html: string): Document => new JSDOM(html).window.document;

describe("TASK 04 Quality, Responsive Layout & HTML/CSS Reliability (14 Scenarios)", () => {
	// 1. Wide transaction table
	it("1. contains wide transaction tables inside an overflow-x scroll container without clipping", () => {
		const rawHtml = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main data-studio-content>
			<section class="card" data-card>
				<h3>Riwayat Transaksi</h3>
				<table>
					<thead><tr><th>Tanggal</th><th>Pelanggan</th><th>Kategori</th><th>Metode</th><th>Nominal</th><th>Status</th><th>Aksi</th></tr></thead>
					<tbody><tr><td>2026-03-24</td><td>PT Maju Bersama</td><td>Operasional</td><td>Transfer</td><td>Rp 15.000.000</td><td>Berhasil</td><td><button aria-label="Detail">Lihat</button></td></tr></tbody>
				</table>
			</section>
		</main></body></html>`;

		const assembled = assembleCanonicalShell(
			rawHtml,
			financeBlueprint,
			"Beranda",
			null,
		);
		const document = doc(assembled);
		const table = document.querySelector("table");
		expect(table).not.toBeNull();
		const wrapper = table?.parentElement;
		expect(wrapper?.getAttribute("data-table-container")).toBe("1");
		expect(wrapper?.getAttribute("style")).toContain("overflow-x:auto");
		expect(
			document.querySelector("#studio-canonical-style")?.textContent,
		).toContain("[data-table-container]");
		expect(
			validateCanonicalShell(assembled, financeBlueprint, "Beranda", null),
		).toEqual([]);
	});

	// 2. Two-column desktop form/table
	it("2. supports balanced two-column desktop form and table composition", () => {
		const rawHtml = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main data-studio-content>
			<div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
				<div class="lg:col-span-5" data-card>
					<h3>Catat Transaksi</h3>
					<form><label for="nom">Nominal</label><input id="nom" type="text"><button type="submit" data-primary>Simpan</button></form>
				</div>
				<div class="lg:col-span-7 min-w-0" data-card>
					<h3>Daftar Transaksi</h3>
					<div data-table-container="1" class="overflow-x-auto"><table><tr><th>ID</th><th>Jumlah</th></tr><tr><td>1</td><td>Rp 10.000</td></tr></table></div>
				</div>
			</div>
		</main></body></html>`;

		const assembled = assembleCanonicalShell(
			rawHtml,
			webSaaSBlueprint,
			"Dashboard",
			null,
		);
		const document = doc(assembled);
		expect(document.querySelector(".lg\\:col-span-5")).not.toBeNull();
		expect(document.querySelector(".lg\\:col-span-7")).not.toBeNull();
		expect(
			document.querySelector("#studio-canonical-style")?.textContent,
		).toContain(".grid");
		expect(
			validateCanonicalShell(assembled, webSaaSBlueprint, "Dashboard", null),
		).toEqual([]);
	});

	// 3. Narrower viewport CSS rules
	it("3. validates responsive adaptation and enforces fluid sizing on mobile and desktop", () => {
		const prompt = buildStudioFramePrompt({
			screenName: "Dashboard",
			projectPrompt: "SaaS Metriq",
			designMode: "web",
			blueprint: webSaaSBlueprint,
			activeScreen: "Dashboard",
		});
		expect(prompt).toContain("fluid widths");
		expect(prompt).toContain("min-w-0");
		expect(prompt).toContain("two-column desktop layout");

		const validMobileHtml = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main data-studio-content><p>Konten</p></main></body></html>`;
		const issues = validateGeneratedHtml(validMobileHtml, {
			blueprint: null,
			viewport: "mobile",
			expectTokens: false,
		});
		expect(issues).toEqual([]);
	});

	// 4. Large currency values
	it("4. formats large currency values cleanly without trailing cursor artifacts or accidental wrapping", () => {
		const rawHtml = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main data-studio-content>
			<div class="card" data-card>
				<p>Saldo Kas Utama</p>
				<span class="currency font-mono whitespace-nowrap">Rp 1.450.750.000|</span>
			</div>
		</main></body></html>`;

		const assembled = assembleCanonicalShell(
			rawHtml,
			financeBlueprint,
			"Beranda",
			null,
		);
		const document = doc(assembled);
		const currency = document.querySelector(".currency");
		expect(currency?.textContent).toBe("Rp 1.450.750.000");
		expect(currency?.textContent).not.toContain("|");
	});

	// 5. Long Indonesian labels
	it("5. ensures long Indonesian labels retain accessible pairings and sufficient structure", () => {
		const rawHtml = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main data-studio-content>
			<form>
				<div class="field-group">
					<label for="sub-kategori">Sub-Kategori Rincian Pengeluaran Operasional Bulanan</label>
					<input id="sub-kategori" type="text" value="Biaya Pemeliharaan Infrastruktur Server">
				</div>
				<button type="submit" data-primary>Perbarui Data</button>
			</form>
		</main></body></html>`;

		const assembled = assembleCanonicalShell(
			rawHtml,
			financeBlueprint,
			"Beranda",
			null,
		);
		const document = doc(assembled);
		const label = document.querySelector('label[for="sub-kategori"]');
		expect(label?.textContent).toContain("Pengeluaran Operasional");
		const diag = inspectStudioHtml(assembled);
		expect(diag.hard).toEqual([]);
	});

	// 6. Long customer names
	it("6. truncates or wraps long customer names without blowing out data table bounds", () => {
		const rawHtml = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main data-studio-content>
			<div data-table-container="1" class="overflow-x-auto">
				<table>
					<tr><th>Nama Pelanggan</th><th>Nominal</th></tr>
					<tr><td><div class="truncate max-w-[180px]" title="PT Perkasa Mandiri Sejahtera Abadi Perkasa Jaya TBK">PT Perkasa Mandiri Sejahtera Abadi Perkasa Jaya TBK</div></td><td>Rp 50.000.000</td></tr>
				</table>
			</div>
		</main></body></html>`;

		const assembled = assembleCanonicalShell(
			rawHtml,
			webSaaSBlueprint,
			"Dashboard",
			null,
		);
		const document = doc(assembled);
		const customerName = document.querySelector(".truncate");
		expect(customerName?.getAttribute("title")).toContain("Perkasa Mandiri");
		const diag = inspectStudioHtml(assembled);
		expect(diag.hard).toEqual([]);
	});

	// 7. Empty table
	it("7. provides a structured empty state for data tables when zero records exist", () => {
		const rawHtml = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main data-studio-content>
			<div class="card" data-card>
				<h3>Daftar Transaksi</h3>
				<div class="empty-state text-center py-8">
					<svg width="24" height="24" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle></svg>
					<p class="font-medium text-sm">Belum ada transaksi</p>
					<p class="text-xs text-muted">Mulai dengan mencatat transaksi pertama Anda.</p>
					<button data-primary class="mt-3">Catat Transaksi</button>
				</div>
			</div>
		</main></body></html>`;

		const assembled = assembleCanonicalShell(
			rawHtml,
			financeBlueprint,
			"Beranda",
			null,
		);
		const document = doc(assembled);
		expect(document.querySelector(".empty-state")).not.toBeNull();
		const diag = inspectStudioHtml(assembled);
		expect(diag.hard).toEqual([]);
	});

	// 8. Shared shell integration
	it("8. integrates screen content into canonical shell without altering required identity and headers", () => {
		const rawHtml = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main data-studio-content>
			<h2>Statistik Utama</h2>
			<div class="card" data-card><p>Metrik performa aplikasi</p></div>
		</main></body></html>`;

		const assembled = assembleCanonicalShell(
			rawHtml,
			webSaaSBlueprint,
			"Dashboard",
			null,
		);
		const document = doc(assembled);
		expect(document.querySelectorAll("[data-studio-shell]")).toHaveLength(1);
		expect(document.querySelectorAll("[data-studio-header]")).toHaveLength(1);
		expect(
			document.querySelectorAll("nav[data-studio-navigation]"),
		).toHaveLength(1);
		expect(
			document.querySelector("[data-studio-header] strong")?.textContent,
		).toBe(webSaaSBlueprint.productIdentity.productName);
		expect(
			validateCanonicalShell(assembled, webSaaSBlueprint, "Dashboard", null),
		).toEqual([]);
	});

	// 9. No duplicate global navigation
	it("9. strips duplicate global sidebars or headers generated inside screen content", () => {
		const rawHtml = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main data-studio-content>
			<header data-studio-header>Duplicate Header</header>
			<nav data-studio-navigation>Duplicate Nav</nav>
			<p>Konten layar sebenarnya</p>
		</main></body></html>`;

		const assembled = assembleCanonicalShell(
			rawHtml,
			webSaaSBlueprint,
			"Dashboard",
			null,
		);
		const document = doc(assembled);
		expect(document.querySelectorAll("[data-studio-header]")).toHaveLength(1);
		expect(document.querySelectorAll("[data-studio-navigation]")).toHaveLength(
			1,
		);
		expect(
			document.querySelector("[data-studio-content]")?.textContent,
		).toContain("Konten layar sebenarnya");
		expect(
			validateCanonicalShell(assembled, webSaaSBlueprint, "Dashboard", null),
		).toEqual([]);
	});

	// 10. Theme token consistency
	it("10. injects canonical CSS theme variables into canonical style sheet", () => {
		const rawHtml = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main data-studio-content><p>Konten</p></main></body></html>`;
		const assembled = assembleCanonicalShell(
			rawHtml,
			financeBlueprint,
			"Beranda",
			null,
		);
		const document = doc(assembled);
		const style =
			document.querySelector("#studio-canonical-style")?.textContent ?? "";
		expect(style).toContain(
			`--app-primary:${financeBlueprint.designTokens.primary}`,
		);
		expect(style).toContain(
			`--app-canvas:${financeBlueprint.designTokens.background}`,
		);
		expect(style).toContain(
			`--app-surface:${financeBlueprint.designTokens.surface}`,
		);
		expect(style).toContain(
			`--app-radius:${financeBlueprint.designTokens.radius}px`,
		);
	});

	// 11. Added screen reusing blueprint
	it("11. equips added screens with the full shared blueprint and quality contract", () => {
		const prompt = buildStudioFramePrompt({
			screenName: "Laporan Keuangan",
			screenDescription: "Layar rincian laporan keuangan bulanan",
			allScreens: ["Beranda", "Laporan Keuangan"],
			projectPrompt: "Aplikasi keuangan Metriq",
			designMode: "web",
			blueprint: financeBlueprint,
			activeScreen: "Laporan Keuangan",
		});
		expect(prompt).toContain("Laporan Keuangan");
		expect(prompt).toContain("SHARED_DESIGN_BLUEPRINT");
		expect(prompt).toContain("CONTROLLED ASSEMBLY CONTRACT");
		expect(prompt).toContain("DOMAIN_AWARE_QUALITY_CONTRACT");
	});

	// 12. Missing accessible labels
	it("12. catches missing accessible labels as a hard validation failure", () => {
		const rawHtml = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main data-studio-content>
			<input id="unlabeled">
		</main></body></html>`;
		const diag = inspectStudioHtml(rawHtml);
		expect(diag.hard).toContain("Accessible label missing on INPUT#unlabeled.");
	});

	// 13. Unsafe handler rejection
	it("13. rejects dangerous onclick handlers and arbitrary scripts as hard failures", () => {
		const rawHtml = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main data-studio-content>
			<button onclick="stealData()" aria-label="Aksi">Submit</button>
			<script>console.log('malicious')</script>
		</main></body></html>`;
		const diag = inspectStudioHtml(rawHtml);
		expect(diag.hard).toContain("Unintended event handler on BUTTON.");
		expect(diag.hard).toContain("Unintended executable script.");
	});

	// 14. No content loss during correction
	it("14. carries previous document to correction prompt to prevent content loss", async () => {
		const initialInvalid = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main data-studio-content>
			<h2>Catat Pemasukan</h2>
			<button><svg width="16" height="16"></svg></button>
		</main></body></html>`;
		const repairedValid = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main data-studio-content>
			<h2>Catat Pemasukan</h2>
			<button aria-label="Simpan Data"><svg width="16" height="16"></svg></button>
		</main></body></html>`;

		const mocked = vi.mocked(tryStreamWithFallback);
		mocked
			.mockResolvedValueOnce({
				firstChunk: initialInvalid,
				generator: (async function* () {})(),
				abortController: new AbortController(),
				outcome: { finishReason: "stop" },
			})
			.mockResolvedValueOnce({
				firstChunk: repairedValid,
				generator: (async function* () {})(),
				abortController: new AbortController(),
				outcome: { finishReason: "stop" },
			});

		const result = await generateValidatedFrameHtml({
			framePrompt: "Bangun layar keuangan",
			blueprint: financeBlueprint,
			viewport: "web",
			expectTokens: false,
			designSkillId: "none",
			dsTokens: null,
			logoUrl: null,
			activeScreen: "Beranda",
		});

		expect(result).toContain("Catat Pemasukan");
		expect(result).toContain("Simpan Data");
		expect(mocked).toHaveBeenCalledTimes(2);
		const correctionPrompt = mocked.mock.calls[1]?.[1]?.[1]?.content ?? "";
		expect(correctionPrompt).toContain("Catat Pemasukan");
	});
});
