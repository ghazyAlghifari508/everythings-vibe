import { describe, expect, it } from "vitest";
import { resolveStudioIntentFromContext } from "../services/studio-composer-intent";
import type { StudioDesignBlueprint } from "../services/studio-design-blueprint";
import {
	STUDIO_MAX_PROMPT_CHARS,
	STUDIO_MIN_PROMPT_CHARS,
} from "../services/studio-prompt-validation";
import {
	deriveStudioScreenSuggestions,
	getStudioScreenSuggestions,
	STUDIO_SCREEN_SUGGESTION_LIMIT,
	type StudioSuggestionInput,
	studioSuggestionRevision,
} from "../services/studio-screen-suggestions";

const BLUEPRINT: StudioDesignBlueprint = {
	productIdentity: {
		productName: "Kasir Cepat",
		targetAudience: "Pemilik warung",
		platform: "web",
		visualDirection: "Editorial",
	},
	designTokens: {
		primary: "#123456",
		secondary: "#555555",
		background: "#ffffff",
		surface: "#fafafa",
		fontFamily: "Arial",
		radius: 8,
		border: "1px solid #dddddd",
		elevation: "none",
	},
	sharedComponents: {
		header: "App bar",
		navigation: "Sidebar",
		buttons: "Solid",
		inputs: "Bordered",
		cards: "Flat",
		tabs: "Underline",
		icons: "Outline",
	},
	navigationContract: {
		destinations: ["overview", "entry", "settings"],
		labels: ["Dashboard", "Transaksi", "Pengaturan"],
		iconMapping: { overview: "home", entry: "plus", settings: "settings" },
		ordering: ["overview", "entry", "settings"],
		activeItemRule: "Match screen",
	},
	screenPlan: [
		{ name: "Dashboard", role: "Ringkasan penjualan harian.", order: 0 },
		{ name: "Transaksi", role: "Daftar transaksi kasir.", order: 1 },
		{ name: "Pengaturan", role: "Preferensi toko.", order: 2 },
	],
};

function context(
	overrides: Partial<StudioSuggestionInput> = {},
): StudioSuggestionInput {
	return {
		projectId: "project-1",
		projectTitle: "CatatDompet",
		designMode: "mobile",
		designBlueprintVersion: 1,
		prdContent: null,
		prdContentHash: null,
		blueprint: null,
		frameNames: [],
		...overrides,
	};
}

const PRD =
	"# CatatDompet\n\nModul: mencatat transaksi harian, menyusun anggaran bulanan, dan meninjau laporan.";

/** Screen name the prompt asks for, as the intent resolver reads it back. */
function promptScreenName(prompt: string): string | undefined {
	return /^Buat satu halaman (.+?)(?: untuk|\.)/.exec(prompt)?.[1];
}

