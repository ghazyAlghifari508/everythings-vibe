import type { ScrapeMode } from "@/db/schema";
import { SCRAPE_PREVIEW_ASSET_CAPABILITY_TTL_MS } from "@/lib/constants";
import { buildPreviewSrcDoc } from "@/lib/preview-capabilities";

export interface ScrapePreviewSource {
	id: string;
	status: string;
	mode?: ScrapeMode | null;
	sourceUrl: string;
	html?: string | null;
}

export interface ScrapePreviewDocument {
	srcDoc: string;
	expiresAt: number;
}

export function buildScrapePreviewDocument(
	scrape: ScrapePreviewSource,
	ownerId: string,
	appOrigin: string,
	now = Date.now(),
	secret?: string,
): ScrapePreviewDocument | null {
	const html = scrape.html?.trim();
	if (scrape.status !== "completed" || scrape.mode !== "html" || !html)
		return null;
	const expiresAt = now + SCRAPE_PREVIEW_ASSET_CAPABILITY_TTL_MS;
	return {
		srcDoc: buildPreviewSrcDoc(
			html,
			{
				baseUrl: scrape.sourceUrl,
				appOrigin,
				scrapeId: scrape.id,
				ownerId,
				expiresAt,
				now,
				secret,
			},
			true,
		),
		expiresAt,
	};
}

export function isScrapePreviewDocumentFresh(
	document: ScrapePreviewDocument | null,
	now = Date.now(),
): boolean {
	return document !== null && document.expiresAt > now;
}
