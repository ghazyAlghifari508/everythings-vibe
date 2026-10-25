import { describe, expect, it, vi } from "vitest";
import { ScrapeError } from "@/lib/design-errors";
import { tryStreamWithFallback } from "@/lib/services/ai-orchestrator";
import type { StudioDesignBlueprint } from "../services/studio-design-blueprint";
import { enforceDesignSystemOnHtml } from "../services/studio-design-system-html";
import {
	StudioFrameError,
	studioFrameErrorReport,
} from "../services/studio-frame-errors";
import { generateValidatedFrameHtml } from "../services/studio-frame-generation";
import {
	areNavigationStructuresConsistent,
	extractNavigationStructure,
	validateGeneratedHtml,
} from "../services/studio-generated-html-validation";

vi.mock("@/lib/services/ai-orchestrator", () => ({
	selectModels: () => [],
	tryStreamWithFallback: vi.fn(),
}));

vi.mock("@/db", () => ({
	db: {
		insert: vi.fn(),
		select: vi.fn(),
		update: vi.fn(),
		transaction: vi.fn(),
	},
}));

const blueprint: StudioDesignBlueprint = {
	productIdentity: {
		productName: "Aplikasi Contoh",
		targetAudience: "Umum",
		platform: "web",
		visualDirection: "Bersih",
	},
	designTokens: {
		primary: "#0f0f0f",
		secondary: "#606060",
		background: "#ffffff",
		surface: "#f8f8f8",
		fontFamily: "system-ui",
		radius: 12,
		border: "1px solid #d3d3d3",
		elevation: "none",
	},
	sharedComponents: {
		header: "Bar",
		navigation: "Tabs",
		buttons: "Ink",
		inputs: "8px",
		cards: "12px",
		tabs: "Seg",
		icons: "Hugeicons",
	},
	navigationContract: {
		destinations: ["home", "projects", "contact"],
		labels: ["Beranda", "Proyek", "Tentang & Kontak"],
		iconMapping: { home: "home", projects: "folder", contact: "mail" },
		ordering: ["home", "projects", "contact"],
		activeItemRule: "Tandai satu item aktif",
	},
	screenPlan: [
		{ name: "Beranda", role: "Layar utama", order: 0 },
		{ name: "Proyek", role: "Layar kedua", order: 1 },
		{ name: "Tentang & Kontak", role: "Layar ketiga", order: 2 },
	],
};

function document(inner: string, head = ""): string {
	return enforceDesignSystemOnHtml(
		`<html><head><meta name="viewport" content="width=device-width, initial-scale=1">${head}</head><body>${inner}</body></html>`,
		null,
		null,
		blueprint,
	);
}

function validate(html: string, viewport: "web" | "mobile"): string[] {
	return validateGeneratedHtml(html, {
		blueprint,
		viewport,
		expectTokens: false,
	});
}

describe("kontrak navigasi bersama", () => {
	it("menerima label ber-ampersand yang di-escape generator", () => {
		const html = document(
			'<nav><a>Beranda</a><a>Proyek</a><a aria-current="page">Tentang &amp; Kontak</a></nav><main style="max-width:1200px">Konten</main>',
		);
		expect(validate(html, "web")).toEqual([]);
	});

	it("menerima label yang dipecah elemen inline, entitas, dan spasi baris", () => {
		const html = document(
			`<nav>
				<a><span>Beranda</span></a>
				<a><i>Proyek</i></a>
				<button>Tentang&nbsp;&amp;
					Kontak</button>
			</nav><main>Konten</main>`,
		);
		expect(validate(html, "mobile")).toEqual([]);
	});

	it("menerima label gabungan yang dirender dalam satu item", () => {
		const combined: StudioDesignBlueprint = {
			...blueprint,
			navigationContract: {
				...blueprint.navigationContract,
				labels: ["Beranda", "Tentang", "Kontak"],
			},
		};
		const html = enforceDesignSystemOnHtml(
			'<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><nav><a>Beranda</a><a>Tentang &amp; Kontak</a></nav><main>Konten</main></body></html>',
			null,
			null,
			combined,
		);
		expect(
			validateGeneratedHtml(html, {
				blueprint: combined,
				viewport: "web",
				expectTokens: false,
			}),
		).toEqual([]);
	});

	it("menolak label yang benar-benar hilang dari navigasi", () => {
		const html = document(
			"<nav><a>Beranda</a><a>Proyek</a></nav><main>Konten</main>",
		);
		expect(
			validate(html, "web").some((issue) => issue.includes("Tentang & Kontak")),
		).toBe(true);
	});

	it("tetap mengabaikan label yang hanya muncul di luar elemen nav", () => {
		const html = document(
			"<nav><a>Menu</a></nav><main><p>Beranda Proyek Tentang &amp; Kontak</p></main>",
		);
		expect(validate(html, "web").length).toBeGreaterThan(0);
	});

	it("menolak urutan navigasi yang menyimpang", () => {
		const html = document(
			"<nav><a>Proyek</a><a>Beranda</a><a>Tentang &amp; Kontak</a></nav><main>Konten</main>",
		);
		expect(
			validate(html, "web").some((issue) => issue.includes("Urutan navigasi")),
		).toBe(true);
	});

	it("menolak navigasi ganda walaupun labelnya lengkap", () => {
		const nav =
			"<nav><a>Beranda</a><a>Proyek</a><a>Tentang &amp; Kontak</a></nav>";
		expect(
			validate(document(`${nav}${nav}<main>Konten</main>`), "web").some(
				(issue) => issue.includes("Navigasi ganda"),
			),
		).toBe(true);
	});

	it("menjaga struktur navigasi tetap konsisten saat item aktif berpindah", () => {
		const nav =
			"<nav><a>Beranda</a><a>Proyek</a><a>Tentang &amp; Kontak</a></nav>";
		const first = extractNavigationStructure(
			document(`${nav}<main>Beranda</main>`),
			blueprint,
		);
		const second = extractNavigationStructure(
			document(`${nav}<main>Proyek</main>`),
			blueprint,
		);
		const third = extractNavigationStructure(
			document(`${nav}<main>Tentang &amp; Kontak</main>`),
			blueprint,
		);
		expect(first.labels).toEqual(["Beranda", "Proyek", "Tentang & Kontak"]);
		expect(areNavigationStructuresConsistent(first, second)).toBe(true);
		expect(areNavigationStructuresConsistent(first, third)).toBe(true);
	});
});