describe("deriveStudioScreenSuggestions", () => {
	it("proposes PRD-grounded next screens beside a single existing screen", () => {
		const suggestions = deriveStudioScreenSuggestions(
			context({ frameNames: ["Beranda"], prdContent: PRD }),
		);
		const titles = suggestions.map((suggestion) => suggestion.title);

		expect(titles).toContain("Catat transaksi harian");
		expect(titles).toContain("Susun anggaran bulanan");
		expect(titles).toContain("Buat laporan berkala");
		expect(titles).not.toContain("Buat halaman Beranda");
		expect(suggestions.length).toBeLessThanOrEqual(
			STUDIO_SCREEN_SUGGESTION_LIMIT,
		);
	});

	it("describes what each suggested screen gives the user", () => {
		const suggestions = deriveStudioScreenSuggestions(
			context({ frameNames: ["Beranda"], prdContent: PRD }),
		);

		for (const suggestion of suggestions) {
			expect(suggestion.title.length).toBeGreaterThan(0);
			expect(suggestion.description.length).toBeGreaterThan(0);
			expect(suggestion.description.length).toBeLessThanOrEqual(96);
			expect(suggestion.reason.length).toBeGreaterThan(0);
			// A bare "Buat <name>" label was the reported complaint.
			expect(suggestion.title).not.toMatch(/^Buat [A-Z][a-z]+$/);
		}
		expect(
			suggestions.find((entry) => entry.title === "Susun anggaran bulanan")
				?.description,
		).toBe("Batas per kategori dan progres pemakaian.");
	});

	it("never proposes a screen the canvas already has", () => {
		const suggestions = deriveStudioScreenSuggestions(
			context({
				frameNames: ["Beranda", "Catat Transaksi", "Anggaran", "Laporan"],
				prdContent: PRD,
			}),
		);
		const titles = suggestions.map((suggestion) => suggestion.title);

		expect(titles).not.toContain("Catat transaksi harian");
		expect(titles).not.toContain("Susun anggaran bulanan");
		expect(titles).not.toContain("Buat laporan berkala");
		expect(titles.length).toBeGreaterThan(0);
	});

	it("never proposes a screen a synonym on the canvas already covers", () => {
		const suggestions = deriveStudioScreenSuggestions(
			context({
				designMode: "web",
				frameNames: ["Checkout"],
				prdContent: "Alur belanja: keranjang, checkout, dan pelacakan pesanan.",
			}),
		);
		const titles = suggestions.map((suggestion) => suggestion.title);

		expect(titles.some((title) => /pembayaran/i.test(title))).toBe(false);
		expect(titles).toContain("Buat keranjang belanja");
		expect(titles).toContain("Lacak status pesanan");
	});

	it("honours a detailed PRD before the generic base screens", () => {
		const suggestions = deriveStudioScreenSuggestions(
			context({
				designMode: "web",
				frameNames: ["Beranda"],
				prdContent:
					"# KasirKu\n\nModul: katalog produk, keranjang, pembayaran, pelacakan pesanan, stok gudang, dan pelanggan setia.",
			}),
		);

		expect(suggestions.map((suggestion) => suggestion.title)).toEqual([
			"Susun katalog item",
			"Buat keranjang belanja",
			"Rancang halaman pembayaran",
		]);
		expect(suggestions.map((suggestion) => suggestion.reason)).toEqual([
			'PRD menyebut "katalog"',
			'PRD menyebut "keranjang"',
			'PRD menyebut "pembayaran"',
		]);
	});

	it("reads the product domain so a travel project gets its own workflow", () => {
		const suggestions = deriveStudioScreenSuggestions(
			context({
				projectId: "travel-1",
				projectTitle: "Jelajahin",
				designMode: "mobile",
				prdContent:
					"# Jelajahin\n\nAplikasi wisata untuk menemukan paket wisata, membandingkan destinasi, dan memesan tiket perjalanan.",
				frameNames: [
					"Pencarian Destinasi",
					"Eksplorasi Paket",
					"Detail Paket",
					"Checkout",
					"Konfirmasi & E-Tiket",
				],
			}),
		);

		expect(suggestions.map((suggestion) => suggestion.title)).toEqual([
			"Buat halaman riwayat perjalanan",
			"Rancang wishlist paket wisata",
			"Tambahkan profil traveler",
		]);
		expect(suggestions.map((suggestion) => suggestion.reason)).toEqual([
			'Alur aplikasi travel menyebut "wisata"',
			'Alur aplikasi travel menyebut "wisata"',
			'Alur aplikasi travel menyebut "wisata"',
		]);
	});

	it("reads a finance project as a finance project, not a travel one", () => {
		const suggestions = deriveStudioScreenSuggestions(
			context({
				projectId: "finance-1",
				projectTitle: "Duitku",
				designMode: "web",
				prdContent:
					"# Duitku\n\nCatat pemasukan dan pengeluaran harian, pantau saldo dompet, dan lihat ringkasan bulanan.",
				frameNames: ["Beranda", "Catat Transaksi"],
			}),
		);

		expect(suggestions.map((suggestion) => suggestion.title)).toEqual([
			"Atur kategori transaksi",
			"Susun anggaran bulanan",
			"Buat laporan keuangan",
		]);
	});

	it("still offers next screens for a project without frames", () => {
		const suggestions = deriveStudioScreenSuggestions(context());
		expect(suggestions.map((suggestion) => suggestion.title)).toEqual([
			"Buat halaman profil",
			"Buat halaman pengaturan",
			"Buat halaman notifikasi",
		]);
	});

	it("respects the selected platform in the fallback set", () => {
		const web = deriveStudioScreenSuggestions(
			context({ designMode: "web" }),
		).map((suggestion) => suggestion.title);
		const mobile = deriveStudioScreenSuggestions(
			context({ designMode: "mobile" }),
		).map((suggestion) => suggestion.title);

		expect(web).toContain("Buat halaman aktivitas");
		expect(web).not.toContain("Buat halaman notifikasi");
		expect(mobile).toContain("Buat halaman notifikasi");
		expect(mobile).not.toContain("Buat halaman aktivitas");
	});

	it("leads with blueprint plan gaps and falls back to base screens", () => {
		const suggestions = deriveStudioScreenSuggestions(
			context({
				designMode: "web",
				frameNames: ["Dashboard"],
				blueprint: BLUEPRINT,
			}),
		);
		expect(suggestions[0]?.title).toBe("Buat halaman Transaksi");
		expect(suggestions[0]?.description).toBe("Daftar transaksi kasir.");
		expect(suggestions[0]?.reason).toBe(
			"Rencana layar blueprint belum ada di canvas",
		);
		expect(suggestions[1]?.title).toBe("Buat halaman Pengaturan");
		expect(suggestions.map((suggestion) => suggestion.title)).not.toContain(
			"Buat halaman Dashboard",
		);
	});

	it("proposes a navigation destination that has no screen yet", () => {
		const suggestions = deriveStudioScreenSuggestions(
			context({
				designMode: "web",
				frameNames: ["Dashboard"],
				blueprint: {
					...BLUEPRINT,
					navigationContract: {
						destinations: ["overview", "cart"],
						labels: ["Dashboard", "Keranjang"],
						iconMapping: { overview: "home", cart: "plus" },
						ordering: ["overview", "cart"],
						activeItemRule: "Match screen",
					},
					screenPlan: [
						{ name: "Dashboard", role: "Ringkasan penjualan.", order: 0 },
					],
				},
			}),
		);
		const cart = suggestions.find(
			(suggestion) => suggestion.title === "Buat halaman Keranjang",
		);
		expect(cart?.reason).toBe("Destinasi navigasi belum punya layar");
		// The destination keeps its own name but is described by the lexicon.
		expect(cart?.description).toBe(
			"Item terpilih, pengatur jumlah, dan subtotal.",
		);
	});

	it("uses the prompt behind an earlier screen when the PRD is silent", () => {
		const suggestions = deriveStudioScreenSuggestions(
			context({
				frameNames: ["Beranda"],
				frameDescriptions: ["Buat halaman stok gudang dengan level minimum."],
			}),
		);
		const stok = suggestions.find(
			(entry) => entry.title === "Kelola stok barang",
		);

		expect(stok?.reason).toBe('Permintaan halaman sebelumnya menyebut "stok"');
	});

	it("treats a partially matching name as the same screen", () => {
		const titles = deriveStudioScreenSuggestions(
			context({ frameNames: ["Catat"], prdContent: PRD }),
		).map((suggestion) => suggestion.title);
		expect(titles).not.toContain("Catat transaksi harian");
	});

	it("keeps user-created screen names and project language intact", () => {
		const suggestions = deriveStudioScreenSuggestions(
			context({
				designMode: "web",
				frameNames: ["Beranda", "Kelola Anggota Tim"],
				prdContent: "Fitur: undangan anggota dan log aktivitas.",
			}),
		);
		const titles = suggestions.map((suggestion) => suggestion.title);

		expect(titles).not.toContain("Buat halaman Kelola Anggota Tim");
		expect(titles).toContain("Buat halaman aktivitas");
		for (const title of titles) expect(title.length).toBeGreaterThan(0);
	});

	it("gives every card an add-screen intent, a stable id, and its own prompt", () => {
		const suggestions = deriveStudioScreenSuggestions(
			context({ frameNames: ["Beranda"], prdContent: PRD }),
		);

		for (const suggestion of suggestions) {
			expect(suggestion.intent).toBe("add_screen");
			expect(suggestion.id).toMatch(/^add-screen:[a-z0-9-]+$/);
			expect(suggestion.reason.length).toBeGreaterThan(0);
			expect(suggestion.prompt).toContain("CatatDompet");
			expect(suggestion.prompt).toContain("Jangan mengubah halaman lain.");
			// The card prompt is submitted through the same frame API, so it must
			// satisfy the shared prompt bounds before a click can send it.
			expect(suggestion.prompt.length).toBeGreaterThanOrEqual(
				STUDIO_MIN_PROMPT_CHARS,
			);
			expect(suggestion.prompt.length).toBeLessThanOrEqual(
				STUDIO_MAX_PROMPT_CHARS,
			);
			// The card prompt must resolve to the same screen the prompt names,
			// so the existing composer intent model performs the addition.
			const decision = resolveStudioIntentFromContext({
				prompt: suggestion.prompt,
				selectedFrameIds: [],
			});
			expect(decision?.intent).toBe("add_screen");
			expect(decision?.screens.length).toBe(1);
			expect(decision?.screens[0]).toBe(promptScreenName(suggestion.prompt));
		}
		expect(new Set(suggestions.map((suggestion) => suggestion.id)).size).toBe(
			suggestions.length,
		);
	});

	it("derives a screen-specific prompt instead of a generic instruction", () => {
		const suggestion = deriveStudioScreenSuggestions(
			context({ frameNames: ["Beranda"], prdContent: PRD }),
		).find((entry) => entry.title === "Susun anggaran bulanan");

		expect(suggestion?.prompt).toContain("Buat satu halaman Anggaran");
		expect(suggestion?.prompt).toContain("realisasi");
		expect(suggestion?.prompt).toContain("progres pemakaian");
		expect(suggestion?.prompt).toContain("warna, tipografi, header");
	});
});

