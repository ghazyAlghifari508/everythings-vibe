import { describe, expect, it } from "vitest";
import { HELP_ARTICLES } from "../data/articles";
import { searchHelpArticles, searchTokens } from "../lib/search";

function topId(query: string): string | undefined {
	return searchHelpArticles(query, HELP_ARTICLES)[0]?.article.id;
}

describe("local help search", () => {
	it("returns no results for empty or whitespace queries", () => {
		expect(searchHelpArticles("", HELP_ARTICLES)).toEqual([]);
		expect(searchHelpArticles("   ", HELP_ARTICLES)).toEqual([]);
		expect(searchTokens("Kredit Habis!")).toEqual(["kredit", "habis"]);
	});

	it("finds the expected guide for common Indonesian tasks", () => {
		expect(topId("kredit habis")).toBe("cara-kerja-kredit");
		expect(topId("revisi desain")).toBe("revisi-desain");
		expect(topId("scrape gambar")).toBe("empat-mode-scrape");
		expect(topId("sinkronisasi repository")).toBe("sync-repository");
		expect(topId("api key")).toBe("api-key-dan-keamanan");
		expect(topId("generate prd")).toBe("prd-dan-revisi");
	});

	it("matches aliases stored in keywords and article contents", () => {
		expect(topId("PRD")).toBe("prd-dan-revisi");
		expect(topId("kanban")).toBe("ac-task-kanban");
		expect(topId("DESIGN.md")).toBe("empat-mode-scrape");
		expect(topId("top up")).toBe("top-up-dan-pembayaran");
	});

	it("returns an empty result set when no token matches", () => {
		expect(searchHelpArticles("resep masakan rendang", HELP_ARTICLES)).toEqual([]);
	});

	it("requires every token to match and ranks by relevance", () => {
		const results = searchHelpArticles("revisi prd", HELP_ARTICLES);
		expect(results.length).toBeGreaterThan(0);
		expect(results[0]?.article.id).toBe("prd-dan-revisi");
		for (const [index, result] of results.entries()) {
			if (index === 0) continue;
			expect(result.score).toBeLessThanOrEqual(results[index - 1]?.score ?? 0);
		}
	});
});
