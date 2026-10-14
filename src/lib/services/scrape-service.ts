import { isDeepStrictEqual } from "node:util";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
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
	scrapeImages,
	scrapePages,
	scrapes,
	users,
} from "@/db/schema";
import {
	errorSourceForCode,
	ScrapeError,
	scrapeFailureReasonForCode,
} from "@/lib/design-errors";
import { type ScrapeCapture, scrapeHtml } from "@/lib/fetch-html";
import { generateDesignMd } from "@/lib/prompts-design-md";
import {
	SCRAPE_LIMITS,
	type ScrapeRequest,
	scrapeRequestSchema,
} from "@/lib/scrape-contract";
import type { ScrapeInstrumentation } from "@/lib/scrape-instrumentation";
import {
	assertScrapeRetryAllowed,
	resolveScrapeRetryDecision,
} from "@/lib/scrape-retry";
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

export type ScrapePageRow = typeof scrapePages.$inferSelect;
export type ScrapeImageRow = typeof scrapeImages.$inferSelect;

// A verified image row plus the same-origin signed URL used for preview and
// download. Only rows whose resource passed verification reach the client.
export type ScrapeImageResult = ScrapeImageRow & { assetUrl: string };

// Persisted detail without signed asset URLs: signing needs request context, so
// the API route and the detail loader attach them.
export interface ScrapeDetail extends ScrapeRow {
	document: ScrapeDocumentRow | null;
	pages: ScrapePageRow[];
	images: ScrapeImageRow[];
}

// Wire shape returned by the status poll and the detail loader.
export interface ScrapeDetailPayload extends Omit<ScrapeDetail, "images"> {
	images: ScrapeImageResult[];
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

