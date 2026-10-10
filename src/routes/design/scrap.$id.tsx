import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { DesignResult } from "@/components/design/design-result";
import { ScrapeBackLink } from "@/components/design/scrape-back-link";
import { ScrapeDetail } from "@/components/design/scrape-detail";
import { ScrapeProgress } from "@/components/design/scrape-progress";
import {
	resolveScrapeContentWidth,
	resolveScrapeView,
} from "@/components/design/scrape-view-state";
import type { ScrapeMode, ScrapeStatus } from "@/db/schema";
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
		const { getScrapeById } = await import("@/lib/services/scrape-service");
		const scrape = await getScrapeById(id, user.id);
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
	const initial = Route.useLoaderData();
	const { id } = Route.useParams();
	const { from } = Route.useSearch();

	const {
		data,
		status: polledStatus,
		isRetrying,
		retry,
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

	const metadata = (data?.metadata ?? initial.metadata) as Record<
		string,
		unknown
	> | null;
	const errorMessage =
		metadata && typeof metadata === "object" && "errorMessage" in metadata
			? String(metadata.errorMessage)
			: null;
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

	return (
		<main
			className={`flex w-full flex-col gap-6 py-10 sm:py-14 ${
				contentWidth === "wide"
					? "px-6 sm:px-8 lg:px-10"
					: "mx-auto max-w-5xl px-4 sm:px-6"
			}`}
		>
			<ScrapeBackLink from={from} />
			{view === "result-design" ? (
				<DesignResult
					sourceUrl={sourceUrl}
					domain={domain}
					designMd={designMd}
				/>
			) : view === "result-html" ? (
				<ScrapeDetail
					domain={domain}
					previewHtml={previewHtml}
					previewSrcDoc={previewSrcDoc}
					previewState={previewState}
					previewError={previewError}
					onRetryPreview={() => void retryPreview()}
				/>
			) : (
				<ScrapeProgress
					mode={mode}
					status={currentStatus}
					sourceUrl={sourceUrl}
					domain={domain}
					errorMessage={errorMessage}
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
