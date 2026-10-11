import { isDeepStrictEqual } from "node:util";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
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
	users,
} from "@/db/schema";
import { ScrapeError } from "@/lib/design-errors";
import { extractionFromVisualEvidence } from "@/lib/design-visual-evidence";
import { type ScrapeCapture, scrapeHtml } from "@/lib/fetch-html";
import { generateDesignMd } from "@/lib/prompts-design-md";
import {
	SCRAPE_LIMITS,
	type ScrapeRequest,
	scrapeRequestSchema,
} from "@/lib/scrape-contract";
import type { ScrapeInstrumentation } from "@/lib/scrape-instrumentation";
import { parseAndValidateFormat } from "@/lib/url-validator";
import {
	type ScrapeJobClaim,
	scrapeClaimPredicate,
} from "./scrape-job-service";

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
	request?: ScrapeRequest,
	idempotencyKey?: string,
): Promise<ScrapeRow> {
	let normalized: string;
	try {
		normalized = parseAndValidateFormat(rawUrl).href;
	} catch (error) {
		if (error instanceof ScrapeError) throw error;
		throw new ScrapeError("INVALID_URL");
	}

	return db.transaction(async (tx) => {
		const [owner] = await tx
			.select({ id: users.id })
			.from(users)
			.where(eq(users.id, userId))
			.for("update")
			.limit(1);
		if (!owner) throw new ScrapeError("STORAGE_FAILED");
		if (idempotencyKey) {
			const [replay] = await tx
				.select()
				.from(scrapes)
				.where(
					and(
						eq(scrapes.userId, userId),
						sql`${scrapes.metadata}->>'idempotencyKey' = ${idempotencyKey}`,
					),
				)
				.limit(1);
			if (replay) {
				if (!isDeepStrictEqual(replay.request, request))
					throw new ScrapeError(
						"INVALID_URL",
						"Request key sudah dipakai untuk parameter berbeda.",
					);
				return replay;
			}
		}
		const validated =
			request ?? scrapeRequestSchema.parse({ url: normalized, mode });
		const { checkRateLimit } = await import("@/lib/rate-limit");
		if (!(await checkRateLimit(userId, "free", "api_call")).allowed)
			throw new ScrapeError(
				"WEBSITE_BLOCKED",
				"Batas request tercapai. Coba lagi setelah satu menit.",
			);
		const active = await tx
			.select()
			.from(scrapes)
			.where(
				and(
					eq(scrapes.userId, userId),
					inArray(scrapes.status, [
						"queued",
						"capturing",
						"extracting",
						"generating",
						"saving",
					]),
				),
			);
		const existing = active.find(
			(row) =>
				row.sourceUrl === normalized &&
				row.mode === mode &&
				isDeepStrictEqual(row.request, validated),
		);
		if (existing) return existing;
		if (active.length >= SCRAPE_LIMITS.maxActiveJobs)
			throw new ScrapeError(
				"WEBSITE_BLOCKED",
				"Tunggu proses aktif selesai sebelum memulai ekstraksi baru.",
			);
		const [pending] = await tx
			.insert(scrapes)
			.values({
				userId,
				sourceUrl: normalized,
				domain: domainOf(normalized),
				mode,
				request: validated,
				status: "queued",
				metadata: {
					mode,
					idempotencyKey,
					stage: "queued",
					progress: 0,
					stageStartedAt: new Date().toISOString(),
				},
			} satisfies InsertScrapeRow)
			.returning();

		if (!pending) throw new ScrapeError("STORAGE_FAILED");
		return pending;
	});
}

