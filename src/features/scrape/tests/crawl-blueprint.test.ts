import { describe, expect, it } from "vitest";
import type { scrapePages } from "@/db/schema";
import { buildWebsiteBlueprint } from "@/features/scrape/utils/crawl-blueprint";

type Page = typeof scrapePages.$inferSelect;

function page(overrides: Partial<Page> & { id: string; url: string }): Page {
	return {
		scrapeId: "scrape-1",
		userId: "owner-1",
		parentUrl: null,
		depth: 0,
		status: "completed",
		title: null,
		httpStatus: 200,
		content: null,
		error: null,
		...overrides,
	};
}

function content(
	overrides: Partial<NonNullable<Page["content"]>> = {},
): NonNullable<Page["content"]> {
	return {
		description: null,
		headings: [],
		text: "",
		links: [],
		images: [],
		patterns: [],
		...overrides,
	};
}

function navSite(count: number): Page[] {
	const labels = [
		"Home",
		"Blog",
		"Pricing",
		"Templates",
		"Docs",
		"Changelog",
		"About",
		"Contact",
		"Careers",
		"Press",
	];
	return Array.from({ length: count }, (_, index) => {
		const url = `https://example.test/${index === 0 ? "" : labels[index]}`;
		return page({
			id: `p${index}`,
			url,
			title: labels[index],
			depth: index === 0 ? 0 : 1,
			parentUrl: index === 0 ? null : "https://example.test/",
			content: content({
				headings: [labels[index]],
				headingLevels: [{ level: 1, text: labels[index] }],
				text: `${labels[index]} body`,
				links: Array.from({ length: count }, (_, other) =>
					other === 0
						? "https://example.test/"
						: `https://example.test/${labels[other]}`,
				),
				outgoingPages: Array.from({ length: count }, (_, other) =>
					other === 0
						? "https://example.test/"
						: `https://example.test/${labels[other]}`,
				),
				internalLinks: Array.from({ length: count }, (_, other) =>
					other === 0
						? "https://example.test/"
						: `https://example.test/${labels[other]}`,
				),
				externalLinks: [],
				patterns: ["nav", "header", "footer"],
			}),
		});
	});
}

