import { describe, expect, it } from "vitest";
import {
	parseScrapeReturnSearch,
	resolveScrapeReturnPath,
	SCRAPE_RETURN_FALLBACK,
} from "@/features/scrape/utils/scrape-return-path";

describe("scrape return search parsing", () => {
	it("accepts the canonical internal routes", () => {
		expect(SCRAPE_RETURN_FALLBACK).toBe("/scrape");
		expect(parseScrapeReturnSearch({ from: "/scrape" })).toEqual({
			from: "/scrape",
		});
		expect(parseScrapeReturnSearch({ from: "/scrape/history" })).toEqual({
			from: "/scrape/history",
		});
	});

	it("normalizes exact legacy return contexts to canonical routes", () => {
		expect(parseScrapeReturnSearch({ from: "/design/scrap" })).toEqual({
			from: "/scrape",
		});
		expect(parseScrapeReturnSearch({ from: "/design/scrap/history" })).toEqual({
			from: "/scrape/history",
		});
	});

	it("falls back instead of throwing on a hostile or malformed query", () => {
		for (const search of [
			{ from: "https://evil.example" },
			{ from: "//evil.example" },
			{ from: "javascript:alert(1)" },
			{ from: 42 },
			{ from: null },
			{ from: ["/design/scrap"] },
			{ unexpected: "x" },
		])
			expect(parseScrapeReturnSearch(search)).toEqual({
				from: SCRAPE_RETURN_FALLBACK,
			});
	});

	it("never returns a destination outside the allowlist", () => {
		for (const search of [
			{ from: "/admin/users" },
			{ from: "/design/scrap/abc" },
			{ from: "/design/scrap?x=<script>" },
		]) {
			const parsed = parseScrapeReturnSearch(search);
			expect(["/scrape", "/scrape/history"]).toContain(parsed.from);
		}
	});
});

describe("resolveScrapeReturnPath", () => {
	it("returns the originating scrap route", () => {
		expect(resolveScrapeReturnPath("/scrape")).toBe("/scrape");
		expect(resolveScrapeReturnPath("/design/scrap")).toBe("/scrape");
	});

	it("returns the originating history route", () => {
		expect(resolveScrapeReturnPath("/scrape/history")).toBe("/scrape/history");
		expect(resolveScrapeReturnPath("/design/scrap/history")).toBe(
			"/scrape/history",
		);
	});

	it("falls back when there is no recorded origin", () => {
		for (const from of [undefined, null, "", 123, true, {}])
			expect(resolveScrapeReturnPath(from)).toBe(SCRAPE_RETURN_FALLBACK);
	});

	it("rejects external and protocol-relative destinations", () => {
		for (const from of [
			"https://evil.example/phish",
			"//evil.example/phish",
			"javascript:alert(1)",
			"http://evil.example",
			"data:text/html,<script>alert(1)</script>",
		])
			expect(resolveScrapeReturnPath(from)).toBe(SCRAPE_RETURN_FALLBACK);
	});

	it("rejects paths outside the VibeDesign scrape area", () => {
		for (const from of [
			"/admin/users",
			"/pricing",
			"/fitur/abc",
			"/design",
			"/design/abc",
			"/",
		])
			expect(resolveScrapeReturnPath(from)).toBe(SCRAPE_RETURN_FALLBACK);
	});

	it("rejects the result route itself to avoid a self-referencing loop", () => {
		expect(resolveScrapeReturnPath("/scrape/abc")).toBe(SCRAPE_RETURN_FALLBACK);
		expect(resolveScrapeReturnPath("/design/scrap/abc")).toBe(
			SCRAPE_RETURN_FALLBACK,
		);
	});

	it("rejects control characters and traversal attempts", () => {
		for (const from of [
			"/scrape\n/evil",
			"/scrape ",
			"/scrape/../../admin",
			"/scrape?x=<script>",
			"/scrape#frag",
			"/scrape/history/../admin",
			"/scrape/",
			"/scrape/history/",
			"/scrape/history-extra",
			"/design/scrap/",
			"/design/scrap/history/",
			"/design/scrap/history-extra",
			"/design/scrap\n/evil",
			"/design/scrap ",
			"/design/scrap/../../admin",
			"/design/scrap?x=<script>",
			"/design/scrap#frag",
			"/design/scrap/history/../admin",
		])
			expect(resolveScrapeReturnPath(from)).toBe(SCRAPE_RETURN_FALLBACK);
	});
});
