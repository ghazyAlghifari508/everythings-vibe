// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScrapeProgress } from "./scrape-progress";

afterEach(() => {
	cleanup();
});

describe("ScrapeProgress", () => {
	it("renders capturing stage for DESIGN.md mode with deterministic progress bar and stage tracker", () => {
		render(
			<ScrapeProgress
				status="capturing"
				mode="design"
				sourceUrl="https://example.com"
				domain="example.com"
			/>,
		);

		expect(screen.getByText("example.com")).toBeDefined();
		expect(screen.getAllByText("Mengambil halaman").length).toBeGreaterThan(0);
		expect(screen.getByText("(30%)")).toBeDefined();

		const progressBar = screen.getByRole("progressbar");
		expect(progressBar.getAttribute("aria-valuenow")).toBe("30");
		expect(progressBar.getAttribute("aria-label")).toContain("DESIGN.md");
	});

	it("renders extracting stage for DESIGN.md mode with 55% progress", () => {
		render(
			<ScrapeProgress
				status="extracting"
				mode="design"
				sourceUrl="https://example.com"
				domain="example.com"
			/>,
		);

		expect(screen.getByText("(55%)")).toBeDefined();
		const progressBar = screen.getByRole("progressbar");
		expect(progressBar.getAttribute("aria-valuenow")).toBe("55");
	});

	it("renders extracting stage for HTML mode with 75% progress and HTML-specific stages", () => {
		render(
			<ScrapeProgress
				status="extracting"
				mode="html"
				sourceUrl="https://example.com"
				domain="example.com"
			/>,
		);

		expect(screen.getByText("(75%)")).toBeDefined();
		const progressBar = screen.getByRole("progressbar");
		expect(progressBar.getAttribute("aria-valuenow")).toBe("75");
		expect(progressBar.getAttribute("aria-label")).toContain("HTML");

		// HTML mode does not include "Menyusun DESIGN.md"
		expect(screen.queryByText("Menyusun DESIGN.md")).toBeNull();
		// HTML mode includes "Menyiapkan preview"
		expect(screen.getAllByText("Menyiapkan preview").length).toBeGreaterThan(0);
	});

	it("renders failed state with error message and retry button", () => {
		const onRetry = vi.fn();
		render(
			<ScrapeProgress
				status="failed"
				mode="design"
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
