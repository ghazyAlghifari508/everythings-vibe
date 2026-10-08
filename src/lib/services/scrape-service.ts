import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
	type InsertScrapeDocumentRow,
	type InsertScrapeRow,
	type ScrapeDocumentRow,
	type ScrapeMetadata,
	type ScrapeMode,
	type ScrapeRow,
	type ScrapeStatus,
	scrapeDocuments,
	scrapeProgressForStatus,
	scrapes,
} from "@/db/schema";
import { ScrapeError } from "@/lib/design-errors";
import { extractDesignFromHtml } from "@/lib/design-extraction";
import { type ScrapeCapture, scrapeHtml } from "@/lib/fetch-html";
import { generateDesignMd } from "@/lib/prompts-design-md";
import type { ScrapeInstrumentation } from "@/lib/scrape-instrumentation";
import { parseAndValidateFormat } from "@/lib/url-validator";

export interface ScrapeSummary {
	id: string;
	sourceUrl: string;
	domain: string;
	title: string | null;
	mode: ScrapeMode;
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
	mode: ScrapeMode = "design",
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
			mode,
			status: "queued",
			metadata: {
				mode,
				stage: "queued",
				progress: 0,
				stageStartedAt: new Date().toISOString(),
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
	const mode: ScrapeMode = (scrape.mode ??
		scrape.metadata?.mode ??
		"design") as ScrapeMode;

	let meta: ScrapeMetadata = {
		...(typeof scrape.metadata === "object" && scrape.metadata !== null
			? scrape.metadata
			: {}),
		mode,
	};

	const persist = async (
		status: ScrapeStatus,
		patch: Partial<ScrapeMetadata> = {},
		columns: Partial<
			Pick<ScrapeRow, "sourceUrl" | "domain" | "title" | "html" | "previewHtml">
		> = {},
	): Promise<void> => {
		meta = {
			...meta,
			...patch,
			mode,
			stage: status,
			progress: scrapeProgressForStatus(status, mode),
			stageStartedAt: new Date().toISOString(),
		};
		await db
			.update(scrapes)
			.set({ status, metadata: meta, updatedAt: new Date(), ...columns })
			.where(eq(scrapes.id, scrapeId));
	};

	const timings: Record<string, number> = {};
	const instrumentation: ScrapeInstrumentation = {
		onActivity: async (activity) => {
			meta = { ...meta, activity, activityStartedAt: new Date().toISOString() };
			await db
				.update(scrapes)
				.set({ metadata: meta, updatedAt: new Date() })
				.where(eq(scrapes.id, scrapeId));
		},
		onTiming: (label, durationMs) => {
			timings[label] = (timings[label] ?? 0) + durationMs;
			meta = { ...meta, timings: { ...timings } };
		},
	};

	try {
		await persist("capturing");

		const captured: ScrapeCapture = await scrapeHtml(scrape.sourceUrl, 1, {
			...instrumentation,
			mode,
		});
		meta = { ...meta, ...captured.metadata };

		if (mode === "html") {
			await persist("extracting");
			const saveStart = Date.now();
			await persist(
				"saving",
				{
					activity: "Menyimpan index.html",
					activityStartedAt: new Date().toISOString(),
				},
				{
					sourceUrl: captured.sourceUrl,
					domain: captured.domain,
					title: captured.title,
					html: captured.html,
					previewHtml: captured.previewHtml,
				},
			);
			instrumentation.onTiming?.("save", Date.now() - saveStart);
			await persist("completed");
			console.info(
				JSON.stringify({
					scrapeTimings: true,
					scrapeId,
					mode,
					totalMs: Object.values(timings).reduce((a, b) => a + b, 0),
					timings,
				}),
			);
			return;
		}

		await persist(
			"extracting",
			{},
			{
				sourceUrl: captured.sourceUrl,
				domain: captured.domain,
				title: captured.title,
				html: captured.html,
				previewHtml: captured.previewHtml,
			},
		);
		await instrumentation.onActivity?.("Menganalisis design system");
		const extractionStart = Date.now();
		const extraction = extractDesignFromHtml(captured.html, captured.sourceUrl);
		instrumentation.onTiming?.("extraction", Date.now() - extractionStart);
		await instrumentation.onActivity?.("Analisis visual selesai");

		await persist("generating");
		const designMd = await generateDesignMd(
			captured.sourceUrl,
			extraction,
			undefined,
			instrumentation,
		);

		const saveStart = Date.now();
		await persist("saving", {
			activity: "Menyimpan hasil",
			activityStartedAt: new Date().toISOString(),
		});
		await saveScrapeDocument(scrapeId, designMd);
		instrumentation.onTiming?.("save", Date.now() - saveStart);

		await persist("completed");
		console.info(
			JSON.stringify({
				scrapeTimings: true,
				scrapeId,
				mode,
				totalMs: Object.values(timings).reduce((a, b) => a + b, 0),
				timings,
			}),
		);
		return;
	} catch (error) {
		const errorMessage =
			error instanceof ScrapeError
				? error.message
				: mode === "html"
					? "Gagal memproses HTML website."
					: "Gagal memproses visual website.";
		const errorDetail =
			error instanceof ScrapeError ? error.code : "WEBSITE_BLOCKED";

		await db
			.update(scrapes)
			.set({
				status: "failed",
				metadata: {
					...meta,
					mode,
					stage: "failed",
					progress: 0,
					stageStartedAt: new Date().toISOString(),
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

	const mode: ScrapeMode = (scrape.mode ??
		scrape.metadata?.mode ??
		"design") as ScrapeMode;
	await db
		.update(scrapes)
		.set({
			status: "queued",
			metadata: {
				...(typeof scrape.metadata === "object" && scrape.metadata !== null
					? scrape.metadata
					: {}),
				mode,
				stage: "queued",
				progress: 0,
				stageStartedAt: new Date().toISOString(),
				activity: undefined,
				activityStartedAt: undefined,
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
	const rows = await db
		.select({
			id: scrapes.id,
			sourceUrl: scrapes.sourceUrl,
			domain: scrapes.domain,
			title: scrapes.title,
			mode: scrapes.mode,
			metadata: scrapes.metadata,
			status: scrapes.status,
			createdAt: scrapes.createdAt,
		})
		.from(scrapes)
		.where(eq(scrapes.userId, userId))
		.orderBy(desc(scrapes.createdAt))
		.limit(limit);

	return rows.map((r) => ({
		id: r.id,
		sourceUrl: r.sourceUrl,
		domain: r.domain,
		title: r.title,
		mode: (r.mode ?? r.metadata?.mode ?? "design") as ScrapeMode,
		status: r.status,
		createdAt: r.createdAt,
	}));
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
