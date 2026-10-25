import { z } from "zod";
import { ScrapeError } from "@/lib/design-errors";
import { SCRAPE_DESIGN_SOURCE_LIMIT } from "../types/scrape-constants";
import { getScrapeById } from "./scrape-detail-service";
import { listScrapeHistory } from "./scrape-history-service";

/**
 * The DESIGN.md contract other domains may depend on: the persisted document of
 * one completed scrape plus the labels needed to identify it. Internal crawl,
 * asset, worker, and browser state stays inside this feature.
 */
export const scrapeDesignMdDtoSchema = z.object({
	scrapeId: z.string().min(1),
	sourceUrl: z.string().min(1),
	title: z.string().nullable(),
	designMd: z.string().min(1),
});
export type ScrapeDesignMdDto = z.infer<typeof scrapeDesignMdDtoSchema>;

export interface ScrapeDesignSource {
	id: string;
	title: string | null;
	domain: string;
	sourceUrl: string;
}

// Only the design mode writes scrape_documents, so a completed design scrape is
// the complete set of rows that can carry a DESIGN.md.
export async function listScrapeDesignSources(
	userId: string,
): Promise<ScrapeDesignSource[]> {
	const page = await listScrapeHistory(userId, {
		mode: "design",
		status: "completed",
		sort: "newest",
		limit: SCRAPE_DESIGN_SOURCE_LIMIT,
	});
	return page.items.map((item) => ({
		id: item.id,
		title: item.title,
		domain: item.domain,
		sourceUrl: item.sourceUrl,
	}));
}

// The caller already owns a typed scrape id (the reference contract validates
// it), so this takes the id itself instead of re-parsing a request envelope.
export async function getScrapeDesignMd(
	scrapeId: string,
	userId: string,
): Promise<ScrapeDesignMdDto> {
	const scrape = await getScrapeById(scrapeId, userId);
	if (scrape.status !== "completed")
		throw new ScrapeError("AI_GENERATION_FAILED", "DESIGN.md belum siap.");
	const designMd = scrape.document?.designMd;
	if (!designMd?.trim())
		throw new ScrapeError(
			"AI_GENERATION_FAILED",
			"DESIGN.md tidak tersedia untuk proses ini.",
		);
	return scrapeDesignMdDtoSchema.parse({
		scrapeId: scrape.id,
		sourceUrl: scrape.sourceUrl,
		title: scrape.title,
		designMd,
	});
}
