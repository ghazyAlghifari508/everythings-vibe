import { createFileRoute, useRouter } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useEffect } from "react";
import { CrawlResult } from "@/components/design/crawl-result";
import { DesignResult } from "@/components/design/design-result";
import { ImagesResult } from "@/components/design/images-result";
import { ScrapeBackLink } from "@/components/design/scrape-back-link";
import { ScrapeDetail } from "@/components/design/scrape-detail";
import { SCRAPE_RESULTS_ANCHOR_ID } from "@/components/design/scrape-error-card";
import { ScrapeProgress } from "@/components/design/scrape-progress";
import {
	resolveScrapeContentWidth,
	resolveScrapeView,
} from "@/components/design/scrape-view-state";
import type { ScrapeMetadata, ScrapeMode, ScrapeStatus } from "@/db/schema";
import { useScrapePreview } from "@/hooks/use-scrape-preview";
import {
	toScrapeStatusSnapshot,
	useScrapeStatus,
} from "@/hooks/use-scrape-status";
import { parseScrapeReturnSearch } from "@/lib/scrape-return-path";
import { requireUserServer } from "@/lib/session";

export const loadScrapeDetail = createServerFn({ method: "GET" })
	.validator((id: string) => id)
	.handler(async ({ data: id }) => {
		const user = await requireUserServer();
		const { getScrapeById, getScrapeResults } = await import(
			"@/lib/services/scrape-service"
		);
		const scrape = await getScrapeById(id, user.id);
		const mode = (scrape.mode ?? "design") as ScrapeMode;
		const { pages, images: imageRows } = await getScrapeResults(
			id,
			user.id,
			mode,
		);
		const { attachImageAssetUrls } = await import("@/lib/preview-capabilities");
		const images = attachImageAssetUrls(imageRows, id, user.id);
		let appOrigin = "http://localhost:3000";
		try {
			const { getRequestHeaders, getRequestUrl } = await import(
				"@tanstack/react-start/server"
			);
			const headers = getRequestHeaders();
			const host =
				headers.get("x-forwarded-host") ?? headers.get("host") ?? "localhost";
			const proto = headers.get("x-forwarded-proto") ?? "http";
			appOrigin =
				typeof getRequestUrl === "function"
					? getRequestUrl({ xForwardedHost: true }).origin
					: `${proto}://${host}`;
		} catch {
			// Fallback when called outside of start server request context
		}
		const { buildScrapePreviewDocument } = await import(
			"@/lib/scrape-preview-document"
		);
		const previewHtml = scrape.html ?? scrape.previewHtml ?? "";
		const preview = buildScrapePreviewDocument(scrape, user.id, appOrigin);
		return {
			pages,
			images,
			id: scrape.id,
			sourceUrl: scrape.sourceUrl,
			domain: scrape.domain,
			title: scrape.title,
			status: scrape.status,
			mode: scrape.mode,
			previewHtml,
			preview,
			designMd: scrape.document?.designMd ?? "",
			metadata: scrape.metadata,
			request: scrape.request ?? null,
			capturedAt:
				scrape.metadata &&
				typeof scrape.metadata === "object" &&
				"capturedAt" in scrape.metadata &&
				typeof scrape.metadata.capturedAt === "string"
					? scrape.metadata.capturedAt
					: scrape.createdAt.toISOString(),
		};
	});

export const Route = createFileRoute("/design/scrap/$id")({
	head: () => ({
		meta: [{ title: "Hasil Scrape | VibeDesign" }],
	}),
	validateSearch: (search) => parseScrapeReturnSearch(search),
	loader: async ({ params }) => {
		try {
			return await loadScrapeDetail({ data: params.id });
		} catch (e) {
			if (e instanceof Error && e.message === "Unauthorized") {
				const { redirect } = await import("@tanstack/react-router");
				throw redirect({ to: "/login" });
			}
			throw e;
		}
	},
	component: ScrapeDetailPage,
	errorComponent: () => (
		<main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
			<p className="rounded-xl border border-graphite bg-charcoal p-8 text-center text-sm text-mist">
				Scrape tidak ditemukan atau gagal dimuat.
			</p>
		</main>
	),
});

function ScrapeDetailPage() {
	const router = useRouter();
	const initial = Route.useLoaderData();
	const { id } = Route.useParams();
	const { from } = Route.useSearch();

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
					mode: initial.mode,
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

	if (!initial) throw new Error("NOT_FOUND");

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
	// Polled results win so rows persisted after the initial load appear without
	// a reload; the loader snapshot only seeds the first render.
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
					maxPages: crawlRequest.settings.maxPages,
					maxDepth: crawlRequest.settings.maxDepth,
					followSubdomains: crawlRequest.settings.followSubdomains,
					urlRegex: crawlRequest.settings.urlRegex,
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
			<ScrapeBackLink from={from} />
			{currentStatus === "failed" &&
				(mode === "crawl" ||
					mode === "images" ||
					// An HTML run that persisted its capture keeps that partial
					// result, so the failure card is shown with the saved document.
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
						savedImages={data?.metadata?.savedImages}
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
				// A failed HTML run that already persisted its capture keeps that
				// partial result visible instead of discarding it.
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
					savedImages={data?.metadata?.savedImages}
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
