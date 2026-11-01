// @vitest-environment jsdom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type ImageResult, ImagesResult } from "../components/images-result";

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

function row(partial: Partial<ImageResult> & { id: string }): ImageResult {
	return {
		scrapeId: "scrape-1",
		userId: "user-1",
		url: `https://sample.example/${partial.id}.png`,
		pageUrl: "https://sample.example/",
		format: "png",
		width: 800,
		height: 600,
		classification: null,
		evidence: { alt: null, sources: ["img"] },
		status: "completed",
		assetId: null,
		httpStatus: null,
		failureCode: null,
		error: null,
		assetUrl: `https://sample.example/assets/${partial.id}.png`,
		...partial,
	};
}

describe("ImagesResult gallery", () => {
	it("summarises saved images once and keeps counters out of the result header", () => {
		render(
			<ImagesResult
				images={[
					row({ id: "a", format: "png", assetId: "stored" }),
					row({ id: "b", format: "webp", classification: "logo" }),
					row({ id: "c", status: "failed", error: "timeout" }),
				]}
				sourceUrl="https://sample.example/"
			/>,
		);
		expect(screen.getByText("2 gambar tersedia")).toBeDefined();
		expect(screen.getByText("1 gambar tidak berhasil diambil")).toBeDefined();
		// The result area never repeats the counters the progress card owns.
		expect(screen.queryByText("Ditemukan")).toBeNull();
		expect(screen.queryByText(/ditemukan ·/)).toBeNull();
	});

	it("filters by format and kind independently with a reset", () => {
		render(
			<ImagesResult
				images={[
					row({ id: "a", format: "png", classification: "logo" }),
					row({ id: "b", format: "webp", classification: "icon" }),
				]}
				sourceUrl="https://sample.example/"
			/>,
		);
		expect(screen.getAllByRole("article")).toHaveLength(2);
		fireEvent.change(screen.getByLabelText("Format"), {
			target: { value: "png" },
		});
		expect(screen.getAllByRole("article")).toHaveLength(1);
		fireEvent.change(screen.getByLabelText("Jenis"), {
			target: { value: "icon" },
		});
		expect(screen.queryByRole("article")).toBeNull();
		fireEvent.click(screen.getByRole("button", { name: "Reset filter" }));
		expect(screen.getAllByRole("article")).toHaveLength(2);
	});

	it("keeps failures in a disclosure instead of a raw block", () => {
		render(
			<ImagesResult
				images={[
					row({ id: "a", format: "png" }),
					row({ id: "b", status: "failed", error: "timeout" }),
				]}
				sourceUrl="https://sample.example/"
			/>,
		);
		expect(screen.getAllByRole("article")).toHaveLength(1);
		expect(screen.getByText(/1 gambar tidak berhasil diambil/)).toBeDefined();
		expect(
			screen.getByRole("button", { name: /Lihat rincian kegagalan/ }),
		).toBeDefined();
	});

	it("separates a truthful empty result from a failed capture", () => {
		const { unmount } = render(
			<ImagesResult
				images={[]}
				sourceUrl="https://sample.example/"
				imageOutcome="empty"
			/>,
		);
		expect(screen.getByText("Tidak ada gambar yang ditemukan")).toBeDefined();
		unmount();
		render(
			<ImagesResult
				images={[row({ id: "a", status: "failed", error: "blocked" })]}
				sourceUrl="https://sample.example/"
				imageOutcome="all-failed"
			/>,
		);
		expect(screen.getByText("Gambar belum berhasil disimpan")).toBeDefined();
	});
	it("loads without a duplicate request and removes failed browser image markup", async () => {
		const fetcher = vi.fn().mockResolvedValue(
			Response.json(
				{
					error: {
						code: "PROXY_RATE_LIMITED",
						retryable: true,
						retryAfterSeconds: 60,
					},
				},
				{ status: 429 },
			),
		);
		vi.stubGlobal("fetch", fetcher);
		const { container } = render(
			<ImagesResult
				images={[row({ id: "a" })]}
				sourceUrl="https://sample.example/"
			/>,
		);
		expect(screen.getByRole("status").textContent).toContain("Memuat gambar");
		expect(fetcher).not.toHaveBeenCalled();
		const image = container.querySelector("img");
		if (!image) throw new Error("Missing image");
		fireEvent.error(image);
		await waitFor(() => expect(screen.getByText(/Batas proxy/)).toBeDefined());
		expect(container.querySelector("img")).toBeNull();
		expect(
			screen
				.getByRole("button", { name: /Coba lagi/ })
				.hasAttribute("disabled"),
		).toBe(true);
	});
	it("exposes no search field for a gallery without searchable names", () => {
		render(
			<ImagesResult
				images={[
					row({
						id: "a",
						evidence: { alt: "Sample banner", sources: ["img"] },
					}),
					row({ id: "b" }),
				]}
				sourceUrl="https://sample.example/"
			/>,
		);
		expect(screen.queryByLabelText("Cari gambar")).toBeNull();
		expect(screen.queryByRole("searchbox")).toBeNull();
		expect(screen.queryAllByRole("textbox")).toHaveLength(0);
		expect(screen.getAllByRole("article")).toHaveLength(2);
	});

	it("explains an empty filtered result and keeps the reset available", () => {
		render(
			<ImagesResult
				images={[
					row({ id: "a", format: "png", classification: "logo" }),
					row({ id: "b", format: "webp", classification: "icon" }),
				]}
				sourceUrl="https://sample.example/"
			/>,
		);
		fireEvent.change(screen.getByLabelText("Format"), {
			target: { value: "png" },
		});
		fireEvent.change(screen.getByLabelText("Jenis"), {
			target: { value: "icon" },
		});
		expect(screen.queryByRole("article")).toBeNull();
		expect(
			screen.getByText("Tidak ada gambar yang sesuai filter."),
		).toBeDefined();
		fireEvent.click(screen.getByRole("button", { name: "Reset filter" }));
		expect(screen.getAllByRole("article")).toHaveLength(2);
	});

	it("opens the original image and copies its source URL", async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		vi.stubGlobal("navigator", { clipboard: { writeText } });
		render(
			<ImagesResult
				images={[row({ id: "a" })]}
				sourceUrl="https://sample.example/"
			/>,
		);
		const original = screen.getByRole("link", { name: "Buka gambar asli" });
		expect(original.getAttribute("href")).toBe("https://sample.example/a.png");
		expect(original.getAttribute("target")).toBe("_blank");
		fireEvent.click(screen.getByRole("button", { name: "Salin URL sumber" }));
		await waitFor(() =>
			expect(writeText).toHaveBeenCalledWith("https://sample.example/a.png"),
		);
	});

	it("keeps a minimal labelled control set across themes and viewports", () => {
		document.documentElement.classList.add("dark");
		render(
			<ImagesResult
				images={[row({ id: "a", format: "png", classification: "logo" })]}
				sourceUrl="https://sample.example/"
			/>,
		);
		expect(
			screen.getByRole("region", { name: "Images Explorer" }),
		).toBeDefined();
		expect(screen.getAllByRole("combobox")).toHaveLength(2);
		expect(screen.getByText("1 gambar tersedia")).toBeDefined();
		expect(
			screen.getByRole("button", { name: "Download gambar" }),
		).toBeDefined();
		expect(
			screen.getByRole("link", { name: "Buka gambar asli" }),
		).toBeDefined();
		expect(
			screen.getByRole("button", { name: "Salin URL sumber" }),
		).toBeDefined();
		document.documentElement.classList.remove("dark");
	});

	it("refreshes an expired capability and retries only the failed image", async () => {
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
						images: [{ id: "a", assetUrl: "/api/scrape/asset?cap=fresh" }],
					},
				}),
			);
		vi.stubGlobal("fetch", fetcher);
		const { container } = render(
			<ImagesResult
				images={[row({ id: "a" })]}
				sourceUrl="https://sample.example/"
			/>,
		);
		const image = container.querySelector("img");
		if (!image) throw new Error("Missing image");
		fireEvent.error(image);
		await waitFor(() =>
			expect(screen.getByRole("button", { name: "Coba lagi" })).toBeDefined(),
		);
		fireEvent.click(screen.getByRole("button", { name: "Coba lagi" }));
		await waitFor(() =>
			expect(container.querySelector("img")?.getAttribute("src")).toBe(
				"/api/scrape/asset?cap=fresh",
			),
		);
		fireEvent.load(container.querySelector("img") ?? image);
		expect(screen.queryByRole("status")).toBeNull();
		expect(fetcher).toHaveBeenCalledTimes(2);
		fetcher.mockResolvedValueOnce(
			Response.json(
				{ error: { code: "REMOTE_ACCESS_DENIED", retryable: false } },
				{ status: 403 },
			),
		);
		fireEvent.click(screen.getByRole("button", { name: "Download gambar" }));
		await waitFor(() =>
			expect(fetcher).toHaveBeenLastCalledWith("/api/scrape/asset?cap=fresh"),
		);
		await waitFor(() =>
			expect(screen.getByRole("alert").textContent).toContain(
				"Sumber menolak akses",
			),
		);
	});
	it("honors download cooldown without refetching the thumbnail", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(
				Response.json(
					{
						error: {
							code: "PROXY_RATE_LIMITED",
							retryable: true,
							retryAfterSeconds: 60,
						},
					},
					{ status: 429 },
				),
			),
		);
		render(
			<ImagesResult
				images={[row({ id: "a" })]}
				sourceUrl="https://sample.example/"
			/>,
		);
		fireEvent.click(screen.getByRole("button", { name: "Download gambar" }));
		await waitFor(() =>
			expect(screen.getByRole("alert").textContent).toContain("Batas proxy"),
		);
		expect(
			screen
				.getByRole("button", { name: "Download gambar" })
				.hasAttribute("disabled"),
		).toBe(true);
	});

	it("shows one plain gallery summary and no failure surface on complete success", () => {
		render(
			<ImagesResult
				images={[
					row({ id: "1", format: "png" }),
					row({ id: "2", format: "webp" }),
				]}
				sourceUrl="https://example.com"
				imageOutcome="complete"
			/>,
		);
		expect(screen.getByText("2 gambar tersedia")).toBeDefined();
		expect(screen.getAllByRole("article")).toHaveLength(2);
		expect(screen.queryByRole("alert")).toBeNull();
		expect(screen.queryByText(/tidak berhasil diambil/)).toBeNull();
		expect(screen.queryByText("Gambar belum berhasil disimpan")).toBeNull();
		expect(screen.queryByText("Ditemukan")).toBeNull();
	});

	it("groups identical failures without duplicating error text and supports progressive disclosure", () => {
		const failedSvgs = Array.from({ length: 23 }, (_, i) =>
			row({
				id: `svg-${i}`,
				status: "failed",
				format: "svg",
				failureCode: "UNSUPPORTED_FORMAT",
				url: `https://images.ctfassets.net/image-${i}.svg`,
				error: "SVG tidak disimpan karena keamanan",
			}),
		);
		const successful = [
			row({ id: "ok-1", format: "png" }),
			row({ id: "ok-2", format: "png" }),
		];

		render(
			<ImagesResult
				images={[...successful, ...failedSvgs]}
				sourceUrl="https://example.com"
				imageOutcome="partial"
			/>,
		);

		// Shows one light partial-failure notice with the real failed count
		expect(screen.getByText(/23 gambar tidak berhasil diambil/)).toBeDefined();
		// Gallery of successful images is still visible
		expect(screen.getAllByRole("article")).toHaveLength(2);

		// Progressive disclosure starts closed
		const toggleButton = screen.getByRole("button", {
			name: /Lihat rincian kegagalan/,
		});
		expect(toggleButton.getAttribute("aria-expanded")).toBe("false");
		expect(screen.queryByText("images.ctfassets.net")).toBeNull();

		// Opening disclosure reveals the typed group and affected items
		fireEvent.click(toggleButton);
		expect(toggleButton.getAttribute("aria-expanded")).toBe("true");
		expect(screen.getByText("Format belum didukung (23)")).toBeDefined();
		expect(screen.getAllByText("images.ctfassets.net").length).toBeGreaterThan(
			0,
		);
		expect(screen.getAllByTitle("Buka gambar asli di tab baru").length).toBe(
			23,
		);
		expect(screen.getAllByTitle("Salin URL sumber").length).toBe(23 + 2); // 23 in disclosure + 2 in gallery

		// Clicking again collapses disclosure
		fireEvent.click(toggleButton);
		expect(toggleButton.getAttribute("aria-expanded")).toBe("false");
		expect(screen.queryByText("images.ctfassets.net")).toBeNull();
	});

	it("keeps typed failure groups behind the disclosure on partial failures", () => {
		const failed = [
			row({ id: "f1", status: "failed", httpStatus: 403 }),
			row({ id: "f2", status: "failed", failureCode: "WEBSITE_RATE_LIMITED" }),
			row({ id: "f3", status: "failed", failureCode: "WEBSITE_ACCESS_DENIED" }),
			row({ id: "f4", status: "failed", failureCode: "REMOTE_ACCESS_DENIED" }),
			row({ id: "f5", status: "failed", failureCode: "UNSUPPORTED_FORMAT" }),
			row({ id: "f6", status: "failed", failureCode: "UNSUPPORTED_MIME" }),
			row({ id: "f7", status: "failed", failureCode: "FETCH_TIMEOUT" }),
		];
		const successful = Array.from({ length: 23 }, (_, i) =>
			row({ id: `ok-${i}`, format: "jpg" }),
		);

		render(
			<ImagesResult
				images={[...successful, ...failed]}
				sourceUrl="https://www.example.com"
				imageOutcome="partial"
			/>,
		);

		expect(screen.getByText("7 gambar tidak berhasil diambil")).toBeDefined();
		expect(screen.getAllByRole("article")).toHaveLength(23);
		// Partial failures stay one light notice; group counts wait for the toggle.
		expect(screen.queryByText(/Akses tidak tersedia/)).toBeNull();
		fireEvent.click(
			screen.getByRole("button", { name: /Lihat rincian kegagalan/ }),
		);
		expect(screen.getByText("Akses tidak tersedia (4)")).toBeDefined();
		expect(screen.getByText("Format belum didukung (2)")).toBeDefined();
		expect(screen.getByText("Gangguan sementara (1)")).toBeDefined();
	});

	it("owns the all-failed state with real counts, causes and no empty gallery chrome", () => {
		const failed = [
			...Array.from({ length: 152 }, (_, i) =>
				row({
					id: `access-${i}`,
					status: "failed",
					httpStatus: 403,
					url: `https://images.ctfassets.net/access-${i}.webp`,
				}),
			),
			...Array.from({ length: 2 }, (_, i) =>
				row({
					id: `temporary-${i}`,
					status: "failed",
					failureCode: "FETCH_TIMEOUT",
				}),
			),
		];

		render(
			<ImagesResult
				images={failed}
				discoveredImages={154}
				sourceUrl="https://www.framer.com/"
				imageOutcome="all-failed"
			/>,
		);

		expect(screen.getByText("Gambar belum berhasil disimpan")).toBeDefined();
		expect(screen.getByText("Ditemukan")).toBeDefined();
		expect(screen.getByText("154")).toBeDefined();
		expect(screen.getByText("Tersimpan")).toBeDefined();
		expect(screen.getByText("0")).toBeDefined();
		expect(screen.getByText("Akses tidak tersedia")).toBeDefined();
		expect(screen.getByText("152")).toBeDefined();
		expect(screen.getByText("Gangguan sementara")).toBeDefined();
		expect(screen.getByText("2")).toBeDefined();

		// No filters, no gallery summary, no second empty state.
		expect(screen.queryByLabelText("Format")).toBeNull();
		expect(screen.queryByLabelText("Jenis")).toBeNull();
		expect(screen.queryByText(/gambar tersedia/)).toBeNull();
		expect(screen.queryByText("Semua gambar gagal diambil")).toBeNull();
		expect(screen.queryAllByRole("article")).toHaveLength(0);

		// The URL list stays behind the disclosure.
		expect(screen.queryAllByTitle("Buka gambar asli di tab baru")).toHaveLength(
			0,
		);
		fireEvent.click(screen.getByRole("button", { name: /Lihat rincian/ }));
		expect(screen.getAllByTitle("Buka gambar asli di tab baru")).toHaveLength(
			154,
		);
	});

	it("never repeats the same failure copy or counter twice", () => {
		render(
			<ImagesResult
				images={Array.from({ length: 4 }, (_, i) =>
					row({ id: `f-${i}`, status: "failed", httpStatus: 403 }),
				)}
				discoveredImages={4}
				sourceUrl="https://example.com"
				imageOutcome="all-failed"
			/>,
		);
		expect(screen.getAllByText("Gambar belum berhasil disimpan")).toHaveLength(
			1,
		);
		expect(screen.getAllByText("Akses tidak tersedia")).toHaveLength(1);
		expect(screen.getAllByText("Ditemukan")).toHaveLength(1);
		expect(screen.getAllByText("Tersimpan")).toHaveLength(1);
	});
});
