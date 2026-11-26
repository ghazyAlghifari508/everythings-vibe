import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import type { ScrapeRow } from "@/db/schema";
import { scrapes } from "@/db/schema";
import { scrapeRequestSchema } from "@/features/scrape/types/scrape-contract";
import { takeObservation } from "@/features/usage-metering/services/shadow-usage-observation";
import { recordShadowUsage } from "@/features/usage-metering/services/shadow-usage-recorder";
import {
	type ShadowOutcome,
	type ShadowUsageInput,
	unknownCostBreakdown,
} from "@/features/usage-metering/types/shadow-usage";

const BROWSER_TIMING_LABELS: Record<string, true> = {
	browserContext: true,
	navigation: true,
	firstNetworkIdle: true,
	autoScroll: true,
	secondNetworkIdle: true,
	settle: true,
	pageContent: true,
};

export function scrapeOperationKindForMode(mode: string): string {
	switch (mode) {
		case "crawl":
			return "scrape.crawl";
		case "html":
			return "scrape.html";
		case "images":
			return "scrape.images";
		default:
			return "scrape.design_md";
	}
}

export function outcomeForStatus(
	row: Pick<ScrapeRow, "status" | "mode" | "metadata">,
	requestedPages: number | null,
): ShadowOutcome {
	if (row.status === "completed") {
		if (
			requestedPages !== null &&
			row.mode === "crawl" &&
			(row.metadata?.completedPages ?? 0) > 0 &&
			(row.metadata?.completedPages ?? 0) < requestedPages
		)
			return "partial";
		return "success";
	}
	return "failed";
}

/**
 * Finalises one scrape attempt from the persisted row. Reading the row after
 * the pipeline keeps the measurement tied to what actually happened and to
 * the owner, without sampling another job's shared process resources.
 */
export async function finalizeScrapeUsage(input: {
	scrapeId: string;
	userId: string;
	outcome?: ShadowOutcome;
	claimToken?: string;
	finishedAt?: Date;
}): Promise<void> {
	const observation = takeObservation(input.scrapeId);
	const [row] = await db
		.select()
		.from(scrapes)
		.where(
			and(eq(scrapes.id, input.scrapeId), eq(scrapes.userId, input.userId)),
		)
		.limit(1);
	if (!row) return;
	if (input.claimToken && row.jobToken !== input.claimToken) return;

	const parsedRequest = scrapeRequestSchema.safeParse(
		row.request ?? { url: row.sourceUrl, mode: row.mode },
	);
	const request = parsedRequest.success ? parsedRequest.data : null;
	const requestedPages =
		request?.mode === "crawl" ? request.settings.maxPages : null;
	const designExtraction =
		request?.mode === "design"
			? {
					depth: request.settings.depth,
					settingsKeys: Object.keys(request.settings),
				}
			: null;
	const browserRuntimeMs = observation
		? Object.entries(observation.timings)
				.filter(([label]) => BROWSER_TIMING_LABELS[label] === true)
				.reduce((sum, [, duration]) => sum + duration, 0)
		: null;
	const providerRetries = observation?.providerUsage?.providerRetries ?? 0;
	const outputBytes =
		(row.metadata?.htmlBytes ?? 0) + (row.metadata?.previewHtmlBytes ?? 0);
	const unmeasuredComponents: ShadowUsageInput["cost"]["unmeasuredComponents"] =
		[...unknownCostBreakdown().unmeasuredComponents];
	if (row.mode === "images" || row.mode === "crawl")
		unmeasuredComponents.push("bandwidth");

	await recordShadowUsage({
		userId: row.userId,
		productFamily: "scrape",
		operationKind: scrapeOperationKindForMode(row.mode),
		logicalJobId: row.id,
		attemptIndex: Math.max(1, row.jobAttempts),
		retryCount: Math.max(0, row.jobAttempts - 1) + providerRetries,
		startedAt: row.createdAt,
		finishedAt: input.finishedAt ?? new Date(),
		outcome: input.outcome ?? outcomeForStatus(row, requestedPages),
		requestedUnits: requestedPages,
		completedUnits:
			row.metadata?.completedPages ?? row.metadata?.visitedPages ?? 0,
		resourceLimits: {
			maxPages: requestedPages ?? 0,
			maxDepth: request?.mode === "crawl" ? request.settings.maxDepth : 0,
		},
		metrics: {
			requestedPages,
			processedPages:
				row.metadata?.completedPages ?? row.metadata?.visitedPages ?? null,
			browserRuntimeMs: browserRuntimeMs === 0 ? null : browserRuntimeMs,
			extractedImages:
				row.metadata?.processedImages ?? row.metadata?.savedImages ?? null,
			downloadedBytes: null,
			outputBytes: outputBytes === 0 ? null : outputBytes,
			designExtraction,
			measurementScope: "operation",
		},
		providerUsage: observation?.providerUsage ?? null,
		cost: { ...unknownCostBreakdown(), unmeasuredComponents },
		priceSource: null,
		pricingVersion: null,
	});
}
