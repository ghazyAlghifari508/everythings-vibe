import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
	type ScrapeDocumentRow,
	type ScrapeMode,
	type ScrapeRow,
	scrapeDocuments,
	scrapeImages,
	scrapePages,
	scrapes,
} from "@/db/schema";
import { SCRAPE_LIMITS } from "@/features/scrape/types/scrape-contract";
import type { imageResultCounts } from "@/features/scrape/utils/scrape-images";
import { ScrapeError } from "@/lib/design-errors";

export interface ScrapeSummary {
	id: string;
	sourceUrl: string;
	domain: string;
	title: string | null;
	mode: ScrapeMode;
	status: string;
	createdAt: Date;
	imageCounts?: ReturnType<typeof imageResultCounts>;
}

export type ScrapePageRow = typeof scrapePages.$inferSelect;
export type ScrapeImageRow = typeof scrapeImages.$inferSelect;

// A verified image row plus the same-origin signed URL used for preview and
// download. Only rows whose resource passed verification reach the client.
export type ScrapeImageResult = ScrapeImageRow & { assetUrl: string };

export async function signScrapeImages(
	images: ScrapeImageRow[],
	scrapeId: string,
	ownerId: string,
): Promise<ScrapeImageResult[]> {
	const { attachImageAssetUrls, storedImageAssetUrl } = await import(
		"@/features/scrape/utils/preview-capabilities"
	);
	return images.map((image) => ({
		...image,
		assetUrl: image.assetId
			? storedImageAssetUrl(image.id, scrapeId, ownerId)
			: attachImageAssetUrls([image], scrapeId, ownerId)[0].assetUrl,
	}));
}

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
