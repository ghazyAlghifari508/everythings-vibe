import { describe, expect, it } from "vitest";
import { deriveProjectNameSync } from "@/features/greenfield/services/prd-naming";
import {
	deriveFeatureTitle,
	isProvisionalFeatureTitle,
	refineProvisionalFeatureTitle,
} from "../services/feature-naming";

/** The prompt from FIX 08 that produced "Demi Kemudahan Eksplorasi Karya". */
const PORTFOLIO_PROMPT = `Sediakan fitur interaktif pada halaman portofolio yang
memungkinkan calon klien atau perekrut menyaring proyek berdasarkan rumpun
teknologi atau bidang tertentu, serta mencari judul proyek melalui kolom
pencarian langsung. Tampilkan pemberitahuan yang jelas ketika hasil pencarian
tidak ditemukan dan sediakan opsi untuk mereset seluruh filter secara instan
demi kemudahan eksplorasi karya.`;

describe("deriveFeatureTitle", () => {
	it("names a long Indonesian request by function and target", () => {
		expect(deriveFeatureTitle(PORTFOLIO_PROMPT)).toBe(
			"Pencarian dan Filter Proyek Portofolio",
		);
	});

	it("never reuses the filler tail of the final sentence", () => {
		const title = deriveFeatureTitle(PORTFOLIO_PROMPT);
		expect(title).not.toMatch(/demi|kemudahan|eksplorasi|karya/i);
		expect(title).not.toBe(deriveProjectNameSync(PORTFOLIO_PROMPT));
		expect(deriveProjectNameSync(PORTFOLIO_PROMPT)).toBe(
			"Demi Kemudahan Eksplorasi Karya",
		);
	});

	it("keeps the title free of marketing language", () => {
		const title = deriveFeatureTitle(PORTFOLIO_PROMPT);
		expect(title).not.toMatch(
			/terbaik|revolusioner|luar biasa|premium|solusi|mudah|cepat/i,
		);
	});

	it("derives a blog title from a blog request", () => {
		expect(deriveFeatureTitle("Add a blog to a portfolio website", "en")).toBe(
			"Blog Portfolio",
		);
		expect(deriveFeatureTitle("Tambahkan blog ke website portofolio")).toBe(
			"Blog Portofolio",
		);
	});

	it("derives a navigation title from a navigation request", () => {
		expect(deriveFeatureTitle("Fix mobile navigation responsiveness")).toBe(
			"Perbaikan Navigasi Mobile",
		);
		expect(
			deriveFeatureTitle("Fix mobile navigation responsiveness", "en"),
		).toBe("Fix Mobile Navigation");
	});

	it("collapses synonyms of one concept into a single noun", () => {
		expect(deriveFeatureTitle("Tambah login dan autentikasi pengguna")).toBe(
			"Autentikasi Pengguna",
		);
	});

	it("keeps the functional noun before its modifier", () => {
		expect(deriveFeatureTitle("Tambahkan dashboard status pesanan")).toBe(
			"Dashboard Status Pesanan",
		);
		expect(
			deriveFeatureTitle("Add filtering to a list of articles", "en"),
		).toBe("Filter Articles");
	});

	it("names management, repair and save requests by their function", () => {
		expect(
			deriveFeatureTitle(
				"Buat halaman admin untuk mengelola pengguna dan peran",
			),
		).toBe("Manajemen Pengguna");
		expect(
			deriveFeatureTitle(
				"Perbaiki bug pada halaman checkout yang muncul saat keranjang kosong",
			),
		).toBe("Perbaikan Pembayaran");
		expect(
			deriveFeatureTitle(
				"Pengguna bisa menyimpan draft artikel sebelum dipublikasikan",
			),
		).toBe("Penyimpanan Artikel Pengguna");
	});

	it("names an English request in English when planned in English", () => {
		const title = deriveFeatureTitle(
			"Add search and filters to portfolio projects",
			"en",
		);
		expect(title).toMatch(/search/i);
		expect(title).toMatch(/filter/i);
		expect(title).not.toMatch(/pencarian|filter proyek/i);
	});

	it("preserves an explicit user-given feature name", () => {
		expect(
			deriveFeatureTitle('Bikin fitur bernama "Smart Project Finder"'),
		).toBe("Smart Project Finder");
		expect(deriveFeatureTitle("tolong buatkan fitur bernama HabitFlow")).toBe(
			"HabitFlow",
		);
	});

	it("is deterministic for the same prompt", () => {
		const first = deriveFeatureTitle(PORTFOLIO_PROMPT);
		expect(deriveFeatureTitle(PORTFOLIO_PROMPT)).toBe(first);
		expect(
			deriveFeatureTitle(`  ${PORTFOLIO_PROMPT.replace(/\n/g, " ")}  `),
		).toBe(first);
	});

	it("stays inside the title budget", () => {
		const title = deriveFeatureTitle(PORTFOLIO_PROMPT);
		expect(title.length).toBeLessThanOrEqual(40);
		expect(title.split(" ").length).toBeLessThanOrEqual(6);
	});

	it("falls back to a neutral label instead of fabricating an elaborate name", () => {
		expect(
			deriveFeatureTitle("Tolong buatkan fitur yang jelas dan mudah"),
		).toBe("Fitur Baru");
		expect(deriveFeatureTitle("please create something", "en")).toBe(
			"New Feature",
		);
	});

	it("keeps the first content words when no known term appears", () => {
		expect(deriveFeatureTitle("Tambahkan dark mode dan preferensi tema")).toBe(
			"Dark Mode Preferensi",
		);
	});

	it("uses the neutral onboarding intent as a readable title", () => {
		expect(deriveFeatureTitle("Ringkasan codebase awal")).toBe(
			"Ringkasan Codebase Awal",
		);
	});

	it("ignores compiled PRD boilerplate inside the prompt", () => {
		const compiled = [
			"Tambahkan pencarian artikel blog",
			"",
			"--- Preferensi Non-Teknis ---",
			"Deployment: Biarkan AI yang memilih",
			"Database: PostgreSQL",
		].join("\n");
		expect(deriveFeatureTitle(compiled)).toBe("Pencarian Artikel Blog");
	});
});