describe("suggestion revision cache", () => {
	it("reuses the cached list while the project content is unchanged", () => {
		const input = context({ frameNames: ["Beranda"], prdContent: PRD });
		const first = getStudioScreenSuggestions(input);
		const again = getStudioScreenSuggestions(
			context({ frameNames: ["Beranda"], prdContent: PRD }),
		);
		expect(again).toBe(first);
	});

	it("invalidates when a frame is added, renamed, or removed", () => {
		const base = studioSuggestionRevision(context({ frameNames: ["Beranda"] }));
		expect(
			studioSuggestionRevision(context({ frameNames: ["Beranda", "Laporan"] })),
		).not.toBe(base);
		expect(
			studioSuggestionRevision(context({ frameNames: ["Profil"] })),
		).not.toBe(base);
		expect(studioSuggestionRevision(context({ frameNames: [] }))).not.toBe(
			base,
		);
	});

	it("invalidates when the PRD, blueprint, platform, title, or request history changes", () => {
		const base = studioSuggestionRevision(context());
		expect(studioSuggestionRevision(context({ prdContentHash: "a" }))).not.toBe(
			base,
		);
		expect(
			studioSuggestionRevision(context({ designBlueprintVersion: 2 })),
		).not.toBe(base);
		expect(studioSuggestionRevision(context({ designMode: "web" }))).not.toBe(
			base,
		);
		expect(
			studioSuggestionRevision(context({ projectTitle: "Kasir Cepat" })),
		).not.toBe(base);
		expect(
			studioSuggestionRevision(
				context({ frameDescriptions: ["Buat halaman stok"] }),
			),
		).not.toBe(base);
		expect(studioSuggestionRevision(context())).toBe(base);
	});

	it("returns a new list after the project structure changes", () => {
		const before = getStudioScreenSuggestions(
			context({ frameNames: ["Beranda"], prdContent: PRD }),
		);
		const after = getStudioScreenSuggestions(
			context({
				frameNames: ["Beranda", "Catat Transaksi"],
				prdContent: PRD,
			}),
		);
		expect(after).not.toBe(before);
		expect(after.map((suggestion) => suggestion.title)).not.toContain(
			"Catat transaksi harian",
		);
	});
});
