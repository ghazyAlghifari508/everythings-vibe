// @vitest-environment jsdom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	type ImageResult,
	ImagesResult,
	LOAD_MORE_BATCH_SIZE,
} from "../components/images-result";

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

function mockImage(
	id: string,
	partial: Partial<ImageResult> = {},
): ImageResult {
	return {
		id,
		scrapeId: "test-scrape",
		userId: "user-1",
		pageUrl: "https://example.com",
		url: `https://sample.example/${id}.png`,
		assetUrl: `https://sample.example/assets/${id}.png`,
		assetId: `asset-${id}`,
		format: "png",
		classification: null,
		evidence: { alt: null, sources: ["img"] },
		width: 640,
		height: 480,
		status: "completed",
		httpStatus: null,
		failureCode: null,
		error: null,
		...partial,
	};
}

describe("VibeScrape Images Explorer Progressive Load More (22 Skenario Wajib)", () => {
	// Skenario 1: 0 gambar
	it("1. 0 gambar: menampilkan empty state tanpa Load More", () => {
		render(
			<ImagesResult
				images={[]}
				sourceUrl="https://example.com"
				imageOutcome="empty"
			/>,
		);

		expect(screen.getByText("Tidak ada gambar yang ditemukan")).toBeDefined();
		expect(
			screen.queryByRole("button", { name: /Tampilkan.*gambar lagi/i }),
		).toBeNull();
		expect(screen.queryByRole("progressbar")).toBeNull();
		expect(screen.queryByRole("article")).toBeNull();
	});

	// Skenario 2: 1 gambar
	it("2. 1 gambar: menampilkan 1 card dan menyembunyikan Load More", () => {
		const images = [mockImage("img-1")];
		render(<ImagesResult images={images} sourceUrl="https://example.com" />);

		expect(screen.getByText("1 gambar tersedia")).toBeDefined();
		expect(screen.getAllByRole("article")).toHaveLength(1);
		expect(
			screen.queryByRole("button", { name: /Tampilkan.*gambar lagi/i }),
		).toBeNull();
		expect(screen.queryByRole("progressbar")).toBeNull();
	});

	// Skenario 3: 12 gambar
	it("3. tepat 12 gambar: menampilkan 12 card tanpa kontrol Load More", () => {
		expect(LOAD_MORE_BATCH_SIZE).toBe(12);
		const images = Array.from({ length: 12 }, (_, i) =>
			mockImage(`img-${i + 1}`),
		);
		render(<ImagesResult images={images} sourceUrl="https://example.com" />);

		expect(screen.getByText("12 gambar tersedia")).toBeDefined();
		expect(screen.getAllByRole("article")).toHaveLength(12);
		expect(
			screen.queryByRole("button", { name: /Tampilkan.*gambar lagi/i }),
		).toBeNull();
		expect(screen.queryByRole("progressbar")).toBeNull();
	});

	// Skenario 4: 13 gambar
	it("4. 13 gambar: awalnya 12, klik menampilkan 13 tanpa kehilangan gambar lama", () => {
		const images = Array.from({ length: 13 }, (_, i) =>
			mockImage(`img-${i + 1}`),
		);
		render(<ImagesResult images={images} sourceUrl="https://example.com" />);

		expect(screen.getByText("13 gambar tersedia")).toBeDefined();
		expect(screen.getAllByRole("article")).toHaveLength(12);

		// Footer menampilkan progres 12 dari 13
		expect(screen.getByText("Menampilkan 12 dari 13 gambar")).toBeDefined();
		const progress = screen.getByRole("progressbar");
		expect(progress.getAttribute("aria-valuenow")).toBe("12");
		expect(progress.getAttribute("aria-valuemax")).toBe("13");

		const loadMoreBtn = screen.getByRole("button", {
			name: "Tampilkan 1 gambar lagi",
		});
		expect(loadMoreBtn).toBeDefined();

		// Klik Load More
		fireEvent.click(loadMoreBtn);

		// Sekarang menampilkan 13 gambar (12 sebelumnya + 1 baru)
		expect(screen.getAllByRole("article")).toHaveLength(13);
		expect(screen.getAllByText(/img-1\.png/).length).toBeGreaterThan(0);
		expect(screen.getAllByText(/img-12\.png/).length).toBeGreaterThan(0);
		expect(screen.getAllByText(/img-13\.png/).length).toBeGreaterThan(0);

		// Summary terakumulasi dan tombol hilang
		expect(screen.getByText("Menampilkan 13 dari 13 gambar")).toBeDefined();
		expect(progress.getAttribute("aria-valuenow")).toBe("13");
		expect(
			screen.queryByRole("button", { name: /Tampilkan.*gambar lagi/i }),
		).toBeNull();
	});

	// Skenario 5: 24 gambar
	it("5. 24 gambar: awalnya 12, klik menampilkan 24", () => {
		const images = Array.from({ length: 24 }, (_, i) =>
			mockImage(`img-${i + 1}`),
		);
		render(<ImagesResult images={images} sourceUrl="https://example.com" />);

		expect(screen.getAllByRole("article")).toHaveLength(12);
		expect(screen.getByText("Menampilkan 12 dari 24 gambar")).toBeDefined();

		const loadMoreBtn = screen.getByRole("button", {
			name: "Tampilkan 12 gambar lagi",
		});
		fireEvent.click(loadMoreBtn);

		expect(screen.getAllByRole("article")).toHaveLength(24);
		expect(screen.getByText("Menampilkan 24 dari 24 gambar")).toBeDefined();
		expect(
			screen.queryByRole("button", { name: /Tampilkan.*gambar lagi/i }),
		).toBeNull();
	});

	// Skenario 6: 25 gambar (12 -> 24 -> 25)
	it("6. 25 gambar: 12 -> 24 -> 25 bertahap", () => {
		const images = Array.from({ length: 25 }, (_, i) =>
			mockImage(`img-${i + 1}`),
		);
		render(<ImagesResult images={images} sourceUrl="https://example.com" />);

		// Tahap 1: 12 item
		expect(screen.getAllByRole("article")).toHaveLength(12);
		expect(screen.getByText("Menampilkan 12 dari 25 gambar")).toBeDefined();

		// Klik 1: muat 12 lagi -> 24 item
		const loadMoreBtn1 = screen.getByRole("button", {
			name: "Tampilkan 12 gambar lagi",
		});
		fireEvent.click(loadMoreBtn1);

		expect(screen.getAllByRole("article")).toHaveLength(24);
		expect(screen.getByText("Menampilkan 24 dari 25 gambar")).toBeDefined();

		// Klik 2: muat 1 sisa -> 25 item
		const loadMoreBtn2 = screen.getByRole("button", {
			name: "Tampilkan 1 gambar lagi",
		});
		fireEvent.click(loadMoreBtn2);

		expect(screen.getAllByRole("article")).toHaveLength(25);
		expect(screen.getByText("Menampilkan 25 dari 25 gambar")).toBeDefined();
		expect(
			screen.queryByRole("button", { name: /Tampilkan.*gambar lagi/i }),
		).toBeNull();
	});

	// Skenario 7: 67 gambar (12 -> 24 -> 36 -> 48 -> 60 -> 67)
	it("7. 67 gambar: 12 -> 24 -> 36 -> 48 -> 60 -> 67 dengan urutan stabil", () => {
		const images = Array.from({ length: 67 }, (_, i) =>
			mockImage(`img-${String(i + 1).padStart(2, "0")}`),
		);
		render(<ImagesResult images={images} sourceUrl="https://example.com" />);

		const steps = [
			{ count: 12, label: "Tampilkan 12 gambar lagi", next: 24 },
			{ count: 24, label: "Tampilkan 12 gambar lagi", next: 36 },
			{ count: 36, label: "Tampilkan 12 gambar lagi", next: 48 },
			{ count: 48, label: "Tampilkan 12 gambar lagi", next: 60 },
			{ count: 60, label: "Tampilkan 7 gambar lagi", next: 67 },
		];

		for (const step of steps) {
			expect(screen.getAllByRole("article")).toHaveLength(step.count);
			expect(
				screen.getByText(`Menampilkan ${step.count} dari 67 gambar`),
			).toBeDefined();

			const btn = screen.getByRole("button", { name: step.label });
			fireEvent.click(btn);
		}

		// Terakhir: 67 gambar selesai
		expect(screen.getAllByRole("article")).toHaveLength(67);
		expect(screen.getByText("Menampilkan 67 dari 67 gambar")).toBeDefined();
		expect(
			screen.queryByRole("button", { name: /Tampilkan.*gambar lagi/i }),
		).toBeNull();

		// Pastikan urutan gambar awal sampai akhir tetap stabil
		const articles = screen.getAllByRole("article");
		expect(articles[0].textContent).toContain("img-01.png");
		expect(articles[11].textContent).toContain("img-12.png");
		expect(articles[23].textContent).toContain("img-24.png");
		expect(articles[59].textContent).toContain("img-60.png");
		expect(articles[66].textContent).toContain("img-67.png");
	});

	// Skenario 8: 124 gambar (setiap klik menambah maksimal 12 tanpa kehilangan gambar lama)
	it("8. 124 gambar: setiap klik menambah maksimal 12 tanpa kehilangan gambar lama", () => {
		const images = Array.from({ length: 124 }, (_, i) =>
			mockImage(`img-${i + 1}`),
		);
		render(<ImagesResult images={images} sourceUrl="https://example.com" />);

		expect(screen.getAllByRole("article")).toHaveLength(12);
		expect(screen.getByText("Menampilkan 12 dari 124 gambar")).toBeDefined();

		// Klik 1: 24
		fireEvent.click(
			screen.getByRole("button", { name: "Tampilkan 12 gambar lagi" }),
		);
		expect(screen.getAllByRole("article")).toHaveLength(24);
		expect(screen.getByText("Menampilkan 24 dari 124 gambar")).toBeDefined();

		// Klik 2: 36
		fireEvent.click(
			screen.getByRole("button", { name: "Tampilkan 12 gambar lagi" }),
		);
		expect(screen.getAllByRole("article")).toHaveLength(36);
		expect(screen.getByText("Menampilkan 36 dari 124 gambar")).toBeDefined();

		// Gambar ke-1 dan ke-24 tetap ada di DOM
		expect(screen.getAllByText(/img-1\.png/).length).toBeGreaterThan(0);
		expect(screen.getAllByText(/img-24\.png/).length).toBeGreaterThan(0);
		expect(screen.getAllByText(/img-36\.png/).length).toBeGreaterThan(0);
	});

	// Skenario 9: Semua gambar gagal
	it("9. semua gambar gagal: tidak ada gallery cards atau Load More", () => {
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
		expect(
			screen.queryByRole("button", { name: /Tampilkan.*gambar lagi/i }),
		).toBeNull();
		expect(screen.queryByRole("progressbar")).toBeNull();
	});

	// Skenario 10: Sebagian gambar gagal
	it("10. sebagian gambar gagal: hanya gambar berhasil yang dihitung dan ditampilkan", () => {
		const successful = Array.from({ length: 20 }, (_, i) =>
			mockImage(`ok-${i + 1}`),
		);
		const failed = Array.from({ length: 10 }, (_, i) =>
			mockImage(`bad-${i + 1}`, {
				status: "failed",
				failureCode: "REMOTE_TIMEOUT",
			}),
		);
		render(
			<ImagesResult
				images={[...successful, ...failed]}
				sourceUrl="https://example.com"
				imageOutcome="partial"
			/>,
		);

		// Verified = 20 (bukan 30)
		expect(screen.getByText("20 gambar tersedia")).toBeDefined();
		expect(screen.getAllByRole("article")).toHaveLength(12);
		expect(screen.getByText("Menampilkan 12 dari 20 gambar")).toBeDefined();

		const loadMoreBtn = screen.getByRole("button", {
			name: "Tampilkan 8 gambar lagi",
		});
		fireEvent.click(loadMoreBtn);

		// Semua 20 gambar berhasil tampil
		expect(screen.getAllByRole("article")).toHaveLength(20);
		expect(screen.getByText("Menampilkan 20 dari 20 gambar")).toBeDefined();
		expect(
			screen.queryByRole("button", { name: /Tampilkan.*gambar lagi/i }),
		).toBeNull();
	});

	// Skenario 11: Filter menyisakan 5
	it("11. filter menyisakan 5: tampilkan 5, tanpa Load More", () => {
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

		// Sebelum filter: 20 gambar -> ada tombol Load More
		expect(screen.getAllByRole("article")).toHaveLength(12);
		expect(
			screen.getByRole("button", { name: "Tampilkan 8 gambar lagi" }),
		).toBeDefined();

		// Filter format ke "jpg" (5 hasil)
		const select = screen.getByLabelText("Format");
		fireEvent.change(select, { target: { value: "jpg" } });

		expect(screen.getByText("Menampilkan 5 dari 20 gambar")).toBeDefined();
		expect(screen.getAllByRole("article")).toHaveLength(5);
		// Karena hasil filter <= 12, footer Load More disembunyikan
		expect(
			screen.queryByRole("button", { name: /Tampilkan.*gambar lagi/i }),
		).toBeNull();
		expect(screen.queryByRole("progressbar")).toBeNull();
	});

	// Skenario 12: Filter menyisakan 20
	it("12. filter menyisakan 20: awalnya 12, klik menampilkan 20", () => {
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
		expect(screen.getByText("Menampilkan 12 dari 20 gambar")).toBeDefined();

		const loadMoreBtn = screen.getByRole("button", {
			name: "Tampilkan 8 gambar lagi",
		});
		fireEvent.click(loadMoreBtn);

		expect(screen.getAllByRole("article")).toHaveLength(20);
		expect(screen.getByText("Menampilkan 20 dari 20 gambar")).toBeDefined();
		expect(
			screen.queryByRole("button", { name: /Tampilkan.*gambar lagi/i }),
		).toBeNull();
	});

	// Skenario 13: Filter berubah setelah ekspansi
	it("13. filter berubah setelah ekspansi: reset limit ke 12", () => {
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

		// Filter ke "png" (30 gambar)
		const select = screen.getByLabelText("Format");
		fireEvent.change(select, { target: { value: "png" } });

		// Ekspansi ke 24 gambar
		const loadMoreBtn = screen.getByRole("button", {
			name: "Tampilkan 12 gambar lagi",
		});
		fireEvent.click(loadMoreBtn);
		expect(screen.getAllByRole("article")).toHaveLength(24);
		expect(screen.getByText("Menampilkan 24 dari 30 gambar")).toBeDefined();

		// Ubah filter ke "jpg" (15 gambar)
		fireEvent.change(select, { target: { value: "jpg" } });

		// Wajib me-reset visible limit ke 12
		expect(screen.getAllByRole("article")).toHaveLength(12);
		expect(screen.getByText("Menampilkan 12 dari 15 gambar")).toBeDefined();
		expect(
			screen.getByRole("button", { name: "Tampilkan 3 gambar lagi" }),
		).toBeDefined();
	});

	// Skenario 14: Reset filter
	it("14. reset filter: kembali ke 12 gambar pertama dari seluruh hasil berhasil", () => {
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

		// Terapkan filter "jpg"
		const select = screen.getByLabelText("Format");
		fireEvent.change(select, { target: { value: "jpg" } });

		// Klik Reset filter
		const resetBtn = screen.getByRole("button", { name: "Reset filter" });
		fireEvent.click(resetBtn);

		// Kembali ke ringkasan total dan 12 gambar pertama
		expect(screen.getByText("45 gambar tersedia")).toBeDefined();
		expect(screen.getByText("Menampilkan 12 dari 45 gambar")).toBeDefined();
		expect(screen.getAllByRole("article")).toHaveLength(12);
		expect(
			screen.getByRole("button", { name: "Tampilkan 12 gambar lagi" }),
		).toBeDefined();
	});

	// Skenario 15: Filter menghasilkan 0
	it("15. filter menghasilkan 0: existing filter empty state tetap benar", () => {
		const images = [
			mockImage("img-1", { format: "png", classification: "logo" }),
			mockImage("img-2", { format: "webp", classification: "icon" }),
		];
		render(<ImagesResult images={images} sourceUrl="https://example.com" />);

		fireEvent.change(screen.getByLabelText("Format"), {
			target: { value: "png" },
		});
		fireEvent.change(screen.getByLabelText("Jenis"), {
			target: { value: "icon" },
		});
		expect(
			screen.getByText("Tidak ada gambar yang sesuai filter."),
		).toBeDefined();
		expect(screen.queryByRole("article")).toBeNull();
		expect(
			screen.queryByRole("button", { name: /Tampilkan.*gambar lagi/i }),
		).toBeNull();
		expect(screen.queryByRole("progressbar")).toBeNull();
		expect(screen.getByRole("button", { name: "Reset filter" })).toBeDefined();
	});

	// Skenario 16: Props gambar berkurang
	it("16. props gambar berkurang: tidak ada out-of-bounds atau jumlah keliru", () => {
		const initialImages = Array.from({ length: 36 }, (_, i) =>
			mockImage(`img-${i + 1}`),
		);
		const { rerender } = render(
			<ImagesResult images={initialImages} sourceUrl="https://example.com" />,
		);

		// Ekspansi ke 24 gambar
		fireEvent.click(
			screen.getByRole("button", { name: "Tampilkan 12 gambar lagi" }),
		);
		expect(screen.getAllByRole("article")).toHaveLength(24);
		expect(screen.getByText("Menampilkan 24 dari 36 gambar")).toBeDefined();

		// Rerender dengan gambar yang menyusut ke 8 item
		const reducedImages = Array.from({ length: 8 }, (_, i) =>
			mockImage(`shrunk-${i + 1}`),
		);
		rerender(
			<ImagesResult images={reducedImages} sourceUrl="https://example.com" />,
		);

		// Menampilkan 8 item aman tanpa melempar error, footer load more hilang karena <= 12
		expect(screen.getByText("8 gambar tersedia")).toBeDefined();
		expect(screen.getAllByRole("article")).toHaveLength(8);
		expect(
			screen.queryByRole("button", { name: /Tampilkan.*gambar lagi/i }),
		).toBeNull();
		expect(screen.queryByRole("progressbar")).toBeNull();
	});

	// Skenario 17: Props gambar bertambah
	it("17. props gambar bertambah: limit yang berlaku tetap konsisten", () => {
		const initialImages = Array.from({ length: 10 }, (_, i) =>
			mockImage(`initial-${i + 1}`),
		);
		const { rerender } = render(
			<ImagesResult images={initialImages} sourceUrl="https://example.com" />,
		);

		// 10 gambar: tampil semua, tanpa Load More
		expect(screen.getAllByRole("article")).toHaveLength(10);
		expect(
			screen.queryByRole("button", { name: /Tampilkan.*gambar lagi/i }),
		).toBeNull();

		// Props bertambah ke 25 gambar
		const expandedImages = Array.from({ length: 25 }, (_, i) =>
			mockImage(`expanded-${i + 1}`),
		);
		rerender(
			<ImagesResult images={expandedImages} sourceUrl="https://example.com" />,
		);

		// Tetap mematuhi limit 12 awal dan menampilkan tombol Load More
		expect(screen.getAllByRole("article")).toHaveLength(12);
		expect(screen.getByText("Menampilkan 12 dari 25 gambar")).toBeDefined();
		expect(
			screen.getByRole("button", { name: "Tampilkan 12 gambar lagi" }),
		).toBeDefined();
	});

	// Skenario 18: Download gambar tambahan
	it("18. download gambar tambahan: operasi terhadap gambar yang benar", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			blob: () =>
				Promise.resolve(new Blob(["fake-image-bytes"], { type: "image/png" })),
		});
		vi.stubGlobal("fetch", fetchMock);
		vi.stubGlobal("URL", {
			createObjectURL: vi.fn(() => "blob:sample-download-url"),
			revokeObjectURL: vi.fn(),
		});

		const images = Array.from({ length: 15 }, (_, i) =>
			mockImage(`target-img-${i + 1}`),
		);
		render(<ImagesResult images={images} sourceUrl="https://example.com" />);

		// Klik Load More untuk memuat gambar ke-13, 14, 15
		const loadMoreBtn = screen.getByRole("button", {
			name: "Tampilkan 3 gambar lagi",
		});
		fireEvent.click(loadMoreBtn);

		expect(screen.getAllByRole("article")).toHaveLength(15);
		expect(screen.getAllByText(/target-img-13\.png/).length).toBeGreaterThan(0);

		// Unduh gambar target-img-13
		const downloadButtons = screen.getAllByRole("button", {
			name: "Download gambar",
		});
		expect(downloadButtons).toHaveLength(15);
		fireEvent.click(downloadButtons[12]);

		await waitFor(() => {
			expect(fetchMock).toHaveBeenCalledWith(
				"https://sample.example/assets/target-img-13.png",
			);
		});
	});

	// Skenario 19: Copy URL gambar tambahan
	it("19. copy URL gambar tambahan: menyalin URL gambar yang benar", async () => {
		const writeTextMock = vi.fn().mockResolvedValue(undefined);
		vi.stubGlobal("navigator", {
			clipboard: { writeText: writeTextMock },
		});

		const images = Array.from({ length: 15 }, (_, i) =>
			mockImage(`target-img-${i + 1}`),
		);
		render(<ImagesResult images={images} sourceUrl="https://example.com" />);

		// Klik Load More
		fireEvent.click(
			screen.getByRole("button", { name: "Tampilkan 3 gambar lagi" }),
		);

		// Klik Salin URL sumber pada target-img-13 (index 12)
		const copyButtons = screen.getAllByRole("button", {
			name: "Salin URL sumber",
		});
		expect(copyButtons).toHaveLength(15);
		fireEvent.click(copyButtons[12]);

		expect(writeTextMock).toHaveBeenCalledWith(
			"https://sample.example/target-img-13.png",
		);
	});

	// Skenario 20: Asset URL expired pada gambar tambahan
	it("20. asset URL expired: refresh/retry tetap berfungsi pada gambar tambahan", async () => {
		const fetcher = vi
			.fn()
			.mockResolvedValueOnce(
				Response.json(
					{ error: { code: "CAPABILITY_EXPIRED", retryable: false } },
					{ status: 401 },
				),
			)
			.mockResolvedValueOnce(
				Response.json({
					scrape: {
						images: [
							{
								id: "target-img-13",
								assetUrl: "/api/scrape/asset?cap=refreshed-13",
							},
						],
					},
				}),
			);
		vi.stubGlobal("fetch", fetcher);

		const images = Array.from({ length: 15 }, (_, i) =>
			mockImage(`target-img-${i + 1}`),
		);
		const { container } = render(
			<ImagesResult images={images} sourceUrl="https://example.com" />,
		);

		// Muat gambar tambahan
		fireEvent.click(
			screen.getByRole("button", { name: "Tampilkan 3 gambar lagi" }),
		);

		const allImgs = container.querySelectorAll("img");
		expect(allImgs).toHaveLength(15);

		// Simulasikan error loading pada gambar ke-13
		const img13 = allImgs[12];
		fireEvent.error(img13);

		await waitFor(() =>
			expect(screen.getByRole("button", { name: "Coba lagi" })).toBeDefined(),
		);

		fireEvent.click(screen.getByRole("button", { name: "Coba lagi" }));

		await waitFor(() => {
			const updatedImgs = container.querySelectorAll("img");
			expect(updatedImgs[12].getAttribute("src")).toBe(
				"/api/scrape/asset?cap=refreshed-13",
			);
		});
	});

	// Skenario 21: Batch terakhir selesai
	it("21. batch terakhir selesai: tidak ada tombol Load More", () => {
		const images = Array.from({ length: 24 }, (_, i) =>
			mockImage(`img-${i + 1}`),
		);
		render(<ImagesResult images={images} sourceUrl="https://example.com" />);

		const loadMoreBtn = screen.getByRole("button", {
			name: "Tampilkan 12 gambar lagi",
		});
		fireEvent.click(loadMoreBtn);

		// Setelah semua termuat, tombol hilang
		expect(
			screen.queryByRole("button", { name: /Tampilkan.*gambar lagi/i }),
		).toBeNull();
		// Ringkasan progres tetap tampil
		expect(screen.getByText("Menampilkan 24 dari 24 gambar")).toBeDefined();
		const progress = screen.getByRole("progressbar");
		expect(progress.getAttribute("aria-valuenow")).toBe("24");
	});

	// Skenario 22: Keyboard interaction
	it("22. keyboard interaction: tombol dapat difokus dan diaktifkan", () => {
		const images = Array.from({ length: 25 }, (_, i) =>
			mockImage(`img-${i + 1}`),
		);
		render(<ImagesResult images={images} sourceUrl="https://example.com" />);

		const loadMoreBtn = screen.getByRole("button", {
			name: "Tampilkan 12 gambar lagi",
		});

		// Dapat menerima focus
		loadMoreBtn.focus();
		expect(document.activeElement).toBe(loadMoreBtn);

		// Dapat diaktifkan via click / keyboard trigger
		fireEvent.click(loadMoreBtn);
		expect(screen.getAllByRole("article")).toHaveLength(24);
	});
});
