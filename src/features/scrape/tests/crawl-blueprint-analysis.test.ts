import { describe, expect, it } from "vitest";
import type { scrapePages } from "@/db/schema";
import {
	cleanDecorativeDigitRuns,
	dedupeHeadings,
	describePage,
	sectionSentences,
} from "@/features/scrape/utils/crawl-blueprint-content";
import { deriveCoverage } from "@/features/scrape/utils/crawl-blueprint-coverage";
import { deriveSharedNavigation } from "@/features/scrape/utils/crawl-blueprint-nav";
import {
	derivePagePatterns,
	deriveSharedElements,
} from "@/features/scrape/utils/crawl-blueprint-patterns";

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

describe("deriveSharedNavigation", () => {
	it("returns nothing for zero or one link-bearing page", () => {
		expect(deriveSharedNavigation([]).shared).toEqual([]);
		const single = deriveSharedNavigation([
			page({
				id: "a",
				url: "https://example.test/",
				content: content({ outgoingPages: ["https://example.test/b"] }),
			}),
		]);
		expect(single.shared).toEqual([]);
		expect(single.linkSources).toEqual(["https://example.test/"]);
	});

	it("groups a target linked from every other link-bearing page", () => {
		const result = deriveSharedNavigation([
			page({
				id: "a",
				url: "https://example.test/",
				title: "Home",
				content: content({
					outgoingPages: [
						"https://example.test/",
						"https://example.test/b",
						"https://example.test/c",
					],
				}),
			}),
			page({
				id: "b",
				url: "https://example.test/b",
				title: "Blog",
				content: content({
					outgoingPages: [
						"https://example.test/",
						"https://example.test/b",
						"https://example.test/c",
					],
				}),
			}),
			page({
				id: "c",
				url: "https://example.test/c",
				title: "Docs",
				content: content({
					outgoingPages: [
						"https://example.test/",
						"https://example.test/b",
						"https://example.test/c",
					],
				}),
			}),
		]);
		expect(result.shared.map((target) => target.url)).toEqual([
			"https://example.test/",
			"https://example.test/b",
			"https://example.test/c",
		]);
		expect(result.shared[0].sources).toEqual([
			"https://example.test/b",
			"https://example.test/c",
		]);
		expect(result.pageSpecific).toEqual([]);
	});

	it("keeps a two-page link as page-specific because one source is not repetition", () => {
		const result = deriveSharedNavigation([
			page({
				id: "a",
				url: "https://example.test/",
				content: content({ outgoingPages: ["https://example.test/b"] }),
			}),
			page({
				id: "b",
				url: "https://example.test/b",
				content: content({ outgoingPages: ["https://example.test/"] }),
			}),
		]);
		expect(result.shared).toEqual([]);
		expect(result.pageSpecific).toEqual([
			{ from: "https://example.test/", to: "https://example.test/b" },
			{ from: "https://example.test/b", to: "https://example.test/" },
		]);
	});

	it("ignores pages that carry no link evidence", () => {
		const result = deriveSharedNavigation([
			page({
				id: "a",
				url: "https://example.test/",
				content: content({ outgoingPages: ["https://example.test/b"] }),
			}),
			page({
				id: "b",
				url: "https://example.test/b",
				content: content({ outgoingPages: [] }),
			}),
			page({
				id: "c",
				url: "https://example.test/c",
				content: content({ outgoingPages: ["https://example.test/b"] }),
			}),
		]);
		expect(result.linkSources).toEqual([
			"https://example.test/",
			"https://example.test/c",
		]);
		expect(result.shared.map((target) => target.url)).toEqual([
			"https://example.test/b",
		]);
	});

	it("excludes self links and duplicate edges", () => {
		const result = deriveSharedNavigation([
			page({
				id: "a",
				url: "https://example.test/",
				content: content({
					outgoingPages: [
						"https://example.test/",
						"https://example.test/b",
						"https://example.test/b",
					],
				}),
			}),
			page({
				id: "b",
				url: "https://example.test/b",
				content: content({ outgoingPages: ["https://example.test/"] }),
			}),
			page({
				id: "c",
				url: "https://example.test/c",
				content: content({
					outgoingPages: ["https://example.test/", "https://example.test/b"],
				}),
			}),
		]);
		expect(result.pageSpecific).toEqual([
			{ from: "https://example.test/", to: "https://example.test/b" },
			{ from: "https://example.test/c", to: "https://example.test/b" },
		]);
	});

	it("is deterministic across runs", () => {
		const pages = [
			page({
				id: "a",
				url: "https://example.test/",
				content: content({
					outgoingPages: ["https://example.test/b", "https://example.test/c"],
				}),
			}),
			page({
				id: "b",
				url: "https://example.test/b",
				content: content({
					outgoingPages: ["https://example.test/c", "https://example.test/a"],
				}),
			}),
			page({
				id: "c",
				url: "https://example.test/c",
				content: content({
					outgoingPages: ["https://example.test/a", "https://example.test/b"],
				}),
			}),
		];
		expect(deriveSharedNavigation(pages)).toEqual(
			deriveSharedNavigation(pages),
		);
	});
});

