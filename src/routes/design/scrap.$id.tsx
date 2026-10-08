import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { ArrowLeft } from "lucide-react";
import { DesignResult } from "@/components/design/design-result";
import { ScrapeDetail } from "@/components/design/scrape-detail";
import { ScrapeProgress } from "@/components/design/scrape-progress";
import { resolveScrapeView } from "@/components/design/scrape-view-state";
import type { ScrapeMode, ScrapeStatus } from "@/db/schema";
import {
	toScrapeStatusSnapshot,
	useScrapeStatus,
} from "@/hooks/use-scrape-status";
import { requireUserServer } from "@/lib/session";
import { displaySiteName } from "@/lib/site-name";

const loadScrapeDetail = createServerFn({ method: "GET" })
	.validator((id: string) => id)
	.handler(async ({ data: id }) => {
		const user = await requireUserServer();
		const { getScrapeById } = await import("@/lib/services/scrape-service");
		const scrape = await getScrapeById(id, user.id);
		return {
			id: scrape.id,
			sourceUrl: scrape.sourceUrl,
			domain: scrape.domain,
			title: scrape.title,
			status: scrape.status,
			mode: scrape.mode,
			previewHtml: scrape.previewHtml ?? "",
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

	const { data, status: polledStatus, isRetrying, retry } = useScrapeStatus(
		id,
		{
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
		},
	);

	if (!initial) throw new Error("NOT_FOUND");

	const currentStatus = (polledStatus ??
		data?.status ??
		initial.status) as ScrapeStatus;
	const mode: ScrapeMode = (data?.mode ??
		initial.mode ??
		"design") as ScrapeMode;
	const sourceUrl = data?.sourceUrl ?? initial.sourceUrl;
	const domain = data?.domain ?? initial.domain;
	const previewHtml = data?.previewHtml ?? initial.previewHtml;
	const designMd = data?.document?.designMd ?? initial.designMd;

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

	const view = resolveScrapeView({
		status: currentStatus,
		mode,
		previewHtml,
		designMd,
	});

	const siteName = displaySiteName(domain);
	const wideResult = view === "result-design";

	return (
		<main
			className={`mx-auto flex w-full flex-col gap-6 px-4 py-10 sm:px-6 sm:py-14 ${
				wideResult ? "max-w-7xl" : "max-w-5xl"
			}`}
		>
			<Link
				to="/design/scrap"
				className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-fog transition-colors hover:text-snow"
			>
				<ArrowLeft size={16} aria-hidden />
				Kembali ke scraper
			</Link>
			<header className="max-w-2xl">
				<h1 className="text-3xl font-semibold tracking-tight text-snow">
					{siteName}
				</h1>
				<p className="mt-1 truncate font-mono text-xs text-fog">{domain}</p>
			</header>

			{view === "result-design" ? (
				<DesignResult
					sourceUrl={sourceUrl}
					domain={domain}
					designMd={designMd}
				/>
			) : view === "result-html" ? (
				<ScrapeDetail domain={domain} previewHtml={previewHtml} />
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
				/>
			)}
		</main>
	);
}
