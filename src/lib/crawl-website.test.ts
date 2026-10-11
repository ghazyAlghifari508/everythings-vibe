import { describe, expect, it } from "vitest";
import { crawlWebsite, isCrawlScope, robotsAllows } from "./crawl-website";
import { crawlSettingsSchema } from "./scrape-contract";

describe("website traversal", () => {
	it("resumes a persisted frontier without refetching completed pages", async () => {
		const calls: string[] = [];
		const pages = await crawlWebsite(
			"https://sample.example/",
			crawlSettingsSchema.parse({ includeLinks: false }),
			{
				completed: [
					{
						url: "https://sample.example/",
						parentUrl: null,
						depth: 0,
						status: "completed",
						title: "Sample",
						httpStatus: 200,
						content: {
							description: null,
							headings: [],
							text: "Sample",
							links: [],
							images: [],
							patterns: [],
						},
						error: null,
					},
				],
				frontier: [
					{
						url: "https://sample.example/next",
						parentUrl: "https://sample.example/",
						depth: 1,
					},
				],
				load: async (url) => {
					calls.push(url);
					return {
						html: "<html><body>Next page</body></html>",
						status: 200,
						finalUrl: url,
					};
				},
				robots: async () => "",
			},
		);
		expect(calls).toEqual(["https://sample.example/next"]);
		expect(pages.map((page) => page.status)).toEqual([
			"completed",
			"completed",
		]);
	});
	it("restricts scope to the seed host and explicitly permitted descendants", () => {
		expect(
			isCrawlScope(
				"https://child.sample.example/a",
				"https://sample.example",
				false,
			),
		).toBe(false);
		expect(
			isCrawlScope(
				"https://child.sample.example/a",
				"https://sample.example",
				true,
			),
		).toBe(true);
		expect(
			isCrawlScope(
				"https://sample.example.evil.test/a",
				"https://sample.example",
				true,
			),
		).toBe(false);
	});
	it("honors robots allow precedence", () => {
		const rules = "User-agent: *\nDisallow: /private/\nAllow: /private/public/";
		expect(robotsAllows(rules, "/private/account")).toBe(false);
		expect(robotsAllows(rules, "/private/public/article")).toBe(true);
	});
	it("applies rules shared by multiple robots user agents", () => {
		expect(
			robotsAllows(
				"User-agent: *\nUser-agent: OtherBot\nDisallow: /restricted",
				"/restricted",
			),
		).toBe(false);
	});
	it("depth zero captures only the seed and include flags change output", async () => {
		const calls: string[] = [];
		const pages = await crawlWebsite(
			"https://sample.example/",
			crawlSettingsSchema.parse({
				maxDepth: 0,
				includeLinks: false,
				includeImages: false,
			}),
			{
				load: async (url) => {
					calls.push(url);
					return {
						html: '<html><title>Sample</title><body><nav>Navigation</nav><main><h1>Article</h1><a href="/next">Next</a><img src="/photo.png"></main></body></html>',
						status: 200,
						finalUrl: url,
					};
				},
				robots: async () => "",
			},
		);
		expect(calls).toEqual(["https://sample.example/"]);
		expect(pages[0].content?.links).toEqual([]);
		expect(pages[0].content?.images).toEqual([]);
		expect(pages[0].content?.text).not.toContain("Navigation");
	});
	it("deduplicates links and enforces max pages while retaining failures", async () => {
		const pages = await crawlWebsite(
			"https://sample.example/",
			crawlSettingsSchema.parse({ maxPages: 2 }),
			{
				load: async (url) => {
					if (url.endsWith("/next")) throw new Error("Fetch failed");
					return {
						html: '<html><body><a href="/next">One</a><a href="/next#part">Duplicate</a><a href="/third">Three</a></body></html>',
						status: 200,
						finalUrl: url,
					};
				},
				robots: async () => "",
			},
		);
		expect(pages).toHaveLength(2);
		expect(pages.map((page) => page.status)).toEqual(["completed", "failed"]);
	});
});
