// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
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

function Harness({ pages, initial }: { pages: Page[]; initial: string }) {
	const [selected, setSelected] = useState(initial);
	return (
		<CrawlSitemapGraph
			pages={pages}
			selectedId={selected}
			onSelect={setSelected}
		/>
	);
}

function edgePaths(container: HTMLElement): Element[] {
	return Array.from(container.querySelectorAll("path[data-edge-kind]"));
}

const treePages: Page[] = [
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

describe("CrawlSitemapGraph", () => {
	it("renders nothing when pages array is empty", () => {
		const { container } = render(
			<CrawlSitemapGraph pages={[]} selectedId="" onSelect={() => {}} />,
		);
		expect(container.firstChild).toBeNull();
	});

	it("shows a single sitemap without a mode switch", () => {
		render(
			<CrawlSitemapGraph
				pages={treePages}
				selectedId="p-root"
				onSelect={() => {}}
			/>,
		);

		expect(screen.queryByRole("tablist")).toBeNull();
		expect(screen.queryByRole("tab", { name: "Discovery Map" })).toBeNull();
		expect(screen.queryByRole("tab", { name: "All Links" })).toBeNull();
		expect(
			screen.getByRole("application", { name: /Visual sitemap/i }),
		).toBeDefined();
	});

	it("keeps the fit and zoom controls available", () => {
		render(
			<CrawlSitemapGraph
				pages={treePages}
				selectedId="p-root"
				onSelect={() => {}}
			/>,
		);

		expect(
			screen.getByRole("button", { name: "Pusatkan grafik (F)" }),
		).toBeDefined();
		expect(screen.getByRole("button", { name: "Perkecil" })).toBeDefined();
		expect(screen.getByRole("button", { name: "Perbesar" })).toBeDefined();
		expect(
			screen.getByText(
				"Peta halaman berdasarkan link yang ditemukan saat crawl.",
			),
		).toBeDefined();
		expect(screen.getByText(/Legenda: ✓ Berhasil/)).toBeDefined();
	});

	it("draws only the discovery edges by default", () => {
		const { container } = render(
			<CrawlSitemapGraph
				pages={treePages}
				selectedId="p-pricing"
				onSelect={() => {}}
			/>,
		);

		const edges = edgePaths(container);
		expect(edges).toHaveLength(2);
		expect(
			edges.every((edge) => edge.getAttribute("data-edge-kind") === "primary"),
		).toBe(true);
	});

	it("triggers onSelect callback when clicking a node button", () => {
		const onSelect = vi.fn();
		render(
			<CrawlSitemapGraph
				pages={treePages}
				selectedId="p-root"
				onSelect={onSelect}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: /Pricing — Berhasil/ }));
		expect(onSelect).toHaveBeenCalledWith("p-pricing");
	});

	it("highlights the currently selected node", () => {
		const { rerender } = render(
			<CrawlSitemapGraph
				pages={treePages}
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
				pages={treePages}
				selectedId="p-pricing"
				onSelect={() => {}}
			/>,
		);

		expect(homeBtn.getAttribute("aria-pressed")).toBe("false");
		expect(pricingBtn.getAttribute("aria-pressed")).toBe("true");
	});

	it("summarises the selected page with the relationships the crawl observed", () => {
		render(
			<CrawlSitemapGraph
				pages={treePages}
				selectedId="p-pricing"
				onSelect={() => {}}
			/>,
		);

		expect(screen.getByText(/Dipilih:/)).toBeDefined();
		expect(screen.getByText(/Ditemukan dari/)).toBeDefined();
		expect(screen.getByText(/1 tautan keluar/)).toBeDefined();
		expect(screen.getByText(/1 tautan masuk/)).toBeDefined();
	});

	it("offers no extra-link control when the page has no other relationships", () => {
		render(
			<CrawlSitemapGraph
				pages={treePages}
				selectedId="p-root"
				onSelect={() => {}}
			/>,
		);

		expect(screen.queryByText(/Tampilkan tautan lainnya/)).toBeNull();
		expect(screen.queryByText(/Sembunyikan tautan lainnya/)).toBeNull();
		expect(screen.getByText(/Halaman awal crawl/)).toBeDefined();
	});

	it("reveals the observed links of the selected page on request", () => {
		const { container } = render(
			<Harness pages={treePages} initial="p-pricing" />,
		);

		const toggle = screen.getByRole("button", {
			name: /Tampilkan tautan lainnya/,
		});
		expect(toggle.getAttribute("aria-expanded")).toBe("false");
		expect(edgePaths(container)).toHaveLength(2);
		expect(screen.queryByText(/Tautan ke halaman lain/)).toBeNull();

		fireEvent.click(toggle);

		expect(edgePaths(container)).toHaveLength(3);
		const observed = edgePaths(container).find(
			(edge) => edge.getAttribute("data-edge-kind") !== "primary",
		);
		expect(observed?.getAttribute("data-edge-from")).toBe(
			"https://example.test/pricing",
		);
		expect(observed?.getAttribute("data-edge-to")).toBe(
			"https://example.test/docs",
		);
		expect(screen.getByText(/Tautan ke halaman lain/)).toBeDefined();
		expect(
			screen.getByRole("button", { name: /Sembunyikan tautan lainnya/ }),
		).toBeDefined();
	});

	it("hides the revealed links again when another page is selected", () => {
		const { container } = render(
			<Harness pages={treePages} initial="p-pricing" />,
		);

		fireEvent.click(
			screen.getByRole("button", { name: /Tampilkan tautan lainnya/ }),
		);
		expect(edgePaths(container)).toHaveLength(3);

		fireEvent.click(screen.getByRole("button", { name: /Docs — Berhasil/ }));

		expect(edgePaths(container)).toHaveLength(2);
		expect(screen.queryByText(/Tautan ke halaman lain/)).toBeNull();
	});

	it("never draws the same relationship twice", () => {
		const { container } = render(
			<Harness pages={treePages} initial="p-pricing" />,
		);
		fireEvent.click(
			screen.getByRole("button", { name: /Tampilkan tautan lainnya/ }),
		);

		const keys = edgePaths(container).map(
			(edge) =>
				`${edge.getAttribute("data-edge-from")}->${edge.getAttribute("data-edge-to")}`,
		);
		expect(new Set(keys).size).toBe(keys.length);
	});

	it("renders a single page graph without a relationship control", () => {
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

		expect(
			screen.getByRole("button", { name: /Home — Berhasil/ }),
		).toBeDefined();
		expect(screen.queryByText(/Tampilkan tautan lainnya/)).toBeNull();
	});

	it("renders a dense graph without dropping pages", () => {
		const children: Page[] = [];
		for (let i = 0; i < 12; i++) {
			children.push(
				createPage(
					`p-${i}`,
					`https://example.test/page-${i}`,
					"https://example.test/",
					1,
					`Page ${i}`,
				),
			);
		}
		const pages = [
			createPage("p-root", "https://example.test/", null, 0, "Home"),
			...children,
		];
		render(
			<CrawlSitemapGraph
				pages={pages}
				selectedId="p-root"
				onSelect={() => {}}
			/>,
		);

		expect(screen.getAllByRole("button", { name: /— Berhasil/ })).toHaveLength(
			13,
		);
	});

	it("keeps the node selection reachable from the keyboard", () => {
		const onSelect = vi.fn();
		render(
			<CrawlSitemapGraph
				pages={treePages}
				selectedId="p-root"
				onSelect={onSelect}
			/>,
		);

		const pricingBtn = screen.getByRole("button", {
			name: /Pricing — Berhasil/,
		});
		pricingBtn.focus();
		expect(document.activeElement).toBe(pricingBtn);
		fireEvent.click(pricingBtn);
		expect(onSelect).toHaveBeenCalledWith("p-pricing");
	});

	it("zooms the canvas with the zoom controls", () => {
		render(
			<CrawlSitemapGraph
				pages={treePages}
				selectedId="p-root"
				onSelect={() => {}}
			/>,
		);

		expect(screen.getByText("100%")).toBeDefined();
		fireEvent.click(screen.getByRole("button", { name: "Perbesar" }));
		expect(screen.getByText("120%")).toBeDefined();
		fireEvent.click(screen.getByRole("button", { name: "Perkecil" }));
		expect(screen.getByText("100%")).toBeDefined();
	});

	it("keeps the reader's zoom when the graph grows", () => {
		const { rerender } = render(
			<CrawlSitemapGraph
				pages={treePages}
				selectedId="p-root"
				onSelect={() => {}}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Perbesar" }));
		expect(screen.getByText("120%")).toBeDefined();

		rerender(
			<CrawlSitemapGraph
				pages={[
					...treePages,
					createPage(
						"p-faq",
						"https://example.test/faq",
						"https://example.test/",
						1,
						"FAQ",
					),
				]}
				selectedId="p-root"
				onSelect={() => {}}
			/>,
		);

		expect(screen.getByText("120%")).toBeDefined();
	});

	it("handles keyboard navigation shortcuts for accessibility", () => {
		render(
			<CrawlSitemapGraph
				pages={treePages}
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

	it("shows the full title and URL when the node label is truncated", () => {
		const longTitle = "Judul halaman yang sangat panjang sekali untuk dipotong";
		const pages = [
			createPage("p-root", "https://example.test/", null, 0, longTitle),
		];
		render(
			<CrawlSitemapGraph
				pages={pages}
				selectedId="p-root"
				onSelect={() => {}}
			/>,
		);

		const node = screen.getByRole("button", { name: /— Berhasil/ });
		const title = node.getAttribute("title") ?? "";
		expect(title).toContain(longTitle);
		expect(title).toContain("https://example.test/");
	});
});
