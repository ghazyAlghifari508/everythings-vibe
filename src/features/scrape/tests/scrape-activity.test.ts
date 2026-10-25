import { describe, expect, it } from "vitest";
import { resolveScrapeActivity } from "../utils/scrape-activity";

describe("public activity copy", () => {
	it("maps the internal pipeline strings named by the design contract", () => {
		expect(
			resolveScrapeActivity({
				activity: "Capture halaman selesai",
				mode: "design",
			}),
		).toBe("Tampilan berhasil diambil");
		expect(
			resolveScrapeActivity({
				activity: "Menyiapkan HTML standalone",
				mode: "html",
			}),
		).toBe("Menyiapkan hasil HTML");
		expect(
			resolveScrapeActivity({
				activity: "Menyimpan hasil",
				mode: "design",
			}),
		).toBe("Menyimpan hasil");
		expect(
			resolveScrapeActivity({
				activity: "Menganalisis evidence",
				mode: "design",
			}),
		).toBe("Memeriksa gaya dan komponen");
		expect(
			resolveScrapeActivity({
				activity: "Resource halaman gagal diambil",
				mode: "crawl",
			}),
		).toBe("Beberapa konten belum berhasil dimuat");
	});

	it("collapses viewport and colour-scheme metadata into a device counter", () => {
		expect(
			resolveScrapeActivity({
				activity: "Menunggu resource halaman: 390x844, light (2/2)",
				mode: "design",
			}),
		).toBe("Memuat tampilan mobile · 2 dari 2");
		expect(
			resolveScrapeActivity({
				activity: "Mengambil tampilan 834x1112, dark (1/3)",
				mode: "design",
			}),
		).toBe("Memuat tampilan tablet · 1 dari 3");
		expect(
			resolveScrapeActivity({
				activity: "Menangkap DOM hasil render: 1440x900, dark (2/2)",
				mode: "design",
			}),
		).toBe("Memuat tampilan desktop · 2 dari 2");
	});

	it("omits a view counter that would be misleading", () => {
		expect(
			resolveScrapeActivity({
				activity: "Mengambil tampilan 390x844, light (4/2)",
				mode: "design",
			}),
		).toBe("Memuat tampilan mobile");
	});

	it("replaces persisted page and image URLs with the real work", () => {
		expect(
			resolveScrapeActivity({
				activity: "https://example.com/pricing?ref=nav",
				mode: "crawl",
			}),
		).toBe("Memeriksa halaman");
		expect(
			resolveScrapeActivity({
				activity: "https://cdn.example.com/hero.png",
				mode: "images",
			}),
		).toBe("Memeriksa gambar");
		expect(resolveScrapeActivity({ activity: "/pricing", mode: "html" })).toBe(
			"Memeriksa halaman",
		);
	});

	it("returns null instead of inventing an activity the backend never wrote", () => {
		expect(
			resolveScrapeActivity({
				activity: "unknown internal phase",
				mode: "design",
			}),
		).toBeNull();
		expect(
			resolveScrapeActivity({ activity: "   ", mode: "design" }),
		).toBeNull();
		expect(
			resolveScrapeActivity({ activity: null, mode: "images" }),
		).toBeNull();
	});
});
