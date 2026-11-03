import { describe, expect, it } from "vitest";
import {
	deriveProvisionalStudioTitle,
	normalizeStudioProjectTitle,
	normalizeStudioRenameTitle,
	resolveStudioProjectTitle,
} from "../services/studio-project-title";
import {
	STUDIO_PROJECT_TITLE_FALLBACK,
	STUDIO_PROJECT_TITLE_MAX_CHARS,
	STUDIO_PROJECT_TITLE_MAX_WORDS,
} from "../types/studio-constants";

describe("normalizeStudioProjectTitle", () => {
	it("accepts a short product name", () => {
		expect(normalizeStudioProjectTitle("Aroma Control")).toBe("Aroma Control");
		expect(normalizeStudioProjectTitle("  Aroma   Control  ")).toBe(
			"Aroma Control",
		);
		expect(normalizeStudioProjectTitle('"Aroma Control"')).toBe(
			"Aroma Control",
		);
	});

	it("rejects a brief-length paragraph", () => {
		const paragraph = Array.from(
			{ length: STUDIO_PROJECT_TITLE_MAX_WORDS + 1 },
			(_, index) => `kata${index}`,
		).join(" ");
		expect(normalizeStudioProjectTitle(paragraph)).toBeNull();
	});

	it("trims a trailing stop and keeps a named product", () => {
		expect(normalizeStudioProjectTitle("Aroma Analytics.")).toBe(
			"Aroma Analytics",
		);
		expect(normalizeStudioProjectTitle("POS: Kasir Cepat")).toBe(
			"POS: Kasir Cepat",
		);
	});

	it("rejects a sentence written about the product", () => {
		expect(
			normalizeStudioProjectTitle("Aroma Analytics. Dipakai tim growth"),
		).toBeNull();
		expect(normalizeStudioProjectTitle("Apa itu Aroma?")).toBeNull();
	});

	it("rejects generic placeholders", () => {
		for (const placeholder of ["My Project", "Untitled App", "New Design"])
			expect(normalizeStudioProjectTitle(placeholder)).toBeNull();
	});

	it("rejects an empty value", () => {
		expect(normalizeStudioProjectTitle("   ")).toBeNull();
		expect(normalizeStudioProjectTitle(null)).toBeNull();
	});

	it("leaves a name that fits the budget untouched", () => {
		const words = Array.from({ length: 6 }, () => "Penjualan");
		expect(normalizeStudioProjectTitle(words.join(" "))).toBe(words.join(" "));
	});
});

describe("deriveProvisionalStudioTitle", () => {
	it("prefers the brand the brief quotes", () => {
		expect(
			deriveProvisionalStudioTitle(
				'Dasbor penjualan untuk tim growth "Aroma" yang dipakai tiap hari',
			),
		).toBe("Aroma");
	});

	it("uses the person or brand named after a connector", () => {
		expect(
			deriveProvisionalStudioTitle(
				"Situs profil untuk Rina Kartika beserta halaman kontak",
			),
		).toBe("Rina Kartika");
	});

	it("falls back to the brief head with its context clause removed", () => {
		expect(
			deriveProvisionalStudioTitle("Ringkasan penjualan harian untuk toko"),
		).toBe("Ringkasan penjualan harian");
	});

	it("returns the neutral fallback without any brief", () => {
		expect(deriveProvisionalStudioTitle("")).toBe(
			STUDIO_PROJECT_TITLE_FALLBACK,
		);
		expect(deriveProvisionalStudioTitle("   ")).toBe(
			STUDIO_PROJECT_TITLE_FALLBACK,
		);
	});
});

describe("resolveStudioProjectTitle", () => {
	it("keeps the planner name when it is a product name", () => {
		expect(
			resolveStudioProjectTitle({
				candidate: "Aroma Analytics",
				productName: "Aroma",
				prompt: "Situs profil untuk Rina",
			}),
		).toBe("Aroma Analytics");
	});

	it("uses the blueprint product name when the planner name is a paragraph", () => {
		expect(
			resolveStudioProjectTitle({
				candidate:
					"Dasbor penjualan lengkap untuk tim growth dan finance yang dipakai setiap hari",
				productName: "Aroma Control",
				prompt: 'Dasbor penjualan untuk tim growth "Aroma"',
			}),
		).toBe("Aroma Control");
	});

	it("falls back to the brief when the planner returns a placeholder", () => {
		expect(
			resolveStudioProjectTitle({
				candidate: "Untitled App",
				productName: "New Design",
				prompt: 'Dasbor penjualan untuk tim growth "Aroma"',
			}),
		).toBe("Aroma");
	});

	it("still produces a name without any brand in the brief", () => {
		expect(
			resolveStudioProjectTitle({
				candidate: null,
				productName: null,
				prompt: "Ringkasan penjualan harian untuk toko",
			}),
		).toBe("Ringkasan penjualan harian");
	});
});

describe("normalizeStudioRenameTitle", () => {
	it("normalizes whitespace", () => {
		expect(normalizeStudioRenameTitle("  Aroma   Control  ")).toBe(
			"Aroma Control",
		);
	});

	it("rejects a blank name", () => {
		expect(normalizeStudioRenameTitle("   ")).toBeNull();
		expect(normalizeStudioRenameTitle(null)).toBeNull();
	});

	it("caps a long name without cutting a word in half", () => {
		const words = Array.from({ length: 40 }, () => "Penjualan");
		expect(normalizeStudioRenameTitle(words.join(" "))).toBe(
			words.slice(0, 6).join(" "),
		);
	});

	it("cuts an unbroken token at the character limit", () => {
		expect(normalizeStudioRenameTitle("x".repeat(200))).toBe(
			"x".repeat(STUDIO_PROJECT_TITLE_MAX_CHARS),
		);
	});

	it("keeps a description the person typed on purpose", () => {
		expect(normalizeStudioRenameTitle("My Project")).toBe("My Project");
		expect(normalizeStudioRenameTitle("Toko Bunga Rina, Cabang Bandung")).toBe(
			"Toko Bunga Rina, Cabang Bandung",
		);
	});
});
