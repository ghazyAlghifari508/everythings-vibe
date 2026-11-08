// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type ImageResult, ImagesResult } from "../components/images-result";

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

function mockImage(
	id: string,
	partial: Partial<ImageResult> = {},
): ImageResult {
	return {
		id,
		scrapeId: "scrape-test",
		userId: "user-test",
		url: `https://sample.example/${id}.${partial.format ?? "png"}`,
		pageUrl: "https://sample.example/",
		format: partial.format ?? "png",
		width: 800,
		height: 600,
		classification: partial.classification ?? "photograph",
		evidence: { alt: null, sources: ["img"] },
		status: partial.status ?? "completed",
		assetId: null,
		httpStatus: null,
		failureCode: partial.failureCode ?? null,
		error: null,
		assetUrl: `https://sample.example/assets/${id}.${partial.format ?? "png"}`,
		...partial,
	};
}

describe("TASK 3 — VibeScrape Images Explorer Pagination (13 Skenario Wajib)", () => {
	// Skenario 1: 0 gambar
	it("1. 0 gambar: menampilkan empty state tanpa pagination", () => {
		render(
			<ImagesResult
				images={[]}
				sourceUrl="https://example.com"
				imageOutcome="empty"
			/>,
		);

		expect(screen.getByText("Tidak ada gambar yang ditemukan")).toBeDefined();
		expect(screen.queryByRole("navigation", { name: "pagination" })).toBeNull();
		expect(screen.queryByRole("article")).toBeNull();
	});

	// Skenario 2: 1 gambar
	it("2. 1 gambar: menampilkan 1 card dan menyembunyikan pagination", () => {
		const images = [mockImage("img-1")];
		render(<ImagesResult images={images} sourceUrl="https://example.com" />);

		expect(screen.getByText("1 gambar tersedia")).toBeDefined();
		expect(screen.getAllByRole("article")).toHaveLength(1);
		expect(screen.queryByRole("navigation", { name: "pagination" })).toBeNull();
	});

	// Skenario 3: Tepat 12 gambar
	it("3. tepat 12 gambar: menampilkan 12 card tanpa kontrol pagination", () => {
		const images = Array.from({ length: 12 }, (_, i) =>
			mockImage(`img-${i + 1}`),
		);
		render(<ImagesResult images={images} sourceUrl="https://example.com" />);

		expect(screen.getByText("12 gambar tersedia")).toBeDefined();
		expect(screen.getAllByRole("article")).toHaveLength(12);
		expect(screen.queryByRole("navigation", { name: "pagination" })).toBeNull();
	});

	// Skenario 4: 13 gambar
	it("4. 13 gambar: merender 12 card di halaman pertama dan mengaktifkan pagination", () => {
		const images = Array.from({ length: 13 }, (_, i) =>
			mockImage(`img-${i + 1}`),
		);
		render(<ImagesResult images={images} sourceUrl="https://example.com" />);

		expect(screen.getByText("13 gambar tersedia")).toBeDefined();
		expect(screen.getAllByRole("article")).toHaveLength(12);

		const nav = screen.getByRole("navigation", { name: "pagination" });
		expect(nav).toBeDefined();
		expect(screen.getByText("Menampilkan 1–12 dari 13 gambar")).toBeDefined();

		const prev = screen.getByRole("button", { name: "Halaman sebelumnya" });
		const next = screen.getByRole("button", { name: "Halaman berikutnya" });
		expect(prev.hasAttribute("disabled")).toBe(true);
		expect(next.hasAttribute("disabled")).toBe(false);

		// Pindah ke halaman 2
		fireEvent.click(next);
		expect(screen.getAllByRole("article")).toHaveLength(1);
		expect(screen.getByText("Menampilkan 13–13 dari 13 gambar")).toBeDefined();
		expect(prev.hasAttribute("disabled")).toBe(false);
		expect(next.hasAttribute("disabled")).toBe(true);
	});

	// Skenario 5: 124 gambar
	it("5. 124 gambar: menghitung 11 halaman dengan pagination ellipsis yang akurat", () => {
		const images = Array.from({ length: 124 }, (_, i) =>
			mockImage(`img-${i + 1}`),
		);
		render(<ImagesResult images={images} sourceUrl="https://example.com" />);

		expect(screen.getByText("124 gambar tersedia")).toBeDefined();
		expect(screen.getAllByRole("article")).toHaveLength(12);
		expect(screen.getByText("Menampilkan 1–12 dari 124 gambar")).toBeDefined();

		// Cek ellipsis pada banyak halaman
		expect(screen.getByText("Halaman lainnya")).toBeDefined();

		// Langsung klik halaman terakhir (11)
		const page11Btn = screen.getByRole("button", { name: "Halaman 11" });
		fireEvent.click(page11Btn);

		// Halaman 11 berisi 4 gambar sisa (124 - 120 = 4)
		expect(screen.getAllByRole("article")).toHaveLength(4);
		expect(
			screen.getByText("Menampilkan 121–124 dari 124 gambar"),
		).toBeDefined();

		const next = screen.getByRole("button", { name: "Halaman berikutnya" });
		expect(next.hasAttribute("disabled")).toBe(true);
	});

	// Skenario 6: 154 gambar dengan seluruhnya gagal
	it("6. 154 gambar seluruhnya gagal: tidak menampilkan pagination", () => {
		const images = Array.from({ length: 154 }, (_, i) =>
			mockImage(`failed-${i + 1}`, {
				status: "failed",
				failureCode: "WEBSITE_ACCESS_DENIED",
			}),
		);
		render(
			<ImagesResult
				images={images}
				sourceUrl="https://example.com"
				imageOutcome="all-failed"
			/>,
		);

		expect(screen.getByText("Gambar belum berhasil disimpan")).toBeDefined();
		expect(screen.getAllByText("154").length).toBeGreaterThan(0);
		expect(screen.queryByRole("article")).toBeNull();
		expect(screen.queryByRole("navigation", { name: "pagination" })).toBeNull();
	});

	// Skenario 7: Filter yang menyisakan 5 hasil
	it("7. filter yang menyisakan 5 hasil: menyembunyikan pagination karena <= 12", () => {
		const pngs = Array.from({ length: 15 }, (_, i) =>
			mockImage(`png-${i + 1}`, { format: "png" }),
		);
		const jpgs = Array.from({ length: 5 }, (_, i) =>
			mockImage(`jpg-${i + 1}`, { format: "jpg" }),
		);
		render(
			<ImagesResult
				images={[...pngs, ...jpgs]}
				sourceUrl="https://example.com"
			/>,
		);

		// Sebelum filter: 20 gambar -> ada pagination
		expect(screen.getAllByRole("article")).toHaveLength(12);
		expect(
			screen.getByRole("navigation", { name: "pagination" }),
		).toBeDefined();

		// Filter format ke "jpg" (5 hasil)
		const select = screen.getByLabelText("Format");
		fireEvent.change(select, { target: { value: "jpg" } });

		expect(screen.getByText("Menampilkan 5 dari 20 gambar")).toBeDefined();
		expect(screen.getAllByRole("article")).toHaveLength(5);
		// Karena hasil filter <= 12, pagination disembunyikan
		expect(screen.queryByRole("navigation", { name: "pagination" })).toBeNull();
	});

	// Skenario 8: Filter yang menyisakan 20 hasil
	it("8. filter yang menyisakan 20 hasil: pagination aktif dengan total 2 halaman", () => {
		const pngs = Array.from({ length: 20 }, (_, i) =>
			mockImage(`png-${i + 1}`, { format: "png" }),
		);
		const webps = Array.from({ length: 30 }, (_, i) =>
			mockImage(`webp-${i + 1}`, { format: "webp" }),
		);
		render(
			<ImagesResult
				images={[...pngs, ...webps]}
				sourceUrl="https://example.com"
			/>,
		);

		// Filter format ke "png" (20 hasil)
		const select = screen.getByLabelText("Format");
		fireEvent.change(select, { target: { value: "png" } });

		expect(screen.getByText("Menampilkan 20 dari 50 gambar")).toBeDefined();
		expect(screen.getAllByRole("article")).toHaveLength(12);
		expect(screen.getByText("Menampilkan 1–12 dari 20 gambar")).toBeDefined();

		// Halaman 2
		const page2Btn = screen.getByRole("button", { name: "Halaman 2" });
		fireEvent.click(page2Btn);
		expect(screen.getAllByRole("article")).toHaveLength(8);
		expect(screen.getByText("Menampilkan 13–20 dari 20 gambar")).toBeDefined();
	});

	// Skenario 9: Mengubah filter ketika berada di halaman terakhir
	it("9. mengubah filter ketika berada di halaman terakhir: me-reset ke halaman 1", () => {
		const pngs = Array.from({ length: 30 }, (_, i) =>
			mockImage(`png-${i + 1}`, { format: "png" }),
		);
		const jpgs = Array.from({ length: 15 }, (_, i) =>
			mockImage(`jpg-${i + 1}`, { format: "jpg" }),
		);
		render(
			<ImagesResult
				images={[...pngs, ...jpgs]}
				sourceUrl="https://example.com"
			/>,
		);

		// Filter ke "png" (30 gambar, 3 halaman: 12, 12, 6)
		const select = screen.getByLabelText("Format");
		fireEvent.change(select, { target: { value: "png" } });

		// Navigasi ke halaman terakhir (halaman 3)
		const page3Btn = screen.getByRole("button", { name: "Halaman 3" });
		fireEvent.click(page3Btn);
		expect(screen.getAllByRole("article")).toHaveLength(6);
		expect(screen.getByText("Menampilkan 25–30 dari 30 gambar")).toBeDefined();

		// Ubah filter ke "jpg" (15 gambar, 2 halaman)
		fireEvent.change(select, { target: { value: "jpg" } });

		// Harus otomatis reset ke halaman 1
		expect(screen.getAllByRole("article")).toHaveLength(12);
		expect(screen.getByText("Menampilkan 1–12 dari 15 gambar")).toBeDefined();

		// Klik Reset filter
		const resetBtn = screen.getByRole("button", { name: "Reset filter" });
		fireEvent.click(resetBtn);

		// Kembali ke semua gambar pada halaman 1
		expect(screen.getByText("45 gambar tersedia")).toBeDefined();
		expect(screen.getByText("Menampilkan 1–12 dari 45 gambar")).toBeDefined();
	});

	// Skenario 10: Navigasi Previous/Next
	it("10. navigasi Previous/Next bergerak maju dan mundur dengan benar", () => {
		const images = Array.from({ length: 25 }, (_, i) =>
			mockImage(`item-${i + 1}`),
		);
		render(<ImagesResult images={images} sourceUrl="https://example.com" />);

		const prev = screen.getByRole("button", { name: "Halaman sebelumnya" });
		const next = screen.getByRole("button", { name: "Halaman berikutnya" });

		// Halaman 1
		expect(screen.getByText("Menampilkan 1–12 dari 25 gambar")).toBeDefined();

		// Klik Next -> Halaman 2
		fireEvent.click(next);
		expect(screen.getByText("Menampilkan 13–24 dari 25 gambar")).toBeDefined();
		expect(screen.getAllByRole("article")).toHaveLength(12);

		// Klik Next -> Halaman 3
		fireEvent.click(next);
		expect(screen.getByText("Menampilkan 25–25 dari 25 gambar")).toBeDefined();
		expect(screen.getAllByRole("article")).toHaveLength(1);

		// Klik Prev -> Kembali ke Halaman 2
		fireEvent.click(prev);
		expect(screen.getByText("Menampilkan 13–24 dari 25 gambar")).toBeDefined();
		expect(screen.getAllByRole("article")).toHaveLength(12);
	});

	// Skenario 11: First/last page disabled state
	it("11. state disabled pada Previous (halaman 1) dan Next (halaman terakhir)", () => {
		const images = Array.from({ length: 24 }, (_, i) =>
			mockImage(`img-${i + 1}`),
		);
		render(<ImagesResult images={images} sourceUrl="https://example.com" />);

		const prev = screen.getByRole("button", { name: "Halaman sebelumnya" });
		const next = screen.getByRole("button", { name: "Halaman berikutnya" });

		// Di halaman 1: Previous disabled, Next enabled
		expect(prev.hasAttribute("disabled")).toBe(true);
		expect(next.hasAttribute("disabled")).toBe(false);

		// Pindah ke halaman 2 (terakhir)
		fireEvent.click(next);
		expect(prev.hasAttribute("disabled")).toBe(false);
		expect(next.hasAttribute("disabled")).toBe(true);

		// Klik Next saat disabled tidak merubah halaman
		fireEvent.click(next);
		expect(screen.getByText("Menampilkan 13–24 dari 24 gambar")).toBeDefined();
	});

	// Skenario 12: Image card actions tetap menggunakan data gambar yang benar
	it("12. aksi card pada halaman terpaginasi (halaman 2) beroperasi pada data gambar yang benar", async () => {
		const writeTextMock = vi.fn().mockResolvedValue(undefined);
		vi.stubGlobal("navigator", {
			clipboard: { writeText: writeTextMock },
		});

		const images = Array.from({ length: 15 }, (_, i) =>
			mockImage(`target-img-${i + 1}`),
		);
		render(<ImagesResult images={images} sourceUrl="https://example.com" />);

		// Pindah ke halaman 2
		const next = screen.getByRole("button", { name: "Halaman berikutnya" });
		fireEvent.click(next);

		// Halaman 2 memuat target-img-13, target-img-14, target-img-15
		expect(screen.getAllByText(/target-img-13\.png/).length).toBeGreaterThan(0);

		// Klik Salin URL sumber pada target-img-13
		const copyButtons = screen.getAllByRole("button", {
			name: "Salin URL sumber",
		});
		expect(copyButtons.length).toBeGreaterThan(0);
		fireEvent.click(copyButtons[0]);

		expect(writeTextMock).toHaveBeenCalledWith(
			"https://sample.example/target-img-13.png",
		);
	});

	// Skenario 13: Perubahan daftar gambar tidak menghasilkan invalid page
	it("13. perubahan daftar gambar tidak menyebabkan out-of-bounds page", () => {
		const initialImages = Array.from({ length: 36 }, (_, i) =>
			mockImage(`img-${i + 1}`),
		);
		const { rerender } = render(
			<ImagesResult images={initialImages} sourceUrl="https://example.com" />,
		);

		// Navigasi ke halaman 3
		const page3Btn = screen.getByRole("button", { name: "Halaman 3" });
		fireEvent.click(page3Btn);
		expect(screen.getByText("Menampilkan 25–36 dari 36 gambar")).toBeDefined();

		// Rerender dengan gambar yang menyusut ke 8 item (hanya 1 halaman)
		const reducedImages = Array.from({ length: 8 }, (_, i) =>
			mockImage(`shrunk-${i + 1}`),
		);
		rerender(
			<ImagesResult images={reducedImages} sourceUrl="https://example.com" />,
		);

		// Clamping mengembalikan safe page ke halaman 1 tanpa melempar error
		expect(screen.getByText("8 gambar tersedia")).toBeDefined();
		expect(screen.getAllByRole("article")).toHaveLength(8);
		// Karena <= 12, pagination disembunyikan
		expect(screen.queryByRole("navigation", { name: "pagination" })).toBeNull();
	});
});
