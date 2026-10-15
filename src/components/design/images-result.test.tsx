// @vitest-environment jsdom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type ImageResult, ImagesResult } from "./images-result";

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
	it("reports persisted counts without inventing totals", () => {
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
		expect(screen.getByText(/3 ditemukan/)).toBeDefined();
		expect(
			screen.getByText(/1 tersimpan · 1 tautan terverifikasi/),
		).toBeDefined();
		expect(screen.getByText(/1 gagal/)).toBeDefined();
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
		expect(screen.getByText(/1 gambar tidak dapat diambil/)).toBeDefined();
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
		expect(screen.getByText("Semua gambar gagal diambil")).toBeDefined();
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
	it("searches source and alt metadata", () => {
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
		fireEvent.change(screen.getByLabelText("Cari gambar"), {
			target: { value: "banner" },
		});
		expect(screen.getAllByRole("article")).toHaveLength(1);
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
});
