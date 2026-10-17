import type { ScrapeRow } from "@/db/schema";
import { runCrawlExtraction } from "@/features/scrape/services/scrape-crawl-extraction";
import { runImageExtraction } from "@/features/scrape/services/scrape-image-extraction";
import { scrapeRequestSchema } from "@/features/scrape/types/scrape-contract";
import { ScrapeError } from "@/lib/design-errors";
import type { ScrapeJobClaim } from "./scrape-job-service";
import { createScrapeJobUpdate } from "./scrape-job-service";

export {
	IMAGE_FETCH_PLAN,
	type ImageFetchPlan,
	shouldRetryImageFetch,
} from "./scrape-image-extraction";

export async function runExtractionJob(
	scrape: ScrapeRow,
	claim: ScrapeJobClaim,
): Promise<void> {
	const request = scrapeRequestSchema.parse(
		scrape.request ?? { url: scrape.sourceUrl, mode: scrape.mode },
	);
	const update = createScrapeJobUpdate(scrape, claim);
	await update({ status: "capturing" });
	if (request.mode === "crawl")
		await runCrawlExtraction({
			scrape,
			claim,
			url: request.url,
			settings: request.settings,
			update,
		});
	else if (request.mode === "images")
		await runImageExtraction({
			scrape,
			claim,
			url: request.url,
			settings: request.settings,
			update,
		});
	else
		throw new ScrapeError("UNEXPECTED_ERROR", "Mode extraction tidak sesuai.");
	await update({ status: "completed" });
}
