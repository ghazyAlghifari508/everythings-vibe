import { describe, expect, it } from "vitest";
import {
	parseScrapeWorkspaceSearch,
	resolveScrapeWorkspaceMode,
} from "@/features/scrape/types/scrape-contract";

describe("parseScrapeWorkspaceSearch", () => {
	it("reads a supported mode from the URL", () => {
		expect(parseScrapeWorkspaceSearch({ mode: "images" }).mode).toBe("images");
		expect(parseScrapeWorkspaceSearch({ mode: "crawl" }).mode).toBe("crawl");
		expect(parseScrapeWorkspaceSearch({ mode: "html" }).mode).toBe("html");
		expect(parseScrapeWorkspaceSearch({ mode: "design" }).mode).toBe("design");
	});

	it("keeps the search optional so existing workspace links still resolve", () => {
		expect(parseScrapeWorkspaceSearch({})).toEqual({});
		expect(parseScrapeWorkspaceSearch(null)).toEqual({});
	});

	it("drops an unrecognised mode instead of trusting it", () => {
		expect(parseScrapeWorkspaceSearch({ mode: "unknown" })).toEqual({});
		expect(parseScrapeWorkspaceSearch({ mode: 42 })).toEqual({});
	});

	it("keeps unrelated search params out of the parsed result", () => {
		expect(
			parseScrapeWorkspaceSearch({ mode: "images", injected: "x" }),
		).toEqual({ mode: "images" });
	});
});

describe("resolveScrapeWorkspaceMode", () => {
	it("uses the requested mode when it is valid", () => {
		expect(resolveScrapeWorkspaceMode({ mode: "images" })).toBe("images");
	});

	it("defaults to design mode when no mode was requested and session is empty", () => {
		if (typeof window !== "undefined") {
			window.sessionStorage.clear();
		}
		expect(resolveScrapeWorkspaceMode({})).toBe("design");
	});

	it("uses remembered session mode when no mode was requested in URL", () => {
		if (typeof window !== "undefined") {
			window.sessionStorage.setItem("vibescrape:mode", "html");
			expect(resolveScrapeWorkspaceMode({})).toBe("html");
			window.sessionStorage.clear();
		}
	});

	it("prioritizes explicit valid URL mode over session mode", () => {
		if (typeof window !== "undefined") {
			window.sessionStorage.setItem("vibescrape:mode", "html");
			expect(resolveScrapeWorkspaceMode({ mode: "images" })).toBe("images");
			window.sessionStorage.clear();
		}
	});
});
