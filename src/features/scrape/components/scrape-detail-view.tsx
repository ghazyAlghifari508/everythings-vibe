"use client";

import { useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import type { ScrapeMetadata, ScrapeMode, ScrapeStatus } from "@/db/schema";
import type { ScrapeHistorySearch } from "@/lib/scrape-contract";
import { imageResultCounts } from "@/lib/scrape-images";
import type { ScrapePreviewDocument } from "@/lib/scrape-preview-document";
import type { ScrapeDetailPayload } from "@/lib/services/scrape-service";
import { useScrapePreview } from "../hooks/use-scrape-preview";
import {
	toScrapeStatusSnapshot,
	useScrapeStatus,
} from "../hooks/use-scrape-status";
import {
	resolveScrapeContentWidth,
	resolveScrapeView,
} from "../types/view-state";
import { CrawlResult } from "./crawl-result";
import { DesignResult } from "./design-result";
import { ImagesResult } from "./images-result";
import { ScrapeBackLink } from "./scrape-back-link";
import { ScrapeDetail } from "./scrape-detail";
import { SCRAPE_RESULTS_ANCHOR_ID } from "./scrape-error-card";
import { ScrapeProgress } from "./scrape-progress";

export interface ScrapeDetailInitialData {
	pages: ScrapeDetailPayload["pages"];
	images: ScrapeDetailPayload["images"];
	id: string;
	sourceUrl: string;
	domain: string;
	title: string | null;
	status: string;
	mode: string;
	previewHtml: string;
	preview: ScrapePreviewDocument | null;
	designMd: string;
	metadata: ScrapeMetadata | null;
	request?: unknown;
	capturedAt: string;
}

export interface ScrapeDetailViewProps {
	id: string;
	initial: ScrapeDetailInitialData;
	from?: unknown;
	history?: ScrapeHistorySearch;
}

export function ScrapeDetailView({
	id,
	initial,
	from,
	history,
}: ScrapeDetailViewProps) {
	const router = useRouter();

	const {
		data,
		status: polledStatus,
		isRetrying,
		retry,
		error: requestError,
	} = useScrapeStatus(id, {
		initialData: initial
			? toScrapeStatusSnapshot({
					status: initial.status,
					mode: initial.mode as ScrapeMode,
					sourceUrl: initial.sourceUrl,
					domain: initial.domain,
					previewHtml: initial.previewHtml,
					designMd: initial.designMd,
					metadata: initial.metadata,
				})
			: null,
	});

	useEffect(() => {
		if (
			(polledStatus === "completed" || polledStatus === "failed") &&
			initial.status !== polledStatus
		)
			void router.invalidate();
	}, [polledStatus, initial.status, router]);

	const currentStatus = (polledStatus ??
		data?.status ??
		initial.status) as ScrapeStatus;
	const mode: ScrapeMode = (data?.mode ??
		initial.mode ??
		"design") as ScrapeMode;
	const sourceUrl = data?.sourceUrl ?? initial.sourceUrl;
	const domain = data?.domain ?? initial.domain;
	const previewHtml =
		(data && "html" in data ? data.html : null) ?? initial.previewHtml;
	const designMd = data?.document?.designMd ?? initial.designMd;

	const isHtmlResult = mode === "html";
	const {
		preview,
		state: previewState,
		error: previewError,
		retry: retryPreview,
	} = useScrapePreview(id, {
		status: currentStatus,
		enabled: isHtmlResult,
		initialPreview: initial.preview ?? null,
	});
	const previewSrcDoc = preview?.srcDoc ?? "";

	const metadata = (data?.metadata ??
		initial.metadata) as ScrapeMetadata | null;
	const pages = data?.pages ?? initial.pages;
	const images = data?.images ?? initial.images;
	const hasVerifiedImages = images.some(
		(image) => image.status === "completed",
	);
	const isTerminalStatus =
		currentStatus === "completed" || currentStatus === "failed";
	const errorMessage =
		requestError ??
		(metadata && typeof metadata === "object" && "errorMessage" in metadata
			? String(metadata.errorMessage)
			: null);
	const errorDetail = metadata?.errorDetail ?? null;
	const failedAtStage = metadata?.failedAtStage ?? null;
	const retryAfterSeconds = metadata?.retryAfterSeconds ?? null;
	const retryAfterExpiresAt = metadata?.retryAfterExpiresAt ?? null;
	const stageStartedAt =
		metadata &&
		typeof metadata === "object" &&
		"stageStartedAt" in metadata &&
		typeof metadata.stageStartedAt === "string"
			? metadata.stageStartedAt
			: null;
	const activity =
		metadata &&
		typeof metadata === "object" &&
		"activity" in metadata &&
		typeof metadata.activity === "string"
			? metadata.activity
			: null;
	const activityStartedAt =
		metadata &&
		typeof metadata === "object" &&
		"activityStartedAt" in metadata &&
		typeof metadata.activityStartedAt === "string"
			? metadata.activityStartedAt
			: null;

	const view = resolveScrapeView({
		status: currentStatus,
		mode,
		previewHtml,
		designMd,
	});

	const contentWidth = resolveScrapeContentWidth(view, mode);

	const polledRequest =
		data && typeof data === "object" && "request" in data
			? (data.request ?? null)
			: null;
	const initialRequest =
		"request" in initial ? (initial.request ?? null) : null;
	const crawlRequest = polledRequest ?? initialRequest;
	const crawlScope =
		crawlRequest &&
		typeof crawlRequest === "object" &&
		"mode" in crawlRequest &&
		crawlRequest.mode === "crawl" &&
		"settings" in crawlRequest &&
		crawlRequest.settings &&
		typeof crawlRequest.settings === "object"
			? {
					maxPages:
						"maxPages" in crawlRequest.settings &&
						typeof crawlRequest.settings.maxPages === "number"
							? crawlRequest.settings.maxPages
							: 1,
					maxDepth:
						"maxDepth" in crawlRequest.settings &&
						typeof crawlRequest.settings.maxDepth === "number"
							? crawlRequest.settings.maxDepth
							: 0,
					followSubdomains:
						"followSubdomains" in crawlRequest.settings &&
						typeof crawlRequest.settings.followSubdomains === "boolean"
							? crawlRequest.settings.followSubdomains
							: undefined,
					urlRegex:
						"urlRegex" in crawlRequest.settings &&
						typeof crawlRequest.settings.urlRegex === "string"
							? crawlRequest.settings.urlRegex
							: undefined,
				}
			: undefined;
	const capturedAt =
		(data?.metadata &&
		typeof data.metadata === "object" &&
		"capturedAt" in data.metadata &&
		typeof data.metadata.capturedAt === "string"
			? data.metadata.capturedAt
			: null) ?? initial.capturedAt;

	return (
		<main
			className={`flex w-full flex-col gap-6 py-10 sm:py-14 ${
				contentWidth === "wide"
					? "px-6 sm:px-8 lg:px-10"
					: "mx-auto max-w-5xl px-4 sm:px-6"
			}`}
		>
			<ScrapeBackLink from={from} historySearch={history} />
			{currentStatus === "failed" &&
				(mode === "crawl" ||
					mode === "images" ||
					(mode === "html" && previewHtml.length > 0)) && (
					<ScrapeProgress
						mode={mode}
						status={currentStatus}
						sourceUrl={sourceUrl}
						domain={domain}
						errorMessage={errorMessage}
						errorDetail={errorDetail}
						failedAtStage={failedAtStage}
						retryAfterSeconds={retryAfterSeconds}
						retryAfterExpiresAt={retryAfterExpiresAt}
						layout={
							mode === "images" || mode === "html" ? "single" : "two-panel"
						}
						isRetrying={isRetrying}
						onRetry={retry}
						imageDiscovery={data?.metadata?.imageDiscovery ?? null}
						imageOutcome={data?.metadata?.imageOutcome ?? null}
						discoveredImages={data?.metadata?.discoveredImages}
						imageCounts={imageResultCounts(
							images,
							data?.metadata?.discoveredImages,
						)}
						processedImages={data?.metadata?.processedImages}
						failedResources={data?.metadata?.failedResources}
						partialResults={
							mode === "crawl"
								? pages.filter((page) => page.status === "completed").length
								: mode === "images"
									? images.filter((image) => image.status === "completed")
											.length
									: 1
						}
						partialFailed={
							mode === "crawl"
								? pages.filter((page) => page.status === "failed").length
								: mode === "images"
									? images.filter((image) => image.status === "failed").length
									: 0
						}
					/>
				)}
			{mode === "crawl" &&
			(currentStatus === "completed" ||
				(currentStatus === "failed" && pages.length > 0)) ? (
				<div id={SCRAPE_RESULTS_ANCHOR_ID} className="scroll-mt-6">
					<CrawlResult
						pages={pages}
						sourceUrl={sourceUrl}
						scope={crawlScope}
						capturedAt={capturedAt ?? undefined}
						domain={domain}
					/>
				</div>
			) : mode === "images" &&
				(currentStatus === "completed" ||
					(currentStatus === "failed" && images.length > 0) ||
					(!isTerminalStatus && hasVerifiedImages)) ? (
				<div id={SCRAPE_RESULTS_ANCHOR_ID} className="scroll-mt-6">
					<ImagesResult
						images={images}
						discoveredImages={metadata?.discoveredImages}
						sourceUrl={sourceUrl}
						imageOutcome={data?.metadata?.imageOutcome ?? null}
					/>
				</div>
			) : view === "result-design" ? (
				<DesignResult
					sourceUrl={sourceUrl}
					domain={domain}
					designMd={designMd}
					visualEvidence={metadata?.visualEvidence}
					enrichment={metadata?.aiEnrichment}
					enrichmentDetail={metadata?.aiEnrichmentDetail}
				/>
			) : view === "result-html" ||
				(currentStatus === "failed" &&
					mode === "html" &&
					previewHtml.length > 0) ? (
				<div id={SCRAPE_RESULTS_ANCHOR_ID} className="scroll-mt-6">
					<ScrapeDetail
						sourceUrl={sourceUrl}
						title={initial.title}
						domain={domain}
						previewHtml={previewHtml}
						previewSrcDoc={previewSrcDoc}
						previewState={previewState}
						previewError={previewError}
						screenshot={metadata?.screenshot ?? null}
						onRetryPreview={() => void retryPreview()}
					/>
				</div>
			) : currentStatus === "failed" &&
				(mode === "crawl" || mode === "images") ? null : (
				<ScrapeProgress
					workerHealth={data?.metadata?.workerHealth}
					imageDiscovery={data?.metadata?.imageDiscovery ?? null}
					imageOutcome={data?.metadata?.imageOutcome ?? null}
					completedPages={data?.metadata?.completedPages}
					skippedPages={data?.metadata?.skippedPages}
					discoveredImages={data?.metadata?.discoveredImages}
					imageCounts={imageResultCounts(
						images,
						data?.metadata?.discoveredImages,
					)}
					failedResources={data?.metadata?.failedResources}
					visitedPages={
						data?.metadata?.visitedPages ?? initial.metadata?.visitedPages
					}
					discoveredPages={
						data?.metadata?.discoveredPages ?? initial.metadata?.discoveredPages
					}
					processedImages={
						data?.metadata?.processedImages ?? initial.metadata?.processedImages
					}
					layout={mode === "html" || mode === "images" ? "single" : "two-panel"}
					mode={mode}
					status={currentStatus}
					sourceUrl={sourceUrl}
					domain={domain}
					errorMessage={errorMessage}
					errorDetail={errorDetail}
					failedAtStage={failedAtStage}
					retryAfterSeconds={retryAfterSeconds}
					retryAfterExpiresAt={retryAfterExpiresAt}
					isRetrying={isRetrying}
					onRetry={retry}
					stageStartedAt={stageStartedAt}
					activity={activity}
					activityStartedAt={activityStartedAt}
				/>
			)}
		</main>
	);
}

export function ScrapeDetailErrorView() {
	return (
		<main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
			<p className="rounded-xl border border-graphite bg-charcoal p-8 text-center text-sm text-mist">
				Scrape tidak ditemukan atau gagal dimuat.
			</p>
		</main>
	);
}
