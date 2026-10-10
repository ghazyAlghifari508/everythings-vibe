import { describe, expect, it } from "vitest";
import {
	resolveScrapeReturnPath,
	SCRAPE_RETURN_FALLBACK,
} from "./scrape-return-path";

describe("resolveScrapeReturnPath", () => {
	it("returns the originating scrap route", () => {
		expect(resolveScrapeReturnPath("/design/scrap")).toBe("/design/scrap");
	});

	it("returns the originating history route", () => {
		expect(resolveScrapeReturnPath("/design/scrap/history")).toBe(
			"/design/scrap/history",
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
			"/design/studio/abc",
			"/",
		])
			expect(resolveScrapeReturnPath(from)).toBe(SCRAPE_RETURN_FALLBACK);
	});

	it("rejects the result route itself to avoid a self-referencing loop", () => {
		expect(resolveScrapeReturnPath("/design/scrap/abc")).toBe(
			SCRAPE_RETURN_FALLBACK,
		);
	});

	it("rejects control characters and traversal attempts", () => {
		for (const from of [
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
