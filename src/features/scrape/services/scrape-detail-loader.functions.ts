import { createServerFn } from "@tanstack/react-start";
import type { ScrapeMode } from "@/db/schema";
import { requireUserServer } from "@/lib/session";

export const loadScrapeDetail = createServerFn({ method: "GET" })
	.validator((id: string) => id)
	.handler(async ({ data: id }) => {
		const user = await requireUserServer();
		const { getScrapeById, getScrapeResults } = await import(
			"@/features/scrape/services/scrape-service"
		);
		const scrape = await getScrapeById(id, user.id);
		// cast boundary: scrapes.mode is untyped text; the write path stores a ScrapeMode.
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