/** Text of one markdown section, stopping at the next same-or-higher heading. */
function sectionOf(markdown: string, heading: string): string {
	const start = markdown.indexOf(`\n${heading}\n`);
	if (start < 0) return "";
	const level = heading.match(/^#+/)?.[0].length ?? 2;
	const rest = markdown.slice(start + heading.length + 2);
	const boundary = rest.search(new RegExp(`\\n#{1,${level}} `));
	return boundary < 0 ? rest : rest.slice(0, boundary);
}

const OUTLINE_HEADINGS = [
	"# Website Blueprint",
	"## Website Overview",
	"### Crawl Summary",
	"## Information Architecture",
	"### Page Inventory",
	"### Hierarchical Relationships",
	"### Shared Navigation",
	"#### Page-Specific Links",
	"## Page Templates / Patterns",
	"## Page Details",
	"## Shared Elements",
	"## Crawl Coverage",
	"### Failed & Skipped Pages",
	"## Raw Evidence Appendix",
	"## Evidence & Interpretation Boundary",
];

describe("buildWebsiteBlueprint structure", () => {
	it("emits the target outline in order", () => {
		const markdown = buildWebsiteBlueprint({
			pages: navSite(4),
			sourceUrl: "https://example.test/",
			scope: { maxPages: 10, maxDepth: 2 },
		});
		const doc = `\n${markdown}`;
		let cursor = -1;
		for (const heading of OUTLINE_HEADINGS) {
			const index = doc.indexOf(`\n${heading}\n`);
			expect(index, heading).toBeGreaterThan(cursor);
			cursor = index;
		}
	});

	it("handles zero pages without inventing structure", () => {
		const markdown = buildWebsiteBlueprint({
			pages: [],
			sourceUrl: "https://example.test/",
		});
		expect(markdown).toContain("- Ditemukan: 0");
		expect(markdown).toContain("| Status | Halaman | URL | HTTP | Kedalaman |");
		expect(markdown).not.toContain("### Page: ");
		expect(markdown).toContain(
			"Navigasi bersama tidak dapat ditetapkan: kurang dari dua halaman membawa data tautan.",
		);
		expect(sectionOf(markdown, "## Page Templates / Patterns")).toContain(
			"Tidak ada pola halaman",
		);
	});

	it("handles a single page without claiming shared navigation", () => {
		const markdown = buildWebsiteBlueprint({
			pages: navSite(1),
			sourceUrl: "https://example.test/",
			scope: { maxPages: 10, maxDepth: 2 },
		});
		expect(markdown).toContain("- Ditemukan: 1");
		expect(markdown).toContain(
			"Navigasi bersama tidak dapat ditetapkan: kurang dari dua halaman membawa data tautan.",
		);
		expect(markdown).not.toContain("#### Page-Specific Links\n\n- ");
	});

	it("keeps the inventory accurate for ten pages", () => {
		const markdown = buildWebsiteBlueprint({
			pages: navSite(10),
			sourceUrl: "https://example.test/",
			scope: { maxPages: 10, maxDepth: 2 },
		});
		const rows = markdown
			.split("\n")
			.filter((line) => line.startsWith("| completed |"));
		expect(rows).toHaveLength(10);
		expect(markdown).toContain(
			"| completed | Blog | https://example.test/Blog |",
		);
	});
});

describe("buildWebsiteBlueprint navigation grouping", () => {
	it("groups repeated links as shared navigation and keeps page-specific links", () => {
		const pages = navSite(4);
		pages[1].content = content({
			...pages[1].content,
			outgoingPages: [
				"https://example.test/",
				"https://example.test/Blog",
				"https://example.test/Pricing",
				"https://example.test/Templates",
				"https://example.test/Blog/first-post",
			],
			internalLinks: [
				"https://example.test/",
				"https://example.test/Blog",
				"https://example.test/Pricing",
				"https://example.test/Templates",
				"https://example.test/Blog/first-post",
			],
		});
		const markdown = buildWebsiteBlueprint({
			pages,
			sourceUrl: "https://example.test/",
			scope: { maxPages: 10, maxDepth: 2 },
		});

		const shared = sectionOf(markdown, "### Shared Navigation");
		const specific = sectionOf(markdown, "#### Page-Specific Links");
		for (const label of ["Home", "Blog", "Pricing", "Templates"])
			expect(shared).toContain(label);
		expect(specific).toContain("https://example.test/Blog/first-post");
		expect(specific).not.toContain("https://example.test/Pricing");
	});

	it("does not group links that only repeat on some pages", () => {
		const pages = navSite(4);
		pages[1].content = content({
			...pages[1].content,
			outgoingPages: ["https://example.test/", "https://example.test/Blog"],
			internalLinks: ["https://example.test/", "https://example.test/Blog"],
		});
		pages[2].content = content({
			...pages[2].content,
			outgoingPages: ["https://example.test/", "https://example.test/Pricing"],
			internalLinks: ["https://example.test/", "https://example.test/Pricing"],
		});
		const markdown = buildWebsiteBlueprint({
			pages,
			sourceUrl: "https://example.test/",
		});
		const shared = sectionOf(markdown, "### Shared Navigation");
		expect(shared).toContain("Home");
		expect(shared).not.toContain("Blog —");
		expect(shared).not.toContain("Pricing —");
	});

	it("labels shared navigation as repeated links, not a verified component", () => {
		const markdown = buildWebsiteBlueprint({
			pages: navSite(4),
			sourceUrl: "https://example.test/",
		});
		const shared = sectionOf(markdown, "### Shared Navigation");
		expect(shared).toContain("Sumber elemen (navbar, footer, sidebar)");
		expect(shared).not.toMatch(
			/komponen navigasi yang terverifikasi|navbar terverifikasi|reusable/i,
		);
	});

	it("keeps every raw relationship reachable in the appendix", () => {
		const markdown = buildWebsiteBlueprint({
			pages: navSite(4),
			sourceUrl: "https://example.test/",
		});
		const appendix = sectionOf(markdown, "## Raw Evidence Appendix");
		expect(appendix).toContain("Outgoing pages (4)");
		expect(appendix).toContain("https://example.test/Pricing");
	});
});

describe("buildWebsiteBlueprint content cleanup", () => {
	it("drops decorative counter runs and reports the count", () => {
		const counter = Array.from({ length: 3 }, () => "0 1 2 3 4 5 6 7 8 9").join(
			" ",
		);
		const pages = [
			page({
				id: "a",
				url: "https://example.test/",
				title: "Home",
				content: content({
					headings: ["Home"],
					text: "Real copy",
					sections: [
						{ title: "Stats", level: 2, text: `${counter} customers served` },
					],
				}),
			}),
		];
		const markdown = buildWebsiteBlueprint({
			pages,
			sourceUrl: "https://example.test/",
		});
		const details = sectionOf(markdown, "## Page Details");
		expect(details).toContain("customers served");
		expect(details).not.toMatch(/0 1 2 3 4 5 6 7 8 9/);
		expect(markdown).toContain(
			"Rangkaian angka dekoratif (counter/animasi) dibuang dari ringkasan section: 1.",
		);
	});

	it("keeps short digit runs that read as an ordered list", () => {
		const pages = [
			page({
				id: "a",
				url: "https://example.test/",
				title: "Home",
				content: content({
					headings: ["Home"],
					sections: [
						{ title: "Steps", level: 2, text: "Langkah 1 2 3 4 selesai" },
					],
				}),
			}),
		];
		const markdown = buildWebsiteBlueprint({
			pages,
			sourceUrl: "https://example.test/",
		});
		expect(markdown).toContain("Langkah 1 2 3 4 selesai");
	});

	it("removes adjacent duplicate headings but keeps distant repeats", () => {
		const pages = [
			page({
				id: "a",
				url: "https://example.test/",
				title: "Home",
				content: content({
					headings: ["Features", "Features", "Pricing", "Pricing"],
					headingLevels: [
						{ level: 2, text: "Features" },
						{ level: 2, text: "Features" },
						{ level: 2, text: "Pricing" },
						{ level: 2, text: "Pricing" },
					],
				}),
			}),
		];
		const markdown = buildWebsiteBlueprint({
			pages,
			sourceUrl: "https://example.test/",
		});
		const details = sectionOf(markdown, "## Page Details");
		const occurrences = details.match(/- H2: Features/g) ?? [];
		expect(occurrences).toHaveLength(1);
		expect(details.match(/- H2: Pricing/g)).toHaveLength(1);
		expect(markdown).toContain(
			"Duplikat heading ekstraksi yang terbukti berurutan dibuang: 2.",
		);
	});

	it("keeps a repeated heading that is not adjacent", () => {
		const pages = [
			page({
				id: "a",
				url: "https://example.test/",
				title: "Home",
				content: content({
					headings: ["Pricing", "Features", "Pricing"],
					headingLevels: [
						{ level: 2, text: "Pricing" },
						{ level: 2, text: "Features" },
						{ level: 2, text: "Pricing" },
					],
				}),
			}),
		];
		const markdown = buildWebsiteBlueprint({
			pages,
			sourceUrl: "https://example.test/",
		});
		const details = sectionOf(markdown, "## Page Details");
		expect(details.match(/- H2: Pricing/g)).toHaveLength(2);
		expect(markdown).not.toContain("Duplikat heading ekstraksi");
	});

	it("breaks a long section into sentences without dropping text", () => {
		const long = `${"Kalimat pertama cukup panjang untuk melewati batas. ".repeat(6)}Akhir kalimat.`;
		const pages = [
			page({
				id: "a",
				url: "https://example.test/",
				title: "Home",
				content: content({
					headings: ["Home"],
					sections: [{ title: "Panjang", level: 2, text: long }],
				}),
			}),
		];
		const markdown = buildWebsiteBlueprint({
			pages,
			sourceUrl: "https://example.test/",
		});
		const details = sectionOf(markdown, "## Page Details");
		expect(details).toContain("Akhir kalimat.");
		expect(details.match(/ {4}- Kalimat pertama/g)?.length).toBeGreaterThan(1);
	});
});

describe("buildWebsiteBlueprint coverage honesty", () => {
	it("reports the page limit stopping the crawl before the depth limit", () => {
		const pages = navSite(4).map((row) => ({ ...row, depth: 1 }));
		const markdown = buildWebsiteBlueprint({
			pages,
			sourceUrl: "https://example.test/",
			scope: { maxPages: 4, maxDepth: 5 },
		});
		expect(markdown).toContain(
			"Batas jumlah halaman tercapai sebelum batas kedalaman",
		);
		expect(markdown).not.toMatch(
			/seluruh website (telah )?selesai dianalisis/i,
		);
	});

	it("reports the depth limit when it is reached", () => {
		const pages = navSite(4).map((row) => ({ ...row, depth: 2 }));
		const markdown = buildWebsiteBlueprint({
			pages,
			sourceUrl: "https://example.test/",
			scope: { maxPages: 20, maxDepth: 2 },
		});
		expect(markdown).toContain("Batas kedalaman tercapai selama crawl.");
		expect(markdown).not.toContain(
			"Batas jumlah halaman tercapai sebelum batas kedalaman",
		);
	});

	it("lists failed and skipped pages with their persisted reason", () => {
		const pages = [
			...navSite(2),
			page({
				id: "f",
				url: "https://example.test/gagal",
				depth: 1,
				status: "failed",
				httpStatus: 500,
				error: "HTTP 500",
			}),
			page({
				id: "s",
				url: "https://example.test/dilewati",
				depth: 1,
				status: "skipped",
				httpStatus: null,
				error: "Dibatasi robots.txt.",
			}),
		];
		const markdown = buildWebsiteBlueprint({
			pages,
			sourceUrl: "https://example.test/",
			scope: { maxPages: 10, maxDepth: 2 },
		});
		const section = sectionOf(markdown, "### Failed & Skipped Pages");
		expect(section).toContain("failed: https://example.test/gagal — HTTP 500");
		expect(section).toContain(
			"skipped: https://example.test/dilewati — Dibatasi robots.txt.",
		);
		expect(markdown).toContain("- Gagal: 1");
		expect(markdown).toContain("- Dilewati: 1");
	});
});

describe("buildWebsiteBlueprint url handling", () => {
	it("does not turn a relative link into a crawled-page edge", () => {
		const pages = [
			page({
				id: "a",
				url: "https://example.test/",
				title: "Home",
				content: content({
					headings: ["Home"],
					outgoingPages: ["/pricing", "https://example.test/blog"],
					internalLinks: ["/pricing", "https://example.test/blog"],
				}),
			}),
			page({
				id: "b",
				url: "https://example.test/blog",
				parentUrl: "https://example.test/",
				depth: 1,
				title: "Blog",
				content: content({
					headings: ["Blog"],
					outgoingPages: ["/pricing"],
					internalLinks: ["/pricing"],
				}),
			}),
		];
		const markdown = buildWebsiteBlueprint({
			pages,
			sourceUrl: "https://example.test/",
		});
		const specific = sectionOf(markdown, "#### Page-Specific Links");
		expect(specific).toContain("https://example.test/blog");
		expect(specific).not.toContain("/pricing");
		const appendix = sectionOf(markdown, "## Raw Evidence Appendix");
		expect(appendix).toContain("/pricing");
	});

	it("escapes markdown table pipes and keeps the raw url readable", () => {
		const pages = [
			page({
				id: "a",
				url: "https://example.test/a|b",
				title: "A | B",
				content: content({ headings: [] }),
			}),
		];
		const markdown = buildWebsiteBlueprint({
			pages,
			sourceUrl: "https://example.test/",
		});
		expect(markdown).toContain("A \\| B");
		expect(markdown).toContain("https://example.test/a|b");
	});

	it("escapes newlines inside table cells", () => {
		const pages = [
			page({
				id: "a",
				url: "https://example.test/a",
				title: "Baris\nsatu",
				content: content({ headings: [] }),
			}),
		];
		const markdown = buildWebsiteBlueprint({
			pages,
			sourceUrl: "https://example.test/",
		});
		const inventory = markdown.split("### Page Inventory")[1];
		expect(inventory).toContain("| completed | Baris satu |");
	});
});

describe("buildWebsiteBlueprint determinism and claims", () => {
	it("produces identical output for identical input", () => {
		const pages = navSite(4);
		const input = {
			pages,
			sourceUrl: "https://example.test/",
			scope: { maxPages: 10, maxDepth: 2 },
			capturedAt: "2026-10-12T00:00:00.000Z",
		};
		expect(buildWebsiteBlueprint(input)).toBe(buildWebsiteBlueprint(input));
	});

	it("does not promote observed tags into component claims", () => {
		const markdown = buildWebsiteBlueprint({
			pages: navSite(4),
			sourceUrl: "https://example.test/",
		});
		expect(markdown).not.toMatch(/reusable React component/i);
		expect(markdown).not.toMatch(/user journey/i);
		const details = sectionOf(markdown, "## Page Details");
		expect(details).toContain("Observed HTML elements: nav, header, footer");
	});

	it("writes page patterns only when headings repeat across pages", () => {
		const shared = navSite(4);
		const markdown = buildWebsiteBlueprint({
			pages: shared,
			sourceUrl: "https://example.test/",
		});
		const patterns = sectionOf(markdown, "## Page Templates / Patterns");
		expect(patterns).toContain("Struktur heading");
		expect(patterns).toContain("h1");

		const unique = navSite(4).map((row, index) => ({
			...row,
			content: content({
				...row.content,
				headingLevels: Array.from({ length: index + 1 }, () => ({
					level: 2,
					text: "Section",
				})),
			}),
		}));
		const single = buildWebsiteBlueprint({
			pages: unique,
			sourceUrl: "https://example.test/",
		});
		expect(single).toContain(
			"Tidak ada pola halaman yang dapat dibuktikan dari data crawl.",
		);
	});

	it("keeps the download filename contract stable", () => {
		const markdown = buildWebsiteBlueprint({
			pages: navSite(2),
			sourceUrl: "https://example.test/",
		});
		expect(markdown.startsWith("# Website Blueprint\n")).toBe(true);
		expect(markdown.endsWith("\n")).toBe(true);
	});
});
