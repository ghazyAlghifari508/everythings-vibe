import {
	calculateTariffSettlement,
	createTariffRegistry,
	quoteTariff,
	TariffDefinitionError,
	TariffNotConfiguredError,
	type TariffOutcome,
	type TariffQuote,
	type TariffRegistry,
} from "@/features/billing/services/pricing-policy";
import { SCRAPE_MAX_HTML_BYTES } from "../types/scrape-constants";
import {
	type DesignSettings,
	SCRAPE_LIMITS,
	type ScrapeRequest,
} from "../types/scrape-contract";

// Empty until approved; synthetic prices live only in tests.
export const SCRAPE_TARIFFS = createTariffRegistry({
	id: "scrape-inactive",
	tariffs: {},
	activeVersions: {},
});

export function designViewCount(settings: DesignSettings): number {
	return (
		(settings.viewport === "both" ? 2 : 1) * (settings.theme === "both" ? 2 : 1)
	);
}

const contract = {
	crawl: "scrape.crawl",
	design: "scrape.design_md",
	html: "scrape.html",
	images: "scrape.images",
} as const;

export function fixedScrapeLimits(
	mode: "html" | "images",
): Record<string, number> {
	return mode === "html"
		? {
				captures: 1,
				htmlBytes: SCRAPE_MAX_HTML_BYTES,
				transferBytes: SCRAPE_LIMITS.captureMaxBytes,
			}
		: {
				images: SCRAPE_LIMITS.imageCandidates,
				storageBytes: SCRAPE_LIMITS.captureMaxBytes,
				transferBytes: SCRAPE_LIMITS.captureMaxBytes,
			};
}

export function quoteScrape(
	registry: TariffRegistry,
	request: ScrapeRequest,
): TariffQuote | null {
	const operation = contract[request.mode];
	try {
		if (request.mode === "html" || request.mode === "images") {
			const quote = quoteTariff(registry, {
				operation,
				limitMetrics: fixedScrapeLimits(request.mode),
			});
			if (quote.mode !== "fixed")
				throw new TariffDefinitionError(`${operation} requires a fixed tariff`);
			return quote;
		}
		const [unit, maximum] =
			request.mode === "crawl"
				? (["page", request.settings.maxPages] as const)
				: (["design_view", designViewCount(request.settings)] as const);
		const minimum = quoteTariff(registry, {
			operation,
			requestedUnits: { [unit]: 1 },
		});
		if (minimum.billingUnit !== unit)
			throw new TariffDefinitionError(`${operation} requires ${unit} billing`);
		const upper = quoteTariff(registry, {
			operation,
			requestedUnits: { [unit]: maximum },
		});
		return { ...minimum, maximumCredits: upper.estimatedCredits };
	} catch (error) {
		if (error instanceof TariffNotConfiguredError) return null;
		throw error;
	}
}

export function settleScrapeTariff(
	registry: TariffRegistry,
	quote: Pick<TariffQuote, "operation" | "version" | "maximumCredits">,
	outcome: TariffOutcome,
	completedUnits: number,
	limitMetrics: Record<string, number>,
): number {
	return calculateTariffSettlement(registry, {
		operation: quote.operation,
		version: quote.version,
		authorizedMaximum: quote.maximumCredits,
		outcome,
		measuredUnits: { page: completedUnits, design_view: completedUnits },
		limitMetrics,
	}).chargedCredits;
}
