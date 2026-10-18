import { and, asc, count, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { db } from "@/db";
import {
	type ScrapeMetadata,
	type ScrapeMode,
	scrapeImages,
	scrapes,
} from "@/db/schema";
import type {
	ScrapeHistoryMode,
	ScrapeHistorySort,
	ScrapeHistoryStatusGroup,
} from "@/features/scrape/types/scrape-contract";
import { imageResultCounts } from "@/features/scrape/utils/scrape-images";
import {
	SCRAPE_HISTORY_MAX_LIMIT,
	SCRAPE_HISTORY_SEARCH_MAX_CHARS,
} from "@/lib/constants";
import type { ScrapeSummary } from "./scrape-detail-service";

export interface ScrapeHistoryQuery {
	mode?: ScrapeHistoryMode;
	status?: ScrapeHistoryStatusGroup;
	search?: string;
	sort?: ScrapeHistorySort;
	limit?: number;
	offset?: number;
}

export interface NormalizedScrapeHistoryQuery {
	mode?: ScrapeHistoryMode;
	status?: ScrapeHistoryStatusGroup;
	search: string;
	sort: ScrapeHistorySort;
	limit: number;
	offset: number;
}

export interface ScrapeHistoryPage {
	items: ScrapeSummary[];
	total: number;
	limit: number;
	offset: number;
}

const SCRAPE_HISTORY_PROCESSING_STATUSES = [
	"queued",
	"capturing",
	"extracting",
	"generating",
	"saving",
] as const;

function isScrapeHistoryMode(value: unknown): value is ScrapeHistoryMode {
	return (
		value === "design" ||
		value === "html" ||
		value === "crawl" ||
		value === "images"
	);
}

function isScrapeHistoryStatus(
	value: unknown,
): value is ScrapeHistoryStatusGroup {
	return value === "completed" || value === "failed" || value === "processing";
}

export function normalizeScrapeHistoryQuery(
	raw: ScrapeHistoryQuery = {},
): NormalizedScrapeHistoryQuery {
	const mode = isScrapeHistoryMode(raw.mode) ? raw.mode : undefined;
	const status = isScrapeHistoryStatus(raw.status) ? raw.status : undefined;
	const search =
		typeof raw.search === "string"
			? raw.search.trim().slice(0, SCRAPE_HISTORY_SEARCH_MAX_CHARS)
			: "";
	const sort: ScrapeHistorySort = raw.sort === "oldest" ? "oldest" : "newest";
	const limit = Number.isSafeInteger(raw.limit)
		? Math.min(Math.max(raw.limit as number, 1), SCRAPE_HISTORY_MAX_LIMIT)
		: 10;
	const offset = Number.isSafeInteger(raw.offset)
		? Math.max(raw.offset as number, 0)
		: 0;
	return {
		...(mode ? { mode } : {}),
		...(status ? { status } : {}),
		search,
		sort,
		limit,
		offset,
	};
}

function escapeHistoryLike(value: string): string {
	return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function scrapeHistoryConditions(
	userId: string,
	query: NormalizedScrapeHistoryQuery,
) {
	const conditions = [eq(scrapes.userId, userId)];
	if (query.mode) conditions.push(eq(scrapes.mode, query.mode));
	if (query.status === "completed")
		conditions.push(eq(scrapes.status, "completed"));
	else if (query.status === "failed")
		conditions.push(eq(scrapes.status, "failed"));
	else if (query.status === "processing")
		conditions.push(
			inArray(scrapes.status, [...SCRAPE_HISTORY_PROCESSING_STATUSES]),
		);
	if (query.search) {
		const pattern = `%${escapeHistoryLike(query.search)}%`;
		const searchCondition = or(
			ilike(scrapes.domain, pattern),
			ilike(scrapes.title, pattern),
			ilike(scrapes.sourceUrl, pattern),
		);
		if (searchCondition) conditions.push(searchCondition);
	}
	return conditions;
}

export async function countScrapes(
	userId: string,
	raw: ScrapeHistoryQuery = {},
): Promise<number> {
	const query = normalizeScrapeHistoryQuery(raw);
	const [row] = await db
		.select({ total: count() })
		.from(scrapes)
		.where(and(...scrapeHistoryConditions(userId, query)));
	return row?.total ?? 0;
}

async function toScrapeSummaries(
	rows: Array<{
		id: string;
		sourceUrl: string;
		domain: string;
		title: string | null;
		mode: ScrapeMode | string | null;
		metadata: ScrapeMetadata | null;
		status: string;
		createdAt: Date;
	}>,
	userId: string,
): Promise<ScrapeSummary[]> {
	const imageRows = rows.length
		? await db
				.select({
					scrapeId: scrapeImages.scrapeId,
					status: scrapeImages.status,
					assetId: scrapeImages.assetId,
				})
				.from(scrapeImages)
				.where(
					and(
						eq(scrapeImages.userId, userId),
						inArray(
							scrapeImages.scrapeId,
							rows.map((row) => row.id),
						),
					),
				)
		: [];
	return rows.map((r) => ({
		id: r.id,
		sourceUrl: r.sourceUrl,
		domain: r.domain,
		title: r.title,
		mode: (r.mode ?? r.metadata?.mode ?? "design") as ScrapeMode,
		status: r.status,
		createdAt: r.createdAt,
		...(r.mode === "images"
			? {
					imageCounts: imageResultCounts(
						imageRows.filter((image) => image.scrapeId === r.id),
						r.metadata?.discoveredImages,
					),
				}
			: {}),
	}));
}

export async function listScrapeHistory(
	userId: string,
	raw: ScrapeHistoryQuery = {},
): Promise<ScrapeHistoryPage> {
	const query = normalizeScrapeHistoryQuery(raw);
	const ordering =
		query.sort === "oldest"
			? [asc(scrapes.createdAt), asc(scrapes.id)]
			: [desc(scrapes.createdAt), desc(scrapes.id)];
	const [countRow, rows] = await Promise.all([
		db
			.select({ total: count() })
			.from(scrapes)
			.where(and(...scrapeHistoryConditions(userId, query))),
		db
			.select({
				id: scrapes.id,
				sourceUrl: scrapes.sourceUrl,
				domain: scrapes.domain,
				title: scrapes.title,
				mode: scrapes.mode,
				metadata: scrapes.metadata,
				status: scrapes.status,
				createdAt: scrapes.createdAt,
			})
			.from(scrapes)
			.where(and(...scrapeHistoryConditions(userId, query)))
			.orderBy(...ordering)
			.limit(query.limit)
			.offset(query.offset),
	]);
	const total = countRow[0]?.total ?? 0;
	return {
		items: await toScrapeSummaries(rows, userId),
		total,
		limit: query.limit,
		offset: query.offset,
	};
}

export async function listScrapes(
	userId: string,
	limit = 50,
): Promise<ScrapeSummary[]> {
	const page = await listScrapeHistory(userId, { limit, sort: "newest" });
	return page.items;
}
