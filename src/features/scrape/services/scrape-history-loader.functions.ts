import { createServerFn } from "@tanstack/react-start";
import type { ScrapeHistoryItem } from "@/features/scrape/components/scrape-history-list";
import {
	parseScrapeHistoryBulkDelete,
	parseScrapeHistorySearch,
	resolveScrapeHistoryOffset,
	type ScrapeHistoryBulkDeleteResult,
	type ScrapeHistoryBulkSelection,
	type ScrapeHistorySearch,
} from "@/features/scrape/types/scrape-contract";
import {
	clampHistoryPage,
	historyTotalPages,
} from "@/features/scrape/utils/scrape-history";
import { requireUserServer } from "@/lib/session";

export interface ScrapeHistoryLoaderData {
	items: ScrapeHistoryItem[];
	total: number;
	page: number;
	pageSize: number;
	sort: ScrapeHistorySearch["sort"];
	mode?: ScrapeHistorySearch["mode"];
	status?: ScrapeHistorySearch["status"];
	q: string;
}

export const loadScrapesHistory = createServerFn({ method: "GET" })
	.validator((data: unknown) => parseScrapeHistorySearch(data))
	.handler(async ({ data }): Promise<ScrapeHistoryLoaderData> => {
		const user = await requireUserServer();
		const { listScrapeHistory } = await import(
			"@/features/scrape/services/scrape-service"
		);
		const filters = {
			mode: data.mode,
			status: data.status,
			search: data.q,
			sort: data.sort,
		};
		const first = await listScrapeHistory(user.id, {
			...filters,
			...resolveScrapeHistoryOffset(data),
		});
		const page = clampHistoryPage(
			data.page,
			historyTotalPages(first.total, data.pageSize),
		);
		const settled =
			page === data.page
				? first
				: await listScrapeHistory(user.id, {
						...filters,
						limit: data.pageSize,
						offset: (page - 1) * data.pageSize,
					});
		return {
			items: settled.items.map((row) => ({
				id: row.id,
				sourceUrl: row.sourceUrl,
				domain: row.domain,
				title: row.title,
				status: row.status,
				mode: row.mode,
				imageCounts: row.imageCounts,
				createdAt: row.createdAt.toISOString(),
			})),
			total: settled.total,
			page,
			pageSize: data.pageSize,
			sort: data.sort,
			...(data.mode ? { mode: data.mode } : {}),
			...(data.status ? { status: data.status } : {}),
			q: data.q,
		};
	});

export const deleteScrapeItem = createServerFn({ method: "POST" })
	.validator((id: string) => id)
	.handler(async ({ data: id }): Promise<{ ok: true }> => {
		const user = await requireUserServer();
		const { deleteScrape } = await import(
			"@/features/scrape/services/scrape-service"
		);
		return deleteScrape(id, user.id);
	});

// Prepares the cross-page selection scope on the server. The snapshot is
// derived from the validated filter and the caller's own rows, so the client
// never decides which rows a bulk delete may reach.
export const prepareScrapeHistorySelection = createServerFn({ method: "GET" })
	.validator((data: unknown) => parseScrapeHistorySearch(data))
	.handler(async ({ data }): Promise<ScrapeHistoryBulkSelection> => {
		const user = await requireUserServer();
		const { prepareScrapeHistoryBulkSelection } = await import(
			"@/features/scrape/services/scrape-service"
		);
		return prepareScrapeHistoryBulkSelection(user.id, {
			mode: data.mode,
			status: data.status,
			search: data.q,
			sort: data.sort,
		});
	});

export const deleteScrapeItems = createServerFn({ method: "POST" })
	.validator((data: unknown) => parseScrapeHistoryBulkDelete(data))
	.handler(async ({ data }): Promise<ScrapeHistoryBulkDeleteResult> => {
		const user = await requireUserServer();
		const { deleteOwnedScrapes } = await import(
			"@/features/scrape/services/scrape-service"
		);
		return deleteOwnedScrapes(data.ids, user.id);
	});