describe("cleanDecorativeDigitRuns", () => {
	it("drops a ladder that counts up one digit at a time", () => {
		expect(
			cleanDecorativeDigitRuns("Nilai 0 1 2 3 4 5 6 7 8 9 selesai").text,
		).toBe("Nilai selesai");
	});

	it("drops a counter that cycles the whole range repeatedly", () => {
		const cycled = Array.from({ length: 3 }, () => "0 1 2 3 4 5 6 7 8 9").join(
			" ",
		);
		const result = cleanDecorativeDigitRuns(`Awal ${cycled} akhir`);
		expect(result.text).toBe("Awal akhir");
		expect(result.removedRuns).toBe(1);
	});

	it("keeps short digit runs that read as an ordered list", () => {
		expect(cleanDecorativeDigitRuns("Langkah 1 2 3 4 selesai").text).toBe(
			"Langkah 1 2 3 4 selesai",
		);
		expect(
			cleanDecorativeDigitRuns("Langkah 1 2 3 4 selesai").removedRuns,
		).toBe(0);
	});

	it("keeps multi-digit numbers and digits inside words", () => {
		const value = "Harga 25000 untuk 40 unit pada tahun 2026 dan v2";
		expect(cleanDecorativeDigitRuns(value).text).toBe(value);
	});

	it("counts each decorative run separately", () => {
		const result = cleanDecorativeDigitRuns(
			"0 1 2 3 4 5 6 7 8 9 tengah 9 8 7 6 5 4 3 2 1 0 akhir",
		);
		expect(result.text).toBe("tengah akhir");
		expect(result.removedRuns).toBe(2);
	});
});

describe("dedupeHeadings", () => {
	it("drops only adjacent duplicates that share level and text", () => {
		const result = dedupeHeadings([
			{ level: 2, text: "Fitur" },
			{ level: 2, text: "fitur " },
			{ level: 3, text: "Fitur" },
			{ level: 2, text: "Harga" },
			{ level: 2, text: "Harga" },
		]);
		expect(result.headings).toEqual([
			{ level: 2, text: "Fitur" },
			{ level: 3, text: "Fitur" },
			{ level: 2, text: "Harga" },
		]);
		expect(result.removedDuplicates).toBe(2);
	});

	it("keeps a repeated heading that is separated by another heading", () => {
		const result = dedupeHeadings([
			{ level: 2, text: "Harga" },
			{ level: 2, text: "Fitur" },
			{ level: 2, text: "Harga" },
		]);
		expect(result.headings).toHaveLength(3);
		expect(result.removedDuplicates).toBe(0);
	});

	it("treats a null level as its own bucket", () => {
		const result = dedupeHeadings([
			{ level: null, text: "Sama" },
			{ level: null, text: "Sama" },
			{ level: 2, text: "Sama" },
		]);
		expect(result.headings).toHaveLength(2);
		expect(result.removedDuplicates).toBe(1);
	});
});