describe("validasi overflow viewport", () => {
	it("menerima layout responsif web dengan max-width dan breakpoint", () => {
		const html = document(
			'<nav><a>Beranda</a><a>Proyek</a><a>Tentang &amp; Kontak</a></nav><main style="max-width:1200px"><img src="/a.png" width="1600" alt=""><div class="grid">Konten</div></main>',
			"<style>.grid{max-width:1200px;width:100%}@media (min-width:1280px){.grid{max-width:1360px}}</style>",
		);
		expect(validate(html, "web")).toEqual([]);
	});

	it("menerima aturan breakpoint di atas viewport mobile", () => {
		const html = document(
			'<nav><a>Beranda</a><a>Proyek</a><a>Tentang &amp; Kontak</a></nav><main class="card">Konten</main>',
			"<style>.card{width:100%}@media (min-width:768px){.card{min-width:720px}}@media (max-width:420px){.card{padding:8px}}</style>",
		);
		expect(validate(html, "mobile")).toEqual([]);
	});

	it("mendeteksi lebar tetap yang melebihi viewport mobile", () => {
		const html = document(
			'<nav><a>Beranda</a><a>Proyek</a><a>Tentang &amp; Kontak</a></nav><main style="width:500px">Konten</main>',
		);
		expect(
			validate(html, "mobile").some((issue) => issue.includes("Lebar tetap")),
		).toBe(true);
	});

	it("mendeteksi min-width yang melebihi viewport mobile", () => {
		const html = document(
			'<nav><a>Beranda</a><a>Proyek</a><a>Tentang &amp; Kontak</a></nav><main class="col">Konten</main>',
			"<style>.col{min-width:26rem}</style>",
		);
		expect(
			validate(html, "mobile").some((issue) => issue.includes("Lebar tetap")),
		).toBe(true);
	});

	it("mendeteksi lebar tetap yang melebihi viewport web", () => {
		const html = document(
			'<nav><a>Beranda</a><a>Proyek</a><a>Tentang &amp; Kontak</a></nav><main style="width:1600px">Konten</main>',
		);
		expect(
			validate(html, "web").some((issue) => issue.includes("Lebar tetap")),
		).toBe(true);
	});

	it("tidak menandai max-width sebagai overflow", () => {
		const html = document(
			'<nav><a>Beranda</a><a>Proyek</a><a>Tentang &amp; Kontak</a></nav><main style="max-width:1440px">Konten</main>',
			"<style>main{max-width:1440px}</style>",
		);
		expect(
			validate(html, "mobile").some((issue) => issue.includes("Lebar tetap")),
		).toBe(false);
	});
});

async function mockRawSequence(raws: string[], prompts: string[] = []) {
	const mocked = vi.mocked(tryStreamWithFallback);
	mocked.mockReset();
	for (const raw of raws) {
		mocked.mockImplementationOnce(async (_models, messages) => {
			const userMessage = messages.find((message) => message.role === "user");
			prompts.push(userMessage?.content ?? "");
			return {
				firstChunk: raw,
				generator: (async function* () {})(),
				abortController: new AbortController(),
				outcome: {},
			};
		});
	}
	return mocked;
}

