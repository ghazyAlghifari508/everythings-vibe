import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
	type InsertScrapeDocumentRow,
	type InsertScrapeRow,
	type ScrapeDocumentRow,
	type ScrapeRow,
	scrapeDocuments,
	scrapeProgressForStatus,
	scrapes,
} from "@/db/schema";
import { ScrapeError } from "@/lib/design-errors";
import { extractDesignFromHtml } from "@/lib/design-extraction";
import { type ScrapeCapture, scrapeHtml } from "@/lib/fetch-html";
import { generateDesignMd } from "@/lib/prompts-design-md";
import { parseAndValidateFormat } from "@/lib/url-validator";

export interface ScrapeSummary {
	id: string;
	sourceUrl: string;
	domain: string;
	title: string | null;
	status: string;
	createdAt: Date;
}

export interface ScrapeDetail extends ScrapeRow {
	document: ScrapeDocumentRow | null;
}

function domainOf(sourceUrl: string): string {
	return new URL(sourceUrl).hostname.toLowerCase();
}

export async function createScrape(
	userId: string,
	rawUrl: string,
): Promise<ScrapeRow> {
	let normalized: string;
	try {
		normalized = parseAndValidateFormat(rawUrl).href;
	} catch (error) {
		if (error instanceof ScrapeError) throw error;
		throw new ScrapeError("INVALID_URL");
	}

	const [pending] = await db
		.insert(scrapes)
		.values({
			userId,
			sourceUrl: normalized,
			domain: domainOf(normalized),
			status: "queued",
			metadata: {
				stage: "queued",
				progress: 0,
			},
		} satisfies InsertScrapeRow)
		.returning();

	if (!pending) throw new ScrapeError("STORAGE_FAILED");
	return pending;
}

export async function runScrapePipeline(
	scrapeId: string,
	userId: string,
): Promise<void> {
	const [scrape] = await db
		.select()
		.from(scrapes)
		.where(and(eq(scrapes.id, scrapeId), eq(scrapes.userId, userId)))
		.limit(1);
	if (!scrape) return;

	try {
		// Stage 1: Capturing HTML
		await db
			.update(scrapes)
			.set({
				status: "capturing",
				metadata: {
					...(typeof scrape.metadata === "object" && scrape.metadata !== null
						? scrape.metadata
						: {}),
					stage: "capturing",
					progress: scrapeProgressForStatus("capturing"),
				},
				updatedAt: new Date(),
			})
			.where(eq(scrapes.id, scrapeId));

		const captured: ScrapeCapture = await scrapeHtml(scrape.sourceUrl);

		// Stage 2: Extracting design tokens
		await db
			.update(scrapes)
			.set({
				status: "extracting",
				sourceUrl: captured.sourceUrl,
				domain: captured.domain,
				title: captured.title,
				html: captured.html,
				previewHtml: captured.previewHtml,
				metadata: {
					...captured.metadata,
					stage: "extracting",
					progress: scrapeProgressForStatus("extracting"),
				},
				updatedAt: new Date(),
			})
			.where(eq(scrapes.id, scrapeId));

		const extraction = extractDesignFromHtml(captured.html, captured.sourceUrl);

		// Stage 3: Generating DESIGN.md
		await db
			.update(scrapes)
			.set({
				status: "generating",
				metadata: {
					...captured.metadata,
					stage: "generating",
					progress: scrapeProgressForStatus("generating"),
				},
				updatedAt: new Date(),
			})
			.where(eq(scrapes.id, scrapeId));

		const designMd = await generateDesignMd(captured.sourceUrl, extraction);

		// Stage 4: Saving dual-artifact documents
		await db
			.update(scrapes)
			.set({
				status: "saving",
				metadata: {
					...captured.metadata,
					stage: "saving",
					progress: scrapeProgressForStatus("saving"),
				},
				updatedAt: new Date(),
			})
			.where(eq(scrapes.id, scrapeId));

		await saveScrapeDocument(scrapeId, designMd);

		// Stage 5: Completed
		await db
			.update(scrapes)
			.set({
				status: "completed",
				metadata: {
					...captured.metadata,
					stage: "completed",
					progress: scrapeProgressForStatus("completed"),
				},
				updatedAt: new Date(),
			})
			.where(eq(scrapes.id, scrapeId));
	} catch (error) {
		const errorMessage =
			error instanceof ScrapeError
				? error.message
				: "Gagal memproses visual website.";
		const errorDetail =
			error instanceof ScrapeError ? error.code : "WEBSITE_BLOCKED";

		await db
			.update(scrapes)
			.set({
				status: "failed",
				metadata: {
					...(typeof scrape.metadata === "object" && scrape.metadata !== null
						? scrape.metadata
						: {}),
					stage: "failed",
					progress: 0,
					errorMessage,
					errorDetail,
				},
				updatedAt: new Date(),
			})
			.where(eq(scrapes.id, scrapeId));
	}
}