describe("describePage", () => {
	it("prefers the published meta description", () => {
		const result = describePage(
			content({ description: "Deskripsi resmi halaman." }),
		);
		expect(result).toEqual({
			text: "Deskripsi resmi halaman.",
			source: "meta",
		});
	});

	it("derives from the first section when no meta description exists", () => {
		const result = describePage(
			content({
				sections: [
					{ title: "Fitur", level: 2, text: "Kalimat pertama. Kalimat kedua." },
				],
			}),
		);
		expect(result).toEqual({
			text: "Fitur. Kalimat pertama.",
			source: "content",
		});
	});

	it("returns null when nothing describes the page", () => {
		expect(describePage(content())).toBeNull();
	});

	it("does not leak decorative counters into the description", () => {
		const result = describePage(
			content({
				sections: [
					{
						title: "Statistik",
						level: 2,
						text: "0 1 2 3 4 5 6 7 8 9 pelanggan aktif.",
					},
				],
			}),
		);
		expect(result?.text).toBe("Statistik. pelanggan aktif.");
	});
});

describe("sectionSentences", () => {
	it("returns a short section whole", () => {
		expect(sectionSentences("Kalimat pendek.")).toEqual(["Kalimat pendek."]);
	});

	it("splits a long section into sentences without dropping any", () => {
		const text = Array.from(
			{ length: 8 },
			(_, index) => `Kalimat nomor ${index} cukup panjang.`,
		).join(" ");
		const sentences = sectionSentences(text);
		expect(sentences).toHaveLength(8);
		expect(sentences.at(-1)).toContain("Kalimat nomor 7");
	});

	it("returns nothing for empty input", () => {
		expect(sectionSentences("   ")).toEqual([]);
	});
});

describe("derivePagePatterns", () => {
	it("groups pages that share a heading skeleton", () => {
		const patterns = derivePagePatterns([
			page({
				id: "a",
				url: "https://example.test/a",
				content: content({
					headingLevels: [
						{ level: 1, text: "A" },
						{ level: 2, text: "Isi" },
					],
				}),
			}),
			page({
				id: "b",
				url: "https://example.test/b",
				content: content({
					headingLevels: [
						{ level: 1, text: "B" },
						{ level: 2, text: "Lain" },
					],
				}),
			}),
		]);
		expect(patterns).toHaveLength(1);
		expect(patterns[0].signature).toBe("h1 > h2");
		expect(patterns[0].pages).toEqual([
			"https://example.test/a",
			"https://example.test/b",
		]);
		expect(patterns[0].identicalHeadingText).toBe(false);
	});

	it("reports identical heading text when the outline matches too", () => {
		const patterns = derivePagePatterns([
			page({
				id: "a",
				url: "https://example.test/a",
				content: content({
					headingLevels: [
						{ level: 1, text: "Sama" },
						{ level: 2, text: "Isi" },
					],
				}),
			}),
			page({
				id: "b",
				url: "https://example.test/b",
				content: content({
					headingLevels: [
						{ level: 1, text: "Sama" },
						{ level: 2, text: "Isi" },
					],
				}),
			}),
		]);
		expect(patterns[0].identicalHeadingText).toBe(true);
	});

	it("invents no pattern for a single page or distinct skeletons", () => {
		expect(
			derivePagePatterns([
				page({
					id: "a",
					url: "https://example.test/a",
					content: content({ headingLevels: [{ level: 1, text: "A" }] }),
				}),
			]),
		).toEqual([]);
		expect(
			derivePagePatterns([
				page({
					id: "a",
					url: "https://example.test/a",
					content: content({ headingLevels: [{ level: 1, text: "A" }] }),
				}),
				page({
					id: "b",
					url: "https://example.test/b",
					content: content({
						headingLevels: [
							{ level: 1, text: "B" },
							{ level: 2, text: "Isi" },
						],
					}),
				}),
			]),
		).toEqual([]);
	});

	it("ignores pages with no captured headings", () => {
		expect(
			derivePagePatterns([
				page({ id: "a", url: "https://example.test/a", content: content() }),
				page({ id: "b", url: "https://example.test/b", content: content() }),
			]),
		).toEqual([]);
	});
});

