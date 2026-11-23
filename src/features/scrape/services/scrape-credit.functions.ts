import { createServerFn } from "@tanstack/react-start";
import { scrapeRequestSchema } from "../types/scrape-contract";

export const getScrapeQuote = createServerFn({ method: "POST" })
	.validator((input: unknown) =>
		input === null ? null : scrapeRequestSchema.parse(input),
	)
	.handler(async ({ data }) => {
		const { requireUserServer } = await import("@/lib/session");
		const { loadScrapeQuote } = await import("./scrape-credit.server");
		const user = await requireUserServer();
		return loadScrapeQuote(user.id, data);
	});