export async function retryScrape(
	scrapeId: string,
	userId: string,
): Promise<{ ok: true }> {
	const [scrape] = await db
		.select()
		.from(scrapes)
		.where(and(eq(scrapes.id, scrapeId), eq(scrapes.userId, userId)))
		.limit(1);
	if (!scrape)
		throw new ScrapeError("WEBSITE_BLOCKED", "Scrape tidak ditemukan.");

	await db
		.update(scrapes)
		.set({
			status: "queued",
			metadata: {
				stage: "queued",
				progress: 0,
			},
			updatedAt: new Date(),
		})
		.where(eq(scrapes.id, scrapeId));

	void runScrapePipeline(scrapeId, userId);
	return { ok: true };
}

export async function getScrapeById(
	id: string,
	userId: string,
): Promise<ScrapeDetail> {
	const [row] = await db
		.select()
		.from(scrapes)
		.where(and(eq(scrapes.id, id), eq(scrapes.userId, userId)))
		.limit(1);
	if (!row) throw new ScrapeError("WEBSITE_BLOCKED", "Scrape tidak ditemukan.");
	const [document] = await db
		.select()
		.from(scrapeDocuments)
		.where(eq(scrapeDocuments.scrapeId, id))
		.limit(1);
	return { ...row, document: document ?? null };
}

export async function listScrapes(
	userId: string,
	limit = 50,
): Promise<ScrapeSummary[]> {
	return db
		.select({
			id: scrapes.id,
			sourceUrl: scrapes.sourceUrl,
			domain: scrapes.domain,
			title: scrapes.title,
			status: scrapes.status,
			createdAt: scrapes.createdAt,
		})
		.from(scrapes)
		.where(eq(scrapes.userId, userId))
		.orderBy(desc(scrapes.createdAt))
		.limit(limit);
}

export async function saveScrapeDocument(
	scrapeId: string,
	designMd: string,
): Promise<ScrapeDocumentRow> {
	if (!designMd || designMd.trim().length === 0)
		throw new ScrapeError("AI_GENERATION_FAILED", "DESIGN.md kosong.");

	const [existing] = await db
		.select()
		.from(scrapeDocuments)
		.where(eq(scrapeDocuments.scrapeId, scrapeId))
		.limit(1);

	if (existing) {
		const [updated] = await db
			.update(scrapeDocuments)
			.set({ designMd })
			.where(eq(scrapeDocuments.id, existing.id))
			.returning();
		return updated;
	}

	const [document] = await db
		.insert(scrapeDocuments)
		.values({
			scrapeId,
			designMd,
		} satisfies InsertScrapeDocumentRow)
		.returning();
	if (!document) throw new ScrapeError("STORAGE_FAILED");
	return document;
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
	const designMd = await generateDesignMd(scrape.sourceUrl, scrape.html);
	return saveScrapeDocument(scrapeId, designMd);
}

export async function deleteScrape(
	id: string,
	userId: string,
): Promise<{ ok: true }> {
	const deleted = await db
		.delete(scrapes)
		.where(and(eq(scrapes.id, id), eq(scrapes.userId, userId)))
		.returning({ id: scrapes.id });
	if (deleted.length === 0)
		throw new ScrapeError("WEBSITE_BLOCKED", "Scrape tidak ditemukan.");
	return { ok: true };
}
