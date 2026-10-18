// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { scrapePages } from "@/db/schema";
import { CrawlSitemapGraph } from "../components/crawl-sitemap-graph";

type Page = typeof scrapePages.$inferSelect;

afterEach(() => {
	cleanup();
});

function createPage(
	id: string,
	url: string,
	parentUrl: string | null = null,
	depth = 0,
	title: string | null = null,
	status: Page["status"] = "completed",
	outgoing: string[] = [],
): Page {
	return {
		id,
		scrapeId: "scrape-1",
		userId: "owner-1",
		url,
		parentUrl,
		depth,
		status,
		title,
		httpStatus: 200,
		content: {
			description: null,
			headings: [],
			text: "",
			links: outgoing,
			images: [],
			patterns: [],
			outgoingPages: outgoing,
		},
		error: null,
	};
}

describe("CrawlSitemapGraph", () => {
	it("renders nothing when pages array is empty", () => {
		const { container } = render(
			<CrawlSitemapGraph pages={[]} selectedId="" onSelect={() => {}} />,
		);
		expect(container.firstChild).toBeNull();
	});

	it("renders workspace toolbar with mode tabs and zoom controls", () => {
		const pages = [
			createPage("p-root", "https://example.test/", null, 0, "Home"),
			createPage(
				"p-pricing",
				"https://example.test/pricing",
				"https://example.test/",
				1,
				"Pricing",
			),
		];
		render(
			<CrawlSitemapGraph
				pages={pages}
				selectedId="p-root"
				onSelect={() => {}}
			/>,
		);

		expect(screen.getByRole("tab", { name: "Discovery Map" })).toBeDefined();
		expect(screen.getByRole("tab", { name: "All Links" })).toBeDefined();
		expect(
			screen.getByRole("button", { name: "Pusatkan grafik" }),
		).toBeDefined();
		expect(
			screen.getByText(
				"Peta halaman berdasarkan link yang ditemukan saat crawl.",
			),
		).toBeDefined();
		expect(screen.getByText(/Legenda: ✓ Berhasil/)).toBeDefined();
	});

	it("switches between Discovery Map and All Links view modes", () => {
		const pages = [
			createPage("p-root", "https://example.test/", null, 0, "Home"),
			createPage(
				"p-pricing",
				"https://example.test/pricing",
				"https://example.test/",
				1,
				"Pricing",
				"completed",
				["https://example.test/docs"],
			),
			createPage(
				"p-docs",
				"https://example.test/docs",
				"https://example.test/",
				1,
				"Docs",
			),
		];

		render(
			<CrawlSitemapGraph
				pages={pages}
				selectedId="p-root"
				onSelect={() => {}}
			/>,
		);

		const discoveryTab = screen.getByRole("tab", { name: "Discovery Map" });
		const allLinksTab = screen.getByRole("tab", { name: "All Links" });

		expect(discoveryTab.getAttribute("aria-selected")).toBe("true");
		expect(allLinksTab.getAttribute("aria-selected")).toBe("false");

		fireEvent.click(allLinksTab);
		expect(allLinksTab.getAttribute("aria-selected")).toBe("true");
		expect(discoveryTab.getAttribute("aria-selected")).toBe("false");
	});

	it("triggers onSelect callback when clicking a node button", () => {
		const onSelect = vi.fn();
		const pages = [
			createPage("p-root", "https://example.test/", null, 0, "Home"),
			createPage(
				"p-pricing",
				"https://example.test/pricing",
				"https://example.test/",
				1,
				"Pricing",
			),
		];

		render(
			<CrawlSitemapGraph
				pages={pages}
				selectedId="p-root"
				onSelect={onSelect}
			/>,
		);

		const pricingBtn = screen.getByRole("button", {
			name: /Pricing — Berhasil/,
		});
		fireEvent.click(pricingBtn);
		expect(onSelect).toHaveBeenCalledWith("p-pricing");
	});

	it("highlights the currently selected node", () => {
		const pages = [
			createPage("p-root", "https://example.test/", null, 0, "Home"),
			createPage(
				"p-pricing",
				"https://example.test/pricing",
				"https://example.test/",
				1,
				"Pricing",
			),
		];

		const { rerender } = render(
			<CrawlSitemapGraph
				pages={pages}
				selectedId="p-root"
				onSelect={() => {}}
			/>,
		);

		const homeBtn = screen.getByRole("button", { name: /Home — Berhasil/ });
		const pricingBtn = screen.getByRole("button", {
			name: /Pricing — Berhasil/,
		});

		expect(homeBtn.getAttribute("aria-pressed")).toBe("true");
		expect(pricingBtn.getAttribute("aria-pressed")).toBe("false");

		rerender(
			<CrawlSitemapGraph
				pages={pages}
				selectedId="p-pricing"
				onSelect={() => {}}
			/>,
		);

		expect(homeBtn.getAttribute("aria-pressed")).toBe("false");
		expect(pricingBtn.getAttribute("aria-pressed")).toBe("true");
	});

	it("handles keyboard navigation shortcuts for accessibility", () => {
		const pages = [
			createPage("p-root", "https://example.test/", null, 0, "Home"),
		];

		render(
			<CrawlSitemapGraph
				pages={pages}
				selectedId="p-root"
				onSelect={() => {}}
			/>,
		);

		const appContainer = screen.getByRole("application", {
			name: /Visual sitemap/i,
		});

		// Arrow key panning and 'f' trigger without throwing errors
		fireEvent.keyDown(appContainer, { key: "ArrowDown" });
		fireEvent.keyDown(appContainer, { key: "ArrowUp" });
		fireEvent.keyDown(appContainer, { key: "ArrowLeft" });
		fireEvent.keyDown(appContainer, { key: "ArrowRight" });
		fireEvent.keyDown(appContainer, { key: "f" });
	});
});
