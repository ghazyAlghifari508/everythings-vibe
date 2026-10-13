// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { type ImageResult, ImagesResult } from "./images-result";

afterEach(() => {
	cleanup();
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
		error: null,
		assetUrl: `https://sample.example/assets/${partial.id}.png`,
		...partial,
	} as ImageResult;
}

describe("ImagesResult gallery", () => {
	it("reports persisted counts without inventing totals", () => {
		render(
			<ImagesResult
				images={[
					row({ id: "a", format: "png" }),
					row({ id: "b", format: "webp", classification: "logo" }),
					row({ id: "c", status: "failed", error: "timeout" }),
				]}
				sourceUrl="https://sample.example/"
			/>,
		);
		expect(screen.getByText(/3 ditemukan/)).toBeDefined();
		expect(screen.getByText(/2 tersimpan/)).toBeDefined();
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
		expect(screen.getByText("Gambar belum dapat diperiksa")).toBeDefined();
	});
});
