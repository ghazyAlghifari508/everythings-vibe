import { z } from "zod";

export const SCRAPE_RETURN_FALLBACK = "/scrape";

const SCRAPE_RETURN_PATH = z
	.enum([
		SCRAPE_RETURN_FALLBACK,
		"/scrape/history",
		"/design/scrap",
		"/design/scrap/history",
	])
	.transform((from) =>
		from === "/design/scrap"
			? SCRAPE_RETURN_FALLBACK
			: from === "/design/scrap/history"
				? "/scrape/history"
				: from,
	);

export const scrapeReturnSearchSchema = z.object({
	from: SCRAPE_RETURN_PATH.default(SCRAPE_RETURN_FALLBACK),
});

export type ScrapeReturnSearch = z.infer<typeof scrapeReturnSearchSchema>;

export function parseScrapeReturnSearch(search: unknown): ScrapeReturnSearch {
	const parsed = scrapeReturnSearchSchema.safeParse(search);
	return parsed.success ? parsed.data : { from: SCRAPE_RETURN_FALLBACK };
}

export function resolveScrapeReturnPath(
	from: unknown,
): ScrapeReturnSearch["from"] {
	return parseScrapeReturnSearch({ from }).from;
}