	const validated = scrapeRequestSchema.parse(
		request ?? { url: normalized, mode },
	);
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
				if (
					!isDeepStrictEqual(
						scrapeRequestSchema.parse(
							replay.request ?? { url: replay.sourceUrl, mode: replay.mode },
						),
						validated,
					)
				)
					throw new ScrapeError(
						"INVALID_URL",
						"Request key sudah dipakai untuk parameter berbeda.",
					);
				return replay;
			}
		}
		const { checkRateLimit } = await import("@/lib/rate-limit");
		if (!(await checkRateLimit(userId, "free", "api_call")).allowed)
			throw new ScrapeError(
				"RATE_LIMITED",
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
				isDeepStrictEqual(
					scrapeRequestSchema.parse(
						row.request ?? { url: row.sourceUrl, mode: row.mode },
					),
					validated,
				),
		);
		if (existing) return existing;
		if (active.length >= SCRAPE_LIMITS.maxActiveJobs)
			throw new ScrapeError(
				"QUEUE_CAPACITY",
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
					designSettings:
						validated.mode === "design" ? validated.settings : undefined,
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
			progress: undefined,
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
		const request = scrapeRequestSchema.parse(
			scrape.request ?? { url: scrape.sourceUrl, mode },
		);
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
		await persist("capturing", {
			designSettings: request.mode === "design" ? request.settings : undefined,
		});

		const settings =
			request.mode === "html"
				? request.settings
				: request.mode === "design"
					? { designSettings: request.settings }
					: undefined;
		const captured: ScrapeCapture =
			mode === "html" && scrape.html && scrape.previewHtml
				? {
						sourceUrl: scrape.sourceUrl,
						domain: scrape.domain,
						title: scrape.title,
						html: scrape.html,
						previewHtml: scrape.previewHtml,
						status: scrape.metadata?.httpStatus ?? 200,
						metadata: {
							attempt: scrape.jobAttempts,
							capturedAt:
								scrape.metadata?.capturedAt ?? scrape.createdAt.toISOString(),
							finalUrl: scrape.metadata?.finalUrl ?? scrape.sourceUrl,
							viewport: scrape.metadata?.viewport ?? {
								width: 1440,
								height: 900,
							},
							captureMode: "persisted",
							htmlBytes: Buffer.byteLength(scrape.html),
							previewHtmlBytes: Buffer.byteLength(scrape.previewHtml),
							// Reuses the persisted capture evidence instead of
							// re-measuring, so the stored facts stay the source of truth.
							responseReceived: scrape.metadata?.responseReceived ?? true,
							httpStatus: scrape.metadata?.httpStatus,
							resourceLoadTimedOut:
								scrape.metadata?.resourceLoadTimedOut ?? false,
							assetFetchFailures: scrape.metadata?.assetFetchFailures ?? 0,
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
		instrumentation.onTiming?.("extraction", Date.now() - extractionStart);
		await instrumentation.onActivity?.("Analisis visual selesai");

		await persist("generating");
		await instrumentation.onActivity?.("Menyusun tabel dari evidence visual");
		const generated = await generateDesignMd(
			captured.metadata.visualEvidence,
			instrumentation,
			claim?.signal,
		);
		const designMd = generated.document;
		if (generated.enrichment.status === "unavailable")
			await instrumentation.onActivity?.(
				"DESIGN.md dari evidence tersimpan; AI enrichment tidak tersedia",
			);

		const saveStart = Date.now();
		await persist(
			"saving",
			{
				activity: "Menyimpan hasil",
				activityStartedAt: new Date().toISOString(),
				aiEnrichment: generated.enrichment.status,
				aiEnrichmentDetail: generated.enrichment.detail,
				designModelVersion: generated.model.version,
			},
			{},
		);
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
		// Unknown failures are reported as unexpected rather than as a website
		// block, so a crash in our own pipeline is never disguised as a site
		// refusal the user cannot act on.
		const errorDetail =
			error instanceof ScrapeError ? error.code : "UNEXPECTED_ERROR";
		const retryAfterSeconds =
			error instanceof ScrapeError ? error.retryAfterSeconds : undefined;
		const retryAfterExpiresAt =
			retryAfterSeconds === undefined
				? undefined
				: new Date(Date.now() + retryAfterSeconds * 1000).toISOString();
		const errorSource = errorSourceForCode(errorDetail);
		const failureReason =
			error instanceof ScrapeError
				? error.failureReason
				: scrapeFailureReasonForCode("UNEXPECTED_ERROR");
		const evidence: Record<string, unknown> = {};
		if (retryAfterSeconds !== undefined)
			evidence.retryAfterSeconds = retryAfterSeconds;
		if (retryAfterExpiresAt !== undefined)
			evidence.retryAfterExpiresAt = retryAfterExpiresAt;
		// A status is persisted only when the response actually carried one, so
		// the UI can answer "was an HTTP response received?" from stored facts.
		if (error instanceof ScrapeError && error.httpStatus !== undefined) {
			evidence.httpStatus = error.httpStatus;
			evidence.responseReceived = true;
		}
		// A final URL is persisted only when the page actually resolved to one,
		// so the metadata can answer whether a redirect target existed.
		if (error instanceof ScrapeError && error.finalUrl !== undefined)
			evidence.finalUrl = error.finalUrl;

		await db
			.update(scrapes)
			.set({
				status: "failed",
				// The stage that actually failed is read from the persisted row at
				// update time. Worker modes write their stage directly to the row, so
				// a locally cached stage would report the stage from before the job ran.
				metadata: sql`coalesce(${scrapes.metadata}, '{}'::jsonb) || jsonb_build_object(
						'mode', ${mode}::text,
						'stage', 'failed',
						'stageStartedAt', ${new Date().toISOString()}::text,
						'errorMessage', ${errorMessage}::text,
						'errorDetail', ${errorDetail}::text,
						'errorSource', ${errorSource}::text,
						'failureReason', ${failureReason}::text,
						'failedAtStage', coalesce(${scrapes.metadata}->>'stage', 'queued')
					) || ${JSON.stringify({ progress: 0, ...evidence })}::jsonb`,
				updatedAt: new Date(),
			})
			.where(writePredicate());
	}
}

export async function retryScrape(
	scrapeId: string,
	userId: string,
): Promise<{ ok: true }> {
	return db.transaction(async (tx) => {
		const [owner] = await tx
			.select({ id: users.id })
			.from(users)
			.where(eq(users.id, userId))
			.for("update")
			.limit(1);
		if (!owner) throw new ScrapeError("STORAGE_FAILED");
		const [scrape] = await tx
			.select()
			.from(scrapes)
			.where(and(eq(scrapes.id, scrapeId), eq(scrapes.userId, userId)))
			.limit(1);
		if (!scrape)
			throw new ScrapeError("WEBSITE_BLOCKED", "Scrape tidak ditemukan.");
		if (scrape.status !== "failed") return { ok: true };
		// A retry consumes a real worker slot, so it respects the same request
		// rate limit as creating a new scrape instead of bypassing it.
		const { checkRateLimit } = await import("@/lib/rate-limit");
		if (!(await checkRateLimit(userId, "free", "api_call")).allowed)
			throw new ScrapeError(
				"RATE_LIMITED",
				"Batas request tercapai. Coba lagi setelah satu menit.",
			);
		const active = await tx
			.select({ id: scrapes.id })
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
		const metadata =
			typeof scrape.metadata === "object" && scrape.metadata !== null
				? scrape.metadata
				: null;
		assertScrapeRetryAllowed(
			resolveScrapeRetryDecision({
				status: scrape.status,
				errorCode: metadata?.errorDetail ?? null,
				retryAfterExpiresAt: metadata?.retryAfterExpiresAt ?? null,
				activeJobs: active.length,
				maxActiveJobs: SCRAPE_LIMITS.maxActiveJobs,
			}),
		);
		// A retry is a fresh attempt at the same request: it keeps the persisted
		// partial rows, clears the previous failure evidence, and resets the
		// worker bookkeeping so a new lease can be claimed.
		const mode: ScrapeMode = (scrape.mode ??
			scrape.metadata?.mode ??
			"design") as ScrapeMode;
		await tx
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
					errorSource: undefined,
					failureReason: undefined,
					failedAtStage: undefined,
					retryAfterSeconds: undefined,
					retryAfterExpiresAt: undefined,
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
	});
}

export interface ScrapeResults {
	pages: (typeof scrapePages.$inferSelect)[];
	images: (typeof scrapeImages.$inferSelect)[];
}

// Reads the persisted crawl/image rows for a scrape. The detail route and the
// status poll share this so newly persisted rows appear without a page reload.
export async function getScrapeResults(
	id: string,
	userId: string,
	mode: ScrapeMode,
): Promise<ScrapeResults> {
	const empty: ScrapeResults = { pages: [], images: [] };
	if (mode === "crawl")
		return {
			...empty,
			pages: await db
				.select()
				.from(scrapePages)
				.where(
					and(eq(scrapePages.scrapeId, id), eq(scrapePages.userId, userId)),
				)
				.orderBy(asc(scrapePages.depth), asc(scrapePages.url)),
		};
	if (mode === "images")
		return {
			...empty,
			images: await db
				.select()
				.from(scrapeImages)
				.where(
					and(eq(scrapeImages.scrapeId, id), eq(scrapeImages.userId, userId)),
				)
				.orderBy(asc(scrapeImages.url)),
		};
	return empty;
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
		.orderBy(desc(scrapeDocuments.createdAt))
		.limit(1);
	const ageMs = Date.now() - row.createdAt.getTime();
	const health =
		row.status === "queued" && ageMs > SCRAPE_LIMITS.queueHealthAfterMs
			? "Belum ada worker yang mengambil job ini. Pastikan worker berjalan; antrean akan dilanjutkan saat worker tersedia."
			: row.leaseExpiresAt &&
					row.leaseExpiresAt <= new Date() &&
					!["completed", "failed"].includes(row.status)
				? "Heartbeat worker tidak aktif. Job menunggu pemulihan lease oleh worker."
				: undefined;
	const results = await getScrapeResults(
		id,
		userId,
		(row.mode ?? "design") as ScrapeMode,
	);
	return {
		...row,
		metadata: { ...row.metadata, workerHealth: health },
		document: document ?? null,
		pages: results.pages,
		images: results.images,
	};
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
	const generated = await generateDesignMd(captured.metadata.visualEvidence);
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

// Retries only the AI synthesis step from persisted evidence, without
// recapturing the website. Valid measurements are never discarded: a failed
// retry still leaves the measurement-only document intact.
export async function retryDesignSynthesis(
	scrapeId: string,
	userId: string,
): Promise<ScrapeDocumentRow> {
	const scrape = await getScrapeById(scrapeId, userId);
	const evidence = scrape.metadata?.visualEvidence;
	if (!evidence)
		throw new ScrapeError(
			"NO_ANALYZABLE_CONTENT",
			"Evidence visual tersimpan tidak tersedia untuk retry.",
		);
	const { generateDesignMd } = await import("@/lib/prompts-design-md");
	const generated = await generateDesignMd(evidence, {
		onActivity: async () => {},
		onTiming: () => {},
	});
	await db
		.update(scrapes)
		.set({
			metadata: {
				...scrape.metadata,
				aiEnrichment: generated.enrichment.status,
				aiEnrichmentDetail: generated.enrichment.detail,
				designModelVersion: generated.model.version,
			},
			updatedAt: new Date(),
		})
		.where(and(eq(scrapes.id, scrapeId), eq(scrapes.userId, userId)));
	return saveScrapeDocument(scrapeId, generated.document, userId);
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
