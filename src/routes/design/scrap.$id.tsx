import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import type { ScrapeMode } from "@/db/schema";
import {
	ScrapeDetailErrorView,
	ScrapeDetailView,
} from "@/features/scrape/components/scrape-detail-view";
import { parseScrapeHistorySearch } from "@/features/scrape/types/scrape-contract";
import { toScrapeHistorySearchParams } from "@/features/scrape/utils/scrape-history";
import { parseScrapeReturnSearch } from "@/features/scrape/utils/scrape-return-path";
import { requireUserServer } from "@/lib/session";

export const loadScrapeDetail = createServerFn({ method: "GET" })
	.validator((id: string) => id)
	.handler(async ({ data: id }) => {
		const user = await requireUserServer();
		const { getScrapeById, getScrapeResults } = await import(
			"@/features/scrape/services/scrape-service"
		);
		const scrape = await getScrapeById(id, user.id);
		const mode = (scrape.mode ?? "design") as ScrapeMode;
		const { pages, images: imageRows } = await getScrapeResults(
			id,
			user.id,
			mode,
		);
		const { signScrapeImages } = await import(
			"@/features/scrape/services/scrape-service"
		);
		const images = await signScrapeImages(imageRows, id, user.id);
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
			"@/features/scrape/utils/scrape-preview-document"
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
	validateSearch: (search) => ({
		...parseScrapeReturnSearch(search),
		...toScrapeHistorySearchParams(parseScrapeHistorySearch(search)),
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
	errorComponent: ScrapeDetailErrorView,
});

function ScrapeDetailPage() {
	const initial = Route.useLoaderData();
	const { id } = Route.useParams();
	const rawSearch = Route.useSearch();
	const { from } = rawSearch;
	const history = parseScrapeHistorySearch(rawSearch);

	if (!initial) throw new Error("NOT_FOUND");

	return (
		<ScrapeDetailView id={id} initial={initial} from={from} history={history} />
	);
}