describe("deriveSharedElements", () => {
	it("reports tags observed on more than one page", () => {
		const evidence = deriveSharedElements([
			page({
				id: "a",
				url: "https://example.test/a",
				content: content({ patterns: ["nav", "form"] }),
			}),
			page({
				id: "b",
				url: "https://example.test/b",
				content: content({ patterns: ["nav", "footer"] }),
			}),
		]);
		expect(evidence).toEqual([
			{
				tag: "nav",
				pages: ["https://example.test/a", "https://example.test/b"],
			},
		]);
	});

	it("reports nothing when a tag appears on a single page", () => {
		expect(
			deriveSharedElements([
				page({
					id: "a",
					url: "https://example.test/a",
					content: content({ patterns: ["nav"] }),
				}),
				page({
					id: "b",
					url: "https://example.test/b",
					content: content({ patterns: ["form"] }),
				}),
			]),
		).toEqual([]);
	});
});

describe("deriveCoverage", () => {
	it("reports an empty crawl", () => {
		expect(deriveCoverage([])).toEqual({
			discovered: 0,
			completed: 0,
			skipped: 0,
			failed: 0,
			queued: 0,
			minDepth: null,
			maxDepth: null,
			pageLimitReached: false,
			depthLimitReached: false,
			stoppedByPageLimit: false,
		});
	});

	it("flags the page limit stopping the crawl before the depth limit", () => {
		const pages = Array.from({ length: 10 }, (_, index) =>
			page({
				id: `p${index}`,
				url: `https://example.test/p${index}`,
				depth: index === 0 ? 0 : 1,
			}),
		);
		const coverage = deriveCoverage(pages, { maxPages: 10, maxDepth: 2 });
		expect(coverage.pageLimitReached).toBe(true);
		expect(coverage.depthLimitReached).toBe(false);
		expect(coverage.stoppedByPageLimit).toBe(true);
		expect(coverage.maxDepth).toBe(1);
	});

	it("flags the depth limit when it is reached", () => {
		const pages = [
			page({ id: "a", url: "https://example.test/a", depth: 0 }),
			page({ id: "b", url: "https://example.test/b", depth: 2 }),
		];
		const coverage = deriveCoverage(pages, { maxPages: 10, maxDepth: 2 });
		expect(coverage.depthLimitReached).toBe(true);
		expect(coverage.stoppedByPageLimit).toBe(false);
	});

	it("does not claim a limit without a scope", () => {
		const pages = [
			page({ id: "a", url: "https://example.test/a", depth: 0 }),
			page({ id: "b", url: "https://example.test/b", depth: 1 }),
		];
		const coverage = deriveCoverage(pages);
		expect(coverage.pageLimitReached).toBe(false);
		expect(coverage.stoppedByPageLimit).toBe(false);
		expect(coverage.minDepth).toBe(0);
		expect(coverage.maxDepth).toBe(1);
	});

	it("counts every persisted status", () => {
		const pages = [
			page({ id: "a", url: "https://example.test/a", status: "completed" }),
			page({ id: "b", url: "https://example.test/b", status: "failed" }),
			page({ id: "c", url: "https://example.test/c", status: "skipped" }),
			page({ id: "d", url: "https://example.test/d", status: "queued" }),
		];
		const coverage = deriveCoverage(pages);
		expect(coverage).toMatchObject({
			discovered: 4,
			completed: 1,
			failed: 1,
			skipped: 1,
			queued: 1,
		});
	});
});
