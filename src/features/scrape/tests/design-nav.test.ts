import { describe, expect, it } from "vitest";
import {
	isVibeDesignHistoryActive,
	isVibeDesignScrapActive,
	isVibeDesignScrapRoute,
} from "@/features/scrape/utils/design-nav";

describe("VibeDesign Scrap Route Predicates", () => {
	it.each([
		"/scrape",
		"/design/scrap",
	])("recognizes %s route boundaries while separating history from results", (root) => {
		for (const suffix of ["", "/", "/history", "/history/", "/abc-123"])
			expect(isVibeDesignScrapRoute(`${root}${suffix}`)).toBe(true);
		for (const suffix of ["", "/", "/abc-123", "/history-extra"])
			expect(isVibeDesignScrapActive(`${root}${suffix}`)).toBe(true);
		for (const suffix of ["/history", "/history/", "/history/abc"])
			expect(isVibeDesignHistoryActive(`${root}${suffix}`)).toBe(true);
		expect(isVibeDesignScrapActive(`${root}/history`)).toBe(false);
		expect(isVibeDesignHistoryActive(`${root}/history-extra`)).toBe(false);
		expect(isVibeDesignScrapRoute(`${root}-extra`)).toBe(false);
		expect(isVibeDesignScrapActive(`${root}-extra`)).toBe(false);
	});

	it.each([
		"/design/studio",
		"/design/studio/abc",
		"/scraper",
		"/scrape-extra",
	])("excludes %s from every scrape nav predicate", (pathname) => {
		expect(isVibeDesignScrapRoute(pathname)).toBe(false);
		expect(isVibeDesignScrapActive(pathname)).toBe(false);
		expect(isVibeDesignHistoryActive(pathname)).toBe(false);
	});

	it("identifies all VibeDesign Scrap routes correctly", () => {
		expect(isVibeDesignScrapRoute("/design/scrap")).toBe(true);
		expect(isVibeDesignScrapRoute("/design/scrap/")).toBe(true);
		expect(isVibeDesignScrapRoute("/design/scrap/history")).toBe(true);
		expect(isVibeDesignScrapRoute("/design/scrap/abc-123")).toBe(true);

		// Negative checks: unrelated routes
		expect(isVibeDesignScrapRoute("/")).toBe(false);
		expect(isVibeDesignScrapRoute("/pricing")).toBe(false);
		expect(isVibeDesignScrapRoute("/design/studio")).toBe(false);
		expect(isVibeDesignScrapRoute("/history")).toBe(false);
		expect(isVibeDesignScrapRoute("/plan/new")).toBe(false);
	});

	it("identifies Scrap active state without falsely matching History", () => {
		expect(isVibeDesignScrapActive("/design/scrap")).toBe(true);
		expect(isVibeDesignScrapActive("/design/scrap/")).toBe(true);
		expect(isVibeDesignScrapActive("/design/scrap/abc-123")).toBe(true);

		// History route must NOT mark Scrap active
		expect(isVibeDesignScrapActive("/design/scrap/history")).toBe(false);
		expect(isVibeDesignScrapActive("/design/scrap/history/")).toBe(false);

		// Unrelated routes
		expect(isVibeDesignScrapActive("/pricing")).toBe(false);
		expect(isVibeDesignScrapActive("/")).toBe(false);
	});

	it("identifies History active state specifically", () => {
		expect(isVibeDesignHistoryActive("/design/scrap/history")).toBe(true);
		expect(isVibeDesignHistoryActive("/design/scrap/history/")).toBe(true);

		// Scrap landing and result pages must NOT mark History active
		expect(isVibeDesignHistoryActive("/design/scrap")).toBe(false);
		expect(isVibeDesignHistoryActive("/design/scrap/abc-123")).toBe(false);
		expect(isVibeDesignHistoryActive("/history")).toBe(false);
	});
});
