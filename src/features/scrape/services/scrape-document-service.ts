import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
	type InsertScrapeDocumentRow,
	type ScrapeDocumentRow,
	scrapeDocuments,
	scrapes,
} from "@/db/schema";
import { scrapeRequestSchema } from "@/features/scrape/types/scrape-contract";
import { ScrapeError } from "@/lib/design-errors";
import { scrapeHtml } from "@/lib/fetch-html";
import { generateDesignMd } from "@/lib/prompts-design-md";
import { getScrapeById } from "./scrape-detail-service";
import {
	type ScrapeJobClaim,
	scrapeClaimPredicate,
} from "./scrape-job-service";

export async function saveScrapeDocument(
	scrapeId: string,
	designMd: string,
	userId?: string,
	claim?: ScrapeJobClaim,
): Promise<ScrapeDocumentRow> {
	if (!designMd || designMd.trim().length === 0)
		throw new ScrapeError("AI_GENERATION_FAILED", "DESIGN.md kosong.");
	if (!userId)
		throw new ScrapeError(
			"STORAGE_FAILED",
			"Pemilik scrape wajib diverifikasi.",
		);
	return db.transaction(async (tx) => {
		const [owner] = await tx
			.select({ id: scrapes.id })
			.from(scrapes)
			.where(
				claim
					? scrapeClaimPredicate(claim)
					: and(eq(scrapes.id, scrapeId), eq(scrapes.userId, userId)),
			)
			.for("update")
			.limit(1);
		if (!owner || owner.id !== scrapeId || (claim && claim.userId !== userId))
			throw new ScrapeError("STORAGE_FAILED", "Job lease sudah tidak berlaku.");

		// Append-only history: every generation inserts a new version so
		// previously generated documents remain safely accessible. Readers
		// take the latest row by createdAt.
		const [document] = await tx
			.insert(scrapeDocuments)
			.values({
				scrapeId,
				designMd,
			} satisfies InsertScrapeDocumentRow)
			.returning();
		if (!document) throw new ScrapeError("STORAGE_FAILED");
		return document;
	});
}

export async function generateAndSaveDesignMd(
	scrapeId: string,
	userId: string,
): Promise<ScrapeDocumentRow> {
	const scrape = await getScrapeById(scrapeId, userId);
	if (!scrape.html)
		throw new ScrapeError(
			"NO_ANALYZABLE_CONTENT",
			"HTML scrape belum tersedia.",
		);
	if (scrape.document) return scrape.document;
	const request = scrapeRequestSchema.parse(
		scrape.request ?? { url: scrape.sourceUrl, mode: "design" },
	);
	const captured = await scrapeHtml(
		scrape.sourceUrl,
		scrape.jobAttempts,
		request.mode === "design"
			? { designSettings: request.settings }
			: undefined,
	);
	if (!captured.metadata.visualEvidence)
		throw new ScrapeError(
			"NO_ANALYZABLE_CONTENT",
			"Evidence visual hasil render tidak tersedia.",
		);
	const generated = await generateDesignMd(
		captured.metadata.visualEvidence,
		undefined,
		undefined,
		{ title: scrape.title ?? undefined },
	);
	const designMd = generated.document;
	await db
		.update(scrapes)
		.set({
			metadata: {
				...scrape.metadata,
				...captured.metadata,
				aiEnrichment: generated.enrichment.status,
				aiEnrichmentDetail: generated.enrichment.detail,
				designModelVersion: generated.model.version,
			},
			updatedAt: new Date(),
		})
		.where(and(eq(scrapes.id, scrapeId), eq(scrapes.userId, userId)));
	return saveScrapeDocument(scrapeId, designMd, userId);
}
