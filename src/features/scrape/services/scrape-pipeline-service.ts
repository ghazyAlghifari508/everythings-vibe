import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
	type ScrapeMetadata,
	type ScrapeMode,
	type ScrapeRow,
	type ScrapeStatus,
	scrapes,
} from "@/db/schema";
import {
	type ScrapeCapture,
	scrapeHtml,
} from "@/features/scrape/services/page-capture";
import { scrapeRequestSchema } from "@/features/scrape/types/scrape-contract";
import type { ScrapeInstrumentation } from "@/features/scrape/types/scrape-instrumentation";
import {
	errorSourceForCode,
	ScrapeError,
	scrapeFailureReasonForCode,
} from "@/lib/design-errors";
import { generateDesignMd } from "./prompts-design-md";
import { saveScrapeDocument } from "./scrape-document-service";
import {
	type ScrapeJobClaim,
	scrapeClaimPredicate,
} from "./scrape-job-service";

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
	const pipelineStart = Date.now();
	timings.queueWait = pipelineStart - scrape.createdAt.getTime();
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
			timings.pipelineTotal = Date.now() - pipelineStart;
			await persist("completed");
			console.info(
				JSON.stringify({
					scrapeTimings: true,
					scrapeId,
					mode,
					totalMs: timings.pipelineTotal,
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
		const aiStart = Date.now();
		const generated = await generateDesignMd(
			captured.metadata.visualEvidence,
			instrumentation,
			claim?.signal,
			{ title: captured.title ?? undefined },
		);
		const designMd = generated.document;
		instrumentation.onTiming?.("aiSynthesis", Date.now() - aiStart);
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
		timings.pipelineTotal = Date.now() - pipelineStart;
		await persist("completed");
		console.info(
			JSON.stringify({
				scrapeTimings: true,
				scrapeId,
				mode,
				totalMs: timings.pipelineTotal,
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
