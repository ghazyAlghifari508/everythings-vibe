import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
	type InsertScrapeDocumentRow,
	type InsertScrapeRow,
	type ScrapeDocumentRow,
	type ScrapeRow,
	scrapeDocuments,
	scrapes,
} from "@/db/schema";
import { ScrapeError } from "@/lib/design-errors";
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
		} satisfies InsertScrapeRow)
		.returning();

	let captured: ScrapeCapture;
	try {
		captured = await scrapeHtml(normalized);
	} catch (error) {
		await db
			.update(scrapes)
			.set({ status: "failed", updatedAt: new Date() })
			.where(eq(scrapes.id, pending.id));
		if (error instanceof ScrapeError) throw error;
		throw new ScrapeError("WEBSITE_BLOCKED");
	}

	const [completed] = await db
		.update(scrapes)
		.set({
			sourceUrl: captured.sourceUrl,
			domain: captured.domain,
			title: captured.title,
			status: "completed",
			html: captured.html,
			previewHtml: captured.previewHtml,
			metadata: captured.metadata,
			updatedAt: new Date(),
		})
		.where(eq(scrapes.id, pending.id))
		.returning();
	if (!completed) throw new ScrapeError("STORAGE_FAILED");
	return completed;
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
