// @vitest-environment jsdom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { scrapePages } from "@/db/schema";
import { CrawlResult, resolveSelectedPageId } from "../components/crawl-result";

type Page = typeof scrapePages.$inferSelect;

afterEach(() => {
	cleanup();
});

function page(
	id: string,
	url: string,
	title: string | null = null,
	status: Page["status"] = "completed",
): Page {
	return {
		id,
		scrapeId: "scrape-1",
		userId: "owner-1",
		url,
		parentUrl: null,
		depth: 0,
		status,
		title,
		httpStatus: status === "completed" ? 200 : status === "failed" ? 500 : null,
		content: {
			description: `${title ?? url} description`,
			headings: [],
			text: `${title ?? url} body text`,
			links: [],
			images: [],
			patterns: [],
			outgoingPages: [],
		},
		error: status === "failed" ? "Network error" : null,
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

describe("CrawlResult summary and clean copy", () => {
	it("does not render technical crawler boilerplate (robots.txt, static HTML)", () => {
		const pages = [page("a", "https://example.test/a", "First")];
		const { container } = render(
			<CrawlResult
				pages={pages}
				sourceUrl="https://example.test/"
				scope={{ maxPages: 10, maxDepth: 2 }}
			/>,
		);

		expect(screen.queryByText(/robots\.txt dihormati/i)).toBeNull();
		expect(screen.queryByText(/Crawler membaca HTML statis/i)).toBeNull();
		expect(
			screen.queryByText(/Jumlah ditemukan adalah halaman yang teramati/i),
		).toBeNull();
		expect(container.textContent).not.toContain("Â·");
		expect(container.textContent).not.toContain("Â");
	});

	it("renders compact statistics with correct counts", () => {
		const pages = [
			page("a", "https://example.test/a", "First", "completed"),
			page("b", "https://example.test/b", "Second", "completed"),
			page("c", "https://example.test/c", "Third", "failed"),
		];
		const { container } = render(
			<CrawlResult
				pages={pages}
				sourceUrl="https://example.test/"
				scope={{ maxPages: 10, maxDepth: 2 }}
			/>,
		);

		const summaryCard = container.querySelector("header .bg-onyx");
		expect(summaryCard).toBeDefined();
		const card = within(summaryCard as HTMLElement);

		// Ditemukan: 3, Berhasil: 2, Gagal: 1
		expect(card.getByText("Ditemukan")).toBeDefined();
		expect(card.getByText("3")).toBeDefined();
		expect(card.getByText("Berhasil")).toBeDefined();
		expect(card.getByText("2")).toBeDefined();
		expect(card.getByText("Gagal")).toBeDefined();
		expect(card.getByText("1")).toBeDefined();
		// Dilewati should not appear when skipped is 0
		expect(card.queryByText("Dilewati")).toBeNull();

		// Check scope message
		expect(
			card.getByText("Pencarian dibatasi hingga 10 halaman."),
		).toBeDefined();
		// Does not display depth in normal summary
		expect(card.queryByText(/depth/i)).toBeNull();
	});

	it("displays skipped count when skipped > 0", () => {
		const pages = [
			page("a", "https://example.test/a", "First", "completed"),
			page("b", "https://example.test/b", "Second", "skipped"),
			page("c", "https://example.test/c", "Third", "failed"),
		];
		const { container } = render(
			<CrawlResult
				pages={pages}
				sourceUrl="https://example.test/"
				scope={{ maxPages: 5, maxDepth: 1 }}
			/>,
		);

		const summaryCard = container.querySelector("header .bg-onyx");
		const card = within(summaryCard as HTMLElement);
		const skippedLabel = card.getByText("Dilewati");
		expect(skippedLabel).toBeDefined();
		expect(skippedLabel.parentElement?.textContent).toContain("1");
	});

	it("displays queued count when queued > 0 to indicate unfinished processing", () => {
		const pages = [
			page("a", "https://example.test/a", "First", "completed"),
			page("b", "https://example.test/b", "Second", "queued"),
		];
		const { container } = render(
			<CrawlResult
				pages={pages}
				sourceUrl="https://example.test/"
				scope={{ maxPages: 5, maxDepth: 1 }}
			/>,
		);

		const summaryCard = container.querySelector("header .bg-onyx");
		const card = within(summaryCard as HTMLElement);
		const queuedLabel = card.getByText("Antre");
		expect(queuedLabel).toBeDefined();
		expect(queuedLabel.parentElement?.textContent).toContain("1");
	});

	it("safely handles missing scope metadata without error or fallback text", () => {
		const pages = [page("a", "https://example.test/a", "First")];
		const { container } = render(
			<CrawlResult pages={pages} sourceUrl="https://example.test/" />,
		);

		const summaryCard = container.querySelector("header .bg-onyx");
		const card = within(summaryCard as HTMLElement);
		expect(card.queryByText(/pencarian dibatasi/i)).toBeNull();
		expect(card.queryByText(/cakupan/i)).toBeNull();
	});

	it("does not duplicate site domain as card heading", () => {
		const pages = [page("a", "https://example.test/a", "First")];
		render(
			<CrawlResult
				pages={pages}
				sourceUrl="https://example.test/"
				domain="example.test"
			/>,
		);

		// The header has sourceUrl link
		const sourceLink = screen.getByRole("link", {
			name: "https://example.test/",
		});
		expect(sourceLink).toBeDefined();

		// Card should not have a redundant domain heading paragraph
		const card = sourceLink.closest("header")?.querySelector(".bg-onyx");
		expect(card?.textContent).not.toContain("example.test");
	});

	it("handles edge cases: empty pages, only root, all failed", () => {
		// Empty pages
		const { rerender, container } = render(
			<CrawlResult
				pages={[]}
				sourceUrl="https://example.test/"
				scope={{ maxPages: 10, maxDepth: 2 }}
			/>,
		);
		const summaryCard = container.querySelector("header .bg-onyx");
		const card = within(summaryCard as HTMLElement);
		expect(card.getByText("Ditemukan")).toBeDefined();
		expect(
			card.getByText("Pencarian dibatasi hingga 10 halaman."),
		).toBeDefined();

		// All failed
		rerender(
			<CrawlResult
				pages={[
					page("a", "https://example.test/a", "Fail 1", "failed"),
					page("b", "https://example.test/b", "Fail 2", "failed"),
				]}
				sourceUrl="https://example.test/"
				scope={{ maxPages: 10, maxDepth: 2 }}
			/>,
		);
		const cardAfter = within(summaryCard as HTMLElement);
		expect(cardAfter.getByText("Ditemukan")).toBeDefined();
		expect(cardAfter.getByText("Berhasil")).toBeDefined();
		expect(cardAfter.getByText("Gagal")).toBeDefined();
	});

	it("triggers download of website blueprint markdown file", () => {
		const pages = [page("a", "https://example.test/a", "First")];
		render(<CrawlResult pages={pages} sourceUrl="https://example.test/" />);

		const downloadBtn = screen.getByRole("button", { name: /download \.md/i });
		expect(downloadBtn).toBeDefined();

		const originalCreateObjectURL = window.URL.createObjectURL;
		const originalRevokeObjectURL = window.URL.revokeObjectURL;
		window.URL.createObjectURL = () => "blob:mock-url";
		window.URL.revokeObjectURL = () => {};

		try {
			fireEvent.click(downloadBtn);
		} finally {
			window.URL.createObjectURL = originalCreateObjectURL;
			window.URL.revokeObjectURL = originalRevokeObjectURL;
		}
	});
});
