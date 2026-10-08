// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScrapeProgress } from "./scrape-progress";

afterEach(() => {
	cleanup();
});

describe("ScrapeProgress", () => {
	it("shows honest browser activity copy for DESIGN capturing without a fake percentage", () => {
		const { container } = render(
			<ScrapeProgress
				mode="design"
				status="capturing"
				sourceUrl="https://www.notion.com/"
				domain="www.notion.com"
			/>,
		);
		expect(screen.getByText(/Membuka website di browser/i)).toBeDefined();
		expect(screen.queryByText(/\(\d+%/)).toBeNull();
		expect(
			container
				.querySelector('[role="progressbar"]')
				?.getAttribute("aria-valuenow"),
		).toBeNull();
	});

	it("shows honest visual-analysis copy for DESIGN extracting", () => {
		render(
			<ScrapeProgress
				mode="design"
				status="extracting"
				sourceUrl="https://www.notion.com/"
				domain="www.notion.com"
			/>,
		);
		expect(screen.getByText(/Membaca warna, tipografi/i)).toBeDefined();
	});

	it("shows honest AI-generation copy for DESIGN generating", () => {
		render(
			<ScrapeProgress
				mode="design"
				status="generating"
				sourceUrl="https://www.notion.com/"
				domain="www.notion.com"
			/>,
		);
		expect(screen.getByText(/AI sedang menyusun DESIGN\.md/i)).toBeDefined();
	});

	it("shows browser-rendering copy for HTML capturing and no generating stage", () => {
		const { container } = render(
			<ScrapeProgress
				mode="html"
				status="capturing"
				sourceUrl="https://www.notion.com/"
				domain="www.notion.com"
			/>,
		);
		expect(screen.getByText(/menjalankan JavaScript halaman/i)).toBeDefined();
		expect(screen.queryByText(/Menyusun DESIGN\.md/i)).toBeNull();
		expect(screen.queryByText(/\(\d+%/)).toBeNull();
		expect(
			container
				.querySelector('[role="progressbar"]')
				?.getAttribute("aria-valuenow"),
		).toBeNull();
	});

	it("exposes retry on failure while preserving the mode context", () => {
		const onRetry = vi.fn();
		render(
			<ScrapeProgress
				mode="html"
				status="failed"
				sourceUrl="https://www.notion.com/"
				domain="www.notion.com"
				errorMessage="Gagal memproses HTML website."
				onRetry={onRetry}
			/>,
		);
		const retryButton = screen.getByRole("button", { name: /Coba lagi/i });
		fireEvent.click(retryButton);
		expect(onRetry).toHaveBeenCalledTimes(1);
	});

	it("uses the website name as the progress heading, not the raw domain", () => {
		render(
			<ScrapeProgress
				mode="design"
				status="queued"
				sourceUrl="https://www.notion.com/"
				domain="www.notion.com"
			/>,
		);
		expect(screen.getByRole("heading", { name: "Notion" })).toBeDefined();
	});
});
