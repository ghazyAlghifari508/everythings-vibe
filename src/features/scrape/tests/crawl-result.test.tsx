// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { scrapePages } from "@/db/schema";
import { CrawlResult, resolveSelectedPageId } from "../components/crawl-result";

type Page = typeof scrapePages.$inferSelect;

afterEach(() => {
	cleanup();
});

function page(id: string, url: string, title: string | null = null): Page {
	return {
		id,
		scrapeId: "scrape-1",
		userId: "owner-1",
		url,
		parentUrl: null,
		depth: 0,
		status: "completed",
		title,
		httpStatus: 200,
		content: {
			description: `${title ?? url} description`,
			headings: [],
			text: `${title ?? url} body text`,
			links: [],
			images: [],
			patterns: [],
			outgoingPages: [],
		},
		error: null,
	};
}

describe("resolveSelectedPageId", () => {
	it("selects the first page once pages arrive from empty", () => {
		const pages = [page("a", "https://example.test/a")];
		expect(resolveSelectedPageId(pages, "")).toBe("a");
	});

	it("keeps a still-available user selection", () => {
		const pages = [
			page("a", "https://example.test/a"),
			page("b", "https://example.test/b"),
		];
		expect(resolveSelectedPageId(pages, "b")).toBe("b");
	});

	it("replaces a selection that disappeared", () => {
		const pages = [page("b", "https://example.test/b")];
		expect(resolveSelectedPageId(pages, "removed")).toBe("b");
	});

	it("returns an empty id when there is nothing to select", () => {
		expect(resolveSelectedPageId([], "")).toBe("");
		expect(resolveSelectedPageId([], "stale")).toBe("");
	});
});