describe("isProvisionalFeatureTitle", () => {
	it("recognizes only the neutral labels", () => {
		expect(isProvisionalFeatureTitle("Fitur Baru")).toBe(true);
		expect(isProvisionalFeatureTitle(" New Feature ")).toBe(true);
		expect(isProvisionalFeatureTitle("Pencarian dan Filter Proyek")).toBe(
			false,
		);
		expect(isProvisionalFeatureTitle("Smart Project Finder")).toBe(false);
	});
});

/**
 * A vague first prompt leaves the feature under the provisional label. Once the
 * answered questions name the real feature, the title is refined exactly once —
 * and a title that is not provisional is never touched, so a manual rename
 * survives every later generation.
 */
describe("refineProvisionalFeatureTitle", () => {
	it("refines a provisional title from the answered questions", () => {
		expect(
			refineProvisionalFeatureTitle({
				currentName: "Fitur Baru",
				message:
					"Rencanakan fitur Fitur Baru: menyaring proyek portofolio berdasarkan teknologi",
				language: "id",
			}),
		).toBe("Filter Proyek Portofolio");
		expect(
			refineProvisionalFeatureTitle({
				currentName: "Fitur Baru",
				message: "Rencanakan fitur Fitur Baru: tambahkan notifikasi pesanan",
				language: "id",
			}),
		).toBe("Notifikasi Pesanan");
	});

	it("refines an English provisional title in English", () => {
		expect(
			refineProvisionalFeatureTitle({
				currentName: "New Feature",
				message: "Plan feature: search articles",
				language: "en",
			}),
		).toBe("Search Articles");
	});

	it("leaves a meaningful title alone", () => {
		expect(
			refineProvisionalFeatureTitle({
				currentName: "Pencarian dan Filter Proyek Portofolio",
				message: "Rencanakan fitur apa saja: tambahkan notifikasi pesanan",
				language: "id",
			}),
		).toBeNull();
		expect(
			refineProvisionalFeatureTitle({
				currentName: "Smart Project Finder",
				message: "Rencanakan fitur Smart Project Finder: filter proyek",
				language: "id",
			}),
		).toBeNull();
	});

	it("stays provisional while the feature is still unnamed", () => {
		expect(
			refineProvisionalFeatureTitle({
				currentName: "Fitur Baru",
				message: "Rencanakan fitur Fitur Baru",
				language: "id",
			}),
		).toBeNull();
	});
});
