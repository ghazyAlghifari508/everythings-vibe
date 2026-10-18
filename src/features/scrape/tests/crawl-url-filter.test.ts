import { describe, expect, it } from "vitest";
import { matchesCrawlUrl } from "@/features/scrape/utils/crawl-url-filter";

describe("isolated crawl URL filter", () => {
	it("matches real discovered URLs", async () => {
		expect(
			await matchesCrawlUrl("/docs/", "https://sample.example/docs/start"),
		).toBe(true);
		expect(
			await matchesCrawlUrl("/docs/", "https://sample.example/pricing"),
		).toBe(false);
	});
	it("terminates pathological expressions", async () => {
		await expect(
			matchesCrawlUrl("(a+)+$", `${"a".repeat(2000)}!`, 100),
		).rejects.toThrow("Regex");
	});
});