describe("CrawlResult async page arrival", () => {
	it("shows the explorer for pages that arrive after an empty first render", () => {
		const { rerender } = render(
			<CrawlResult pages={[]} sourceUrl="https://example.test/" />,
		);
		expect(
			screen.getAllByText(/belum ada halaman/i).length,
		).toBeGreaterThanOrEqual(1);

		const pages = [
			page("a", "https://example.test/a", "First"),
			page("b", "https://example.test/b", "Second"),
		];
		rerender(<CrawlResult pages={pages} sourceUrl="https://example.test/" />);

		expect(screen.queryByText(/belum ada halaman/i)).toBeNull();
		expect(screen.getByRole("heading", { name: "First" })).toBeDefined();
		expect(screen.getByText("First body text")).toBeDefined();
	});

	it("preserves the user selection while the page still exists", () => {
		const pages = [
			page("a", "https://example.test/a", "First"),
			page("b", "https://example.test/b", "Second"),
		];
		const { rerender } = render(
			<CrawlResult pages={pages} sourceUrl="https://example.test/" />,
		);
		fireEvent.click(screen.getAllByRole("button", { name: /Second/ })[0]);
		expect(screen.getByRole("heading", { name: "Second" })).toBeDefined();

		rerender(
			<CrawlResult
				pages={[...pages, page("c", "https://example.test/c", "Third")]}
				sourceUrl="https://example.test/"
			/>,
		);
		expect(screen.getByRole("heading", { name: "Second" })).toBeDefined();
		expect(screen.getByText("Second body text")).toBeDefined();
	});

	it("falls back to a valid page when the selected page disappears", () => {
		const pages = [
			page("a", "https://example.test/a", "First"),
			page("b", "https://example.test/b", "Second"),
		];
		const { rerender } = render(
			<CrawlResult pages={pages} sourceUrl="https://example.test/" />,
		);
		fireEvent.click(screen.getAllByRole("button", { name: /Second/ })[0]);
		expect(screen.getByRole("heading", { name: "Second" })).toBeDefined();

		rerender(
			<CrawlResult pages={[pages[0]]} sourceUrl="https://example.test/" />,
		);
		expect(screen.getByRole("heading", { name: "First" })).toBeDefined();
		expect(screen.queryByText(/belum ada halaman/i)).toBeNull();
	});

	it("keeps inventory and sitemap navigation in sync with the selection", () => {
		const pages = [
			page("a", "https://example.test/a", "First"),
			page("b", "https://example.test/b"),
		];
		render(<CrawlResult pages={pages} sourceUrl="https://example.test/" />);

		// A page without a title is labelled by pathname in the Visual Sitemap
		// (graph buttons append status for screen readers, so match substring).
		fireEvent.click(screen.getAllByRole("button", { name: /\/b/ })[0]);
		expect(screen.getByText("https://example.test/b body text")).toBeDefined();
	});

	it("synchronizes selection from inventory click to sitemap graph", () => {
		const pages = [
			page("a", "https://example.test/a", "First"),
			page("b", "https://example.test/b", "Second"),
		];
		render(<CrawlResult pages={pages} sourceUrl="https://example.test/" />);

		// Click the inventory item for 'Second'
		const inventoryButtons = screen.getAllByRole("button", { name: /Second/ });
		fireEvent.click(inventoryButtons[inventoryButtons.length - 1]);

		// Verify Explorer displays Second
		expect(screen.getByRole("heading", { name: "Second" })).toBeDefined();

		// Verify sitemap graph button for Second is selected
		const sitemapButtons = screen.getAllByRole("button", {
			name: /Second — Berhasil/,
		});
		expect(sitemapButtons[0].getAttribute("aria-pressed")).toBe("true");
	});

	it("keeps a progressively growing page list selectable", () => {
		const first = page("a", "https://example.test/a", "First");
		const { rerender } = render(
			<CrawlResult pages={[first]} sourceUrl="https://example.test/" />,
		);
		expect(screen.getByRole("heading", { name: "First" })).toBeDefined();

		rerender(
			<CrawlResult
				pages={[first, page("b", "https://example.test/b", "Second")]}
				sourceUrl="https://example.test/"
			/>,
		);
		fireEvent.click(screen.getAllByRole("button", { name: /Second/ })[0]);
		expect(screen.getByRole("heading", { name: "Second" })).toBeDefined();
	});

	it("synchronizes the inventory and the explorer with a sitemap node click", () => {
		const pages = [
			page("a", "https://example.test/a", "First"),
			page("b", "https://example.test/b", "Second"),
		];
		render(<CrawlResult pages={pages} sourceUrl="https://example.test/" />);

		const sitemapNode = screen.getAllByRole("button", {
			name: /Second — Berhasil/,
		})[0];
		fireEvent.click(sitemapNode);

		// The explorer follows the sitemap selection
		expect(screen.getByRole("heading", { name: "Second" })).toBeDefined();
		// The inventory marks the same page as the current one
		const inventoryItem = screen
			.getAllByRole("button", { name: /Second/ })
			.find((button) => button.getAttribute("aria-current") === "true");
		expect(inventoryItem).toBeDefined();
	});

	it("moves the reader to the page details on request", () => {
		const pages = [page("a", "https://example.test/a", "First")];
		render(<CrawlResult pages={pages} sourceUrl="https://example.test/" />);

		fireEvent.click(
			screen.getByRole("button", { name: "Lihat detail halaman" }),
		);

		expect(document.activeElement).toBe(
			screen.getByRole("region", { name: "Page Explorer" }),
		);
	});

	it("presents explorer status in Indonesian consistent with inventory", () => {
		render(
			<CrawlResult
				pages={[page("a", "https://example.test/a", "First")]}
				sourceUrl="https://example.test/"
			/>,
		);
		expect(screen.getAllByText("Berhasil").length).toBeGreaterThanOrEqual(1);
		expect(screen.queryByText("Completed")).toBeNull();
		expect(screen.queryByText("Failed")).toBeNull();
		expect(screen.queryByText("Skipped")).toBeNull();
	});
});

describe("CrawlResult back navigation", () => {
	it("renders no duplicate back link inside the result component", () => {
		render(
			<CrawlResult
				pages={[page("a", "https://example.test/a", "First")]}
				sourceUrl="https://example.test/"
			/>,
		);
		expect(screen.queryByText(/kembali ke hasil scrape/i)).toBeNull();
		expect(screen.queryByRole("link", { name: /^kembali$/i })).toBeNull();
	});
});
