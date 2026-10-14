import { describe, expect, it } from "vitest";
import { normalizeScrapeInput, scrapeRequestSchema } from "./scrape-contract";

describe("scrape request contract", () => {
	it("defaults saved design requests and preserves all five selected settings", () => {
		const defaults = scrapeRequestSchema.parse({ url: "sample.example" });
		expect(defaults).toMatchObject({
			settings: {
				viewport: "desktop",
				theme: "auto",
				depth: "standard",
				focus: "complete",
				codeReference: "both",
			},
		});
		const settings = {
			viewport: "both",
			theme: "both",
			depth: "detailed",
			focus: "components",
			codeReference: "css",
		};
		expect(
			scrapeRequestSchema.parse({
				url: "sample.example",
				mode: "design",
				settings,
			}),
		).toMatchObject({ settings });
	});

	it.each([
		{ viewport: "tablet" },
		{ theme: "sepia" },
		{ depth: "unlimited" },
		{ focus: "other" },
		{ codeReference: "v3" },
		{ waitMs: 1 },
	])("rejects unsupported design settings %j", (settings) => {
		expect(
			scrapeRequestSchema.safeParse({
				url: "sample.example",
				mode: "design",
				settings,
			}).success,
		).toBe(false);
	});
	it("normalizes domains while preserving explicit protocol, path and query", () => {
		expect(normalizeScrapeInput("sample.example:8080/path")).toBe(
			"https://sample.example:8080/path",
		);
		expect(normalizeScrapeInput(" sample.example/path?q=1 ")).toBe(
			"https://sample.example/path?q=1",
		);
		expect(normalizeScrapeInput("http://sub.sample.example/path")).toBe(
			"http://sub.sample.example/path",
		);
	});

	it.each([
		"ftp://sample.example",
		"javascript:alert(1)",
		"https://user:password@sample.example",
		"https://localhost",
		"http://127.0.0.1",
		"https://https://sample.example",
		"",
	])("rejects unsafe or malformed input %s", (url) => {
		expect(scrapeRequestSchema.safeParse({ url, mode: "html" }).success).toBe(
			false,
		);
	});

	it("defaults legacy requests to design and rejects explicit unknown modes", () => {
		expect(scrapeRequestSchema.parse({ url: "sample.example" }).mode).toBe(
			"design",
		);
		expect(
			scrapeRequestSchema.safeParse({ url: "sample.example", mode: "other" })
				.success,
		).toBe(false);
	});

	it("preserves depth zero and actual include settings", () => {
		const parsed = scrapeRequestSchema.parse({
			url: "sample.example",
			mode: "crawl",
			settings: { maxDepth: 0, includeLinks: false, includeImages: false },
		});
		expect(parsed.mode).toBe("crawl");
		if (parsed.mode !== "crawl") throw new Error("Unexpected mode");
		expect(parsed.settings.maxDepth).toBe(0);
		expect(parsed.settings.includeLinks).toBe(false);
		expect(parsed.settings.includeImages).toBe(false);
		expect(parsed.settings.followSubdomains).toBe(false);
	});

	it.each([0, -1, 1.5, 1000000])("rejects invalid max pages %s", (maxPages) => {
		expect(
			scrapeRequestSchema.safeParse({
				url: "sample.example",
				mode: "crawl",
				settings: { maxPages },
			}).success,
		).toBe(false);
	});

	it("rejects incompatible options instead of discarding them", () => {
		expect(
			scrapeRequestSchema.safeParse({
				url: "sample.example",
				mode: "images",
				settings: { includeIframes: true },
			}).success,
		).toBe(false);
	});

	it("rejects invalid regex syntax and unbounded capture waits", () => {
		expect(
			scrapeRequestSchema.safeParse({
				url: "sample.example",
				mode: "crawl",
				settings: { urlRegex: "[" },
			}).success,
		).toBe(false);
		expect(
			scrapeRequestSchema.safeParse({
				url: "sample.example",
				mode: "html",
				settings: { waitMs: 1000000 },
			}).success,
		).toBe(false);
	});
});
