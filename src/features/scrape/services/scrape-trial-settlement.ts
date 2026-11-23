import { and, count, eq } from "drizzle-orm";
import {
	productTrials,
	type ScrapeRow,
	scrapeDocuments,
	scrapeImages,
	scrapePages,
	scrapes,
} from "@/db/schema";
import type { CreditTransaction } from "@/features/billing/services/credit-db";
import { settleProductTrial } from "@/features/billing/services/product-trial-settlement.server";

// Call while holding the scrape row lock, before deleting cascading outputs.
export async function settleScrapeTrial(
	tx: CreditTransaction,
	row: Pick<ScrapeRow, "id" | "userId" | "mode" | "html" | "metadata">,
) {
	const [trial] = await tx
		.select({ id: productTrials.id })
		.from(productTrials)
		.where(
			and(
				eq(productTrials.product, "scrape"),
				eq(productTrials.userId, row.userId),
				eq(productTrials.jobId, row.id),
				eq(productTrials.state, "reserved"),
			),
		);
	if (!trial) return;
	let units = 0;
	if (row.mode === "crawl" || row.mode === "images") {
		const table = row.mode === "crawl" ? scrapePages : scrapeImages;
		const [result] = await tx
			.select({ units: count() })
			.from(table)
			.where(
				and(
					eq(table.userId, row.userId),
					eq(table.scrapeId, row.id),
					eq(table.status, "completed"),
				),
			);
		units = result?.units ?? 0;
	} else if (row.mode === "html") {
		units = row.html ? 1 : 0;
	} else {
		const [result] = await tx
			.select({ id: scrapeDocuments.id })
			.from(scrapeDocuments)
			.innerJoin(
				scrapes,
				and(
					eq(scrapes.id, scrapeDocuments.scrapeId),
					eq(scrapes.userId, row.userId),
				),
			)
			.where(eq(scrapeDocuments.scrapeId, row.id))
			.limit(1);
		units = result ? 1 : 0;
	}
	await settleProductTrial(tx, "scrape", row.userId, row.id, units);
}
