import { describe, expect, it } from "vitest";
import {
	createTariffRegistry,
	type Tariff,
} from "@/features/billing/services/pricing-policy";
import {
	quoteScrape,
	SCRAPE_TARIFFS,
	settleScrapeTariff,
} from "../services/scrape-credit-policy";
import { scrapeRequestSchema } from "../types/scrape-contract";

const version = "synthetic-test-v1";
const settlement = {
	success: "completed_units",
	partial: "completed_units",
	failed: "no_charge",
	cancelled: "no_charge",
} as const;
const fixed = (
	credits: number,
	verifiedLimits: Record<string, number>,
): Tariff => ({ mode: "fixed", version, credits, verifiedLimits, settlement });
const adaptive = (billingUnit: "page" | "design_view"): Tariff => ({
	mode: "adaptive",
	version,
	billingUnit,
	creditsPerUnit: 2,
	minimumCredits: 2,
	maximumCredits: 30,
	rounding: "ceil",
	settlement,
});
const registry = createTariffRegistry({
	id: "synthetic-test",
	tariffs: {
		"scrape.crawl": { [version]: adaptive("page") },
		"scrape.design_md": { [version]: adaptive("design_view") },
		"scrape.html": { [version]: fixed(3, { captures: 1 }) },
		"scrape.images": { [version]: fixed(4, { images: 200 }) },
	},
	activeVersions: {
		"scrape.crawl": version,
		"scrape.design_md": version,
		"scrape.html": version,
		"scrape.images": version,
	},
});
const url = "https://example.com/";

describe("Scrape tariff policy", () => {
	it.each([
		[{ mode: "crawl", settings: { maxPages: 8 } }, 2, 16],
		[{ mode: "design", settings: { viewport: "both", theme: "both" } }, 2, 8],
		[{ mode: "html" }, 3, 3],
		[{ mode: "images" }, 4, 4],
	])("quotes %o against validated settings", (options, minimum, maximum) => {
		expect(
			quoteScrape(registry, scrapeRequestSchema.parse({ url, ...options })),
		).toMatchObject({
			estimatedCredits: minimum,
			maximumCredits: maximum,
			version,
		});
	});
	it("returns no paid quote for the production registry", () => {
		expect(
			quoteScrape(
				SCRAPE_TARIFFS,
				scrapeRequestSchema.parse({ url, mode: "crawl" }),
			),
		).toBeNull();
	});
	it("settles partial work against completed units and the pinned cap", () => {
		const quote = quoteScrape(
			registry,
			scrapeRequestSchema.parse({
				url,
				mode: "crawl",
				settings: { maxPages: 4 },
			}),
		);
		if (!quote) throw new Error("missing quote");
		expect(settleScrapeTariff(registry, quote, "partial", 2, {})).toBe(4);
		expect(settleScrapeTariff(registry, quote, "partial", 30, {})).toBe(8);
		expect(settleScrapeTariff(registry, quote, "failed", 2, {})).toBe(0);
		expect(settleScrapeTariff(registry, quote, "cancelled", 2, {})).toBe(0);
	});
	it("rejects over-limit fixed-price settlement", () => {
		const quote = quoteScrape(
			registry,
			scrapeRequestSchema.parse({ url, mode: "images" }),
		);
		if (!quote) throw new Error("missing quote");
		expect(() =>
			settleScrapeTariff(registry, quote, "success", 1, { images: 201 }),
		).toThrow();
	});
});