export async function runScrapePipeline(
	scrapeId: string,
	userId: string,
	claim?: ScrapeJobClaim,
): Promise<void> {
	const [scrape] = await db
		.select()
		.from(scrapes)
		.where(and(eq(scrapes.id, scrapeId), eq(scrapes.userId, userId)))
		.limit(1);
	if (!scrape) return;
	const writePredicate = () =>
		claim
			? scrapeClaimPredicate(claim)
			: and(eq(scrapes.id, scrapeId), eq(scrapes.userId, userId));
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
		const saved = await db
			.update(scrapes)
			.set({ status, metadata: meta, updatedAt: new Date(), ...columns })
			.where(writePredicate())
			.returning({ id: scrapes.id });
		if (!saved.length)
			throw new ScrapeError("STORAGE_FAILED", "Job lease sudah tidak berlaku.");
	};

	const timings: Record<string, number> = {};
	const instrumentation: ScrapeInstrumentation = {
		onActivity: async (activity) => {
			meta = { ...meta, activity, activityStartedAt: new Date().toISOString() };
			const updated = await db
				.update(scrapes)
				.set({ metadata: meta, updatedAt: new Date() })
				.where(writePredicate())
				.returning({ id: scrapes.id });
			if (!updated.length)
				throw new ScrapeError(
					"STORAGE_FAILED",
					"Job lease sudah tidak berlaku.",
				);
		},
		onTiming: (label, durationMs) => {
			timings[label] = (timings[label] ?? 0) + durationMs;
			meta = { ...meta, timings: { ...timings } };
		},
	};

	try {
		if (mode === "crawl" || mode === "images") {
			if (!claim)
				throw new ScrapeError(
					"STORAGE_FAILED",
					"Job harus diproses oleh worker.",
				);
			const { runExtractionJob } = await import("./scrape-extraction-service");
			await runExtractionJob(scrape, claim);
			return;
		}
		await persist("capturing");

		const settings =
			scrape.request?.mode === "html" ? scrape.request.settings : undefined;
		const captured: ScrapeCapture =
			mode === "html" && scrape.html && scrape.previewHtml
				? {
						sourceUrl: scrape.sourceUrl,
						domain: scrape.domain,
						title: scrape.title,
						html: scrape.html,
						previewHtml: scrape.previewHtml,
						status: 200,
						metadata: {
							attempt: scrape.jobAttempts,
							capturedAt:
								scrape.metadata?.capturedAt ?? scrape.createdAt.toISOString(),
							finalUrl: scrape.sourceUrl,
							viewport: scrape.metadata?.viewport ?? {
								width: 1440,
								height: 900,
							},
							captureMode: "persisted",
							htmlBytes: Buffer.byteLength(scrape.html),
							previewHtmlBytes: Buffer.byteLength(scrape.previewHtml),
						},
					}
				: await scrapeHtml(scrape.sourceUrl, scrape.jobAttempts, {
						...instrumentation,
						mode,
						...settings,
						signal: claim?.signal,
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
		if (!captured.metadata.visualEvidence)
			throw new ScrapeError(
				"NO_ANALYZABLE_CONTENT",
				"Evidence visual hasil render tidak tersedia.",
			);
		const extraction = extractionFromVisualEvidence(
			captured.metadata.visualEvidence,
		);
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
		await saveScrapeDocument(scrapeId, designMd, userId, claim);
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
					: mode === "crawl" || mode === "images"
						? "Ekstraksi website terhenti. Hasil yang sudah disimpan tetap tersedia."
						: "Gagal memproses visual website.";
		const errorDetail =
			error instanceof ScrapeError ? error.code : "WEBSITE_BLOCKED";

		await db
			.update(scrapes)
			.set({
				status: "failed",
				metadata: sql`coalesce(${scrapes.metadata}, '{}'::jsonb) || ${JSON.stringify(
					{
						mode,
						stage: "failed",
						progress: 0,
						stageStartedAt: new Date().toISOString(),
						errorMessage,
						errorDetail,
					},
				)}::jsonb`,
				updatedAt: new Date(),
			})
			.where(writePredicate());
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
	if (scrape.status !== "failed") return { ok: true };

	const mode: ScrapeMode = (scrape.mode ??
		scrape.metadata?.mode ??
		"design") as ScrapeMode;
	await db
		.update(scrapes)
		.set({
			status: "queued",
			jobAttempts: 0,
			jobToken: null,
			leaseExpiresAt: null,
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
				errorMessage: undefined,
				errorDetail: undefined,
			},
			updatedAt: new Date(),
		})
		.where(
			and(
				eq(scrapes.id, scrapeId),
				eq(scrapes.userId, userId),
				eq(scrapes.status, "failed"),
			),
		);
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

		const [existing] = await tx
			.select()
			.from(scrapeDocuments)
			.where(eq(scrapeDocuments.scrapeId, scrapeId))
			.limit(1);

		if (existing) {
			const [updated] = await tx
				.update(scrapeDocuments)
				.set({ designMd })
				.where(eq(scrapeDocuments.id, existing.id))
				.returning();
			return updated;
		}

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
	const designMd = await generateDesignMd(scrape.sourceUrl, scrape.html);
	return saveScrapeDocument(scrapeId, designMd, userId);
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
