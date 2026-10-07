// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScrapeProgress } from "./scrape-progress";

afterEach(() => {
	cleanup();
});

describe("ScrapeProgress", () => {
	it("renders capturing stage with deterministic progress bar and stage tracker", () => {
		render(
			<ScrapeProgress
				status="capturing"
				sourceUrl="https://example.com"
				domain="example.com"
			/>,
		);

		expect(screen.getByText("example.com")).toBeDefined();
		expect(screen.getAllByText("Mengambil halaman").length).toBeGreaterThan(0);
		expect(screen.getByText("(30%)")).toBeDefined();

		const progressBar = screen.getByRole("progressbar");
		expect(progressBar.getAttribute("aria-valuenow")).toBe("30");
	});

	it("renders extracting stage with 55% progress", () => {
		render(
			<ScrapeProgress
				status="extracting"
				sourceUrl="https://example.com"
				domain="example.com"
			/>,
		);

		expect(screen.getByText("(55%)")).toBeDefined();
		const progressBar = screen.getByRole("progressbar");
		expect(progressBar.getAttribute("aria-valuenow")).toBe("55");
	});

	it("renders failed state with error message and retry button", () => {
		const onRetry = vi.fn();
		render(
			<ScrapeProgress
				status="failed"
				sourceUrl="https://example.com"
				domain="example.com"
				errorMessage="Koneksi ke website gagal."
				onRetry={onRetry}
			/>,
		);

		expect(
			screen.getAllByText("Koneksi ke website gagal.").length,
		).toBeGreaterThan(0);
		const retryBtn = screen.getByRole("button", { name: /coba lagi/i });
		expect(retryBtn).toBeDefined();

		fireEvent.click(retryBtn);
		expect(onRetry).toHaveBeenCalledTimes(1);
	});
});
