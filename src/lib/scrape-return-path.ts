import { z } from "zod";

export const SCRAPE_RETURN_FALLBACK = "/design/scrap";

export const scrapeReturnSearchSchema = z.object({
	from: z
		.enum(["/design/scrap", "/design/scrap/history"])
		.optional()
		.default(SCRAPE_RETURN_FALLBACK),
});

export type ScrapeReturnSearch = z.infer<typeof scrapeReturnSearchSchema>;

export function resolveScrapeReturnPath(from: unknown): string {
	const parsed = scrapeReturnSearchSchema.safeParse({ from });
	return parsed.success ? parsed.data.from : SCRAPE_RETURN_FALLBACK;
}