describe("strategi koreksi terbatas", () => {
	it("mengirim instruksi koreksi internal yang spesifik lalu menjadi ready", async () => {
		const prompts: string[] = [];
		const mocked = await mockRawSequence(
			[
				"<html><head></head><p>Belum selesai</html>",
				"<html><head></head><body><p>Konten valid</p></body></html>",
			],
			prompts,
		);
		const html = await generateValidatedFrameHtml({
			framePrompt: "BRIEF ASLI: bangun layar contoh",
			blueprint: null,
			viewport: "web",
			expectTokens: false,
			designSkillId: "none",
			dsTokens: null,
			logoUrl: null,
		});
		expect(html).toContain("Konten valid");
		expect(mocked).toHaveBeenCalledTimes(2);
		expect(prompts[1]).toContain("BRIEF ASLI: bangun layar contoh");
		expect(prompts[1]).toContain("Validation:");
		expect(prompts[1]).toContain("- Body HTML tidak lengkap.");
		expect(prompts[1]).toContain("Repair these failures without redesigning");
		expect(prompts[1]).toContain("Return a complete valid document.");
	});

	it("menandai kegagalan kontrak setelah koreksi terbatas habis", async () => {
		const mocked = await mockRawSequence([
			"<html><head></head><body><p>Belum selesai",
			"<html><head></head><body><p>Masih belum selesai",
			"<html><head></head><body><p>Terlalu banyak percobaan",
		]);
		await expect(
			generateValidatedFrameHtml({
				framePrompt: "Bangun layar contoh",
				blueprint: null,
				viewport: "web",
				expectTokens: false,
				designSkillId: "none",
				dsTokens: null,
				logoUrl: null,
			}),
		).rejects.toMatchObject({ code: "STUDIO_CONTRACT_VIOLATION" });
		expect(mocked).toHaveBeenCalledTimes(2);
	});
});

describe("klasifikasi error studio", () => {
	it.each([
		{
			failure: new StudioFrameError("STUDIO_CONTRACT_VIOLATION", "issues"),
			code: "STUDIO_CONTRACT_VIOLATION",
			status: 500,
		},
		{
			failure: new Error("429 Too Many Requests"),
			code: "STUDIO_PROVIDER_RATE_LIMITED",
			status: 429,
		},
		{
			failure: new Error("provider request timed out"),
			code: "STUDIO_PROVIDER_TIMEOUT",
			status: 504,
		},
		{
			failure: new Error("fetch failed: ECONNREFUSED"),
			code: "STUDIO_PROVIDER_UNAVAILABLE",
			status: 503,
		},
		{
			failure: new ScrapeError("STORAGE_FAILED", "private storage detail"),
			code: "STUDIO_STORAGE_FAILED",
			status: 500,
		},
		{
			failure: new ScrapeError("VISUAL_CAPTURE_FAILED", "private capture"),
			code: "STUDIO_PREVIEW_FAILED",
			status: 502,
		},
		{
			failure: new StudioFrameError("STUDIO_RETRY_RUNNING"),
			code: "STUDIO_RETRY_RUNNING",
			status: 409,
		},
		{
			failure: new StudioFrameError("STUDIO_NOT_FOUND"),
			code: "STUDIO_NOT_FOUND",
			status: 404,
		},
		{
			failure: new Error("Unauthorized private session detail"),
			code: "STUDIO_UNAUTHORIZED",
			status: 401,
		},
	])("memetakan $code ke status $status dengan copy publik", ({
		failure,
		code,
		status,
	}) => {
		const report = studioFrameErrorReport(failure);
		expect(report.code).toBe(code);
		expect(report.status).toBe(status);
		expect(report.message.length).toBeGreaterThan(0);
		expect(report.message).not.toContain("private");
		expect(report.message).not.toContain("[STUDIO_");
	});

	it("menjaga detail validator tetap internal saat kontrak habis", async () => {
		await mockRawSequence([
			"<html><head></head><p>Belum selesai</html>",
			"<html><head></head><p>Masih belum selesai</html>",
		]);
		const failure = await generateValidatedFrameHtml({
			framePrompt: "Bangun layar contoh",
			blueprint: null,
			viewport: "web",
			expectTokens: false,
			designSkillId: "none",
			dsTokens: null,
			logoUrl: null,
		}).catch((error: unknown) => error);
		const report = studioFrameErrorReport(failure);
		expect(report.code).toBe("STUDIO_CONTRACT_VIOLATION");
		expect(report.message).toBe("Desain belum berhasil dibuat. Coba lagi.");
		expect(report.diagnostic).toContain("Body HTML tidak lengkap.");
	});
});
