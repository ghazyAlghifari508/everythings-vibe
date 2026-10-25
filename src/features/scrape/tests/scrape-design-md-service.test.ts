import { beforeEach, describe, expect, it, vi } from "vitest";
import { SCRAPE_DESIGN_SOURCE_LIMIT } from "../types/scrape-constants";

interface Recorder {
	eqs: Array<{ col: unknown; value: unknown }>;
	scrapeRow: Record<string, unknown> | null;
	documentRow: Record<string, unknown> | null;
	listRows: Array<Record<string, unknown>>;
	listQuery: { limit: number; offset: number } | null;
}

const recorder = vi.hoisted(
	(): Recorder => ({
		eqs: [],
		scrapeRow: null,
		documentRow: null,
		listRows: [],
		listQuery: null,
	}),
);

vi.mock("drizzle-orm", () => ({
	and: (...args: unknown[]) => ({ op: "and", args }),
	asc: (col: unknown) => ({ op: "asc", col }),
	desc: (col: unknown) => ({ op: "desc", col }),
	eq: (col: unknown, value: unknown) => {
		recorder.eqs.push({ col, value });
		return { op: "eq", col, value };
	},
	ilike: (col: unknown, value: unknown) => ({ op: "ilike", col, value }),
	or: (...args: unknown[]) => ({ op: "or", args }),
	inArray: (col: unknown, values: unknown) => ({
		op: "inArray",
		col,
		value: values,
	}),
	count: () => ({ op: "count" }),
}));

vi.mock("@/db/schema", () => ({
	scrapes: {
		__table: "scrapes",
		id: "scrapes.id",
		userId: "scrapes.user_id",
		sourceUrl: "scrapes.source_url",
		domain: "scrapes.domain",
		title: "scrapes.title",
		mode: "scrapes.mode",
		metadata: "scrapes.metadata",
		status: "scrapes.status",
		createdAt: "scrapes.created_at",
		leaseExpiresAt: "scrapes.lease_expires_at",
	},
	scrapeDocuments: {
		__table: "scrape_documents",
		scrapeId: "scrape_documents.scrape_id",
		createdAt: "scrape_documents.created_at",
	},
	scrapeImages: {
		__table: "scrape_images",
		scrapeId: "scrape_images.scrape_id",
		userId: "scrape_images.user_id",
		status: "scrape_images.status",
		assetId: "scrape_images.asset_id",
	},
	scrapePages: {
		__table: "scrape_pages",
		scrapeId: "scrape_pages.scrape_id",
		userId: "scrape_pages.user_id",
	},
}));

vi.mock("@/db", () => {
	// getScrapeById reads a single row, listScrapeHistory reads a page plus a
	// count of the same table, so the select shape is what identifies the call.
	const kindOf = (shape: unknown): "row" | "count" | "list" => {
		if (shape === undefined || shape === null) return "row";
		if (typeof shape === "object" && "total" in shape) return "count";
		return "list";
	};
	const tableNameOf = (table: unknown): string =>
		typeof table === "object" &&
		table !== null &&
		"__table" in table &&
		typeof table.__table === "string"
			? table.__table
			: "";
	return {
		db: {
			select: (shape?: unknown) => {
				const kind = kindOf(shape);
				if (kind === "count")
					return {
						from: () => ({
							where: () =>
								Promise.resolve([{ total: recorder.listRows.length }]),
						}),
					};
				if (kind === "list")
					return {
						from: () => ({
							where: () => ({
								orderBy: () => ({
									limit: (limit: number) => ({
										offset: (offset: number) => {
											recorder.listQuery = { limit, offset };
											return Promise.resolve(recorder.listRows);
										},
									}),
								}),
							}),
						}),
					};
				return {
					from: (table: unknown) => ({
						where: () => ({
							limit: () =>
								Promise.resolve(
									tableNameOf(table) === "scrapes"
										? [recorder.scrapeRow].filter(Boolean)
										: [recorder.documentRow].filter(Boolean),
								),
							orderBy: () => ({
								limit: () =>
									Promise.resolve([recorder.documentRow].filter(Boolean)),
							}),
						}),
					}),
				};
			},
		},
	};
});

import {
	getScrapeDesignMd,
	listScrapeDesignSources,
	scrapeDesignMdDtoSchema,
} from "../services/scrape-design-md-service";

const DESIGN_MD = "# Sample\nFont: Arial\n| Canvas | #ffffff | Background |";

function eqValues(col: unknown): unknown[] {
	return recorder.eqs.filter((entry) => entry.col === col).map((e) => e.value);
}

describe("scrape DESIGN.md contract", () => {
	beforeEach(() => {
		recorder.eqs = [];
		recorder.listQuery = null;
		recorder.listRows = [];
		recorder.documentRow = {
			id: "doc-1",
			scrapeId: "scrape-1",
			designMd: DESIGN_MD,
			createdAt: new Date("2026-01-01T00:00:00Z"),
		};
		recorder.scrapeRow = {
			id: "scrape-1",
			userId: "user-1",
			sourceUrl: "https://example.com",
			domain: "example.com",
			title: "Example",
			mode: "design",
			status: "completed",
			metadata: null,
			createdAt: new Date("2026-01-01T00:00:00Z"),
			leaseExpiresAt: null,
		};
	});

	it("exposes only the fields a consumer needs", async () => {
		const dto = await getScrapeDesignMd("scrape-1", "user-1");
		expect(Object.keys(dto).sort()).toEqual([
			"designMd",
			"scrapeId",
			"sourceUrl",
			"title",
		]);
		expect(scrapeDesignMdDtoSchema.safeParse(dto).success).toBe(true);
		expect(dto.designMd).toBe(DESIGN_MD);
		expect(dto.sourceUrl).toBe("https://example.com");
	});

	it("scopes the read to the requesting owner", async () => {
		await getScrapeDesignMd("scrape-1", "user-2");
		expect(eqValues("scrapes.user_id")).toEqual(["user-2"]);
		expect(eqValues("scrapes.id")).toEqual(["scrape-1"]);
	});

	it("fails closed when the record is missing, not ready, or empty", async () => {
		recorder.scrapeRow = null;
		await expect(getScrapeDesignMd("scrape-1", "user-1")).rejects.toThrow(
			"Scrape tidak ditemukan.",
		);

		recorder.scrapeRow = {
			id: "scrape-1",
			userId: "user-1",
			sourceUrl: "https://example.com",
			domain: "example.com",
			title: null,
			mode: "design",
			status: "generating",
			metadata: null,
			createdAt: new Date(),
			leaseExpiresAt: null,
		};
		await expect(getScrapeDesignMd("scrape-1", "user-1")).rejects.toThrow(
			"DESIGN.md belum siap.",
		);

		recorder.scrapeRow = { ...recorder.scrapeRow, status: "completed" };
		recorder.documentRow = null;
		await expect(getScrapeDesignMd("scrape-1", "user-1")).rejects.toThrow(
			"DESIGN.md tidak tersedia untuk proses ini.",
		);

		recorder.documentRow = {
			id: "doc-1",
			scrapeId: "scrape-1",
			designMd: "  ",
		};
		await expect(getScrapeDesignMd("scrape-1", "user-1")).rejects.toThrow(
			"DESIGN.md tidak tersedia untuk proses ini.",
		);
	});

	it("lists only completed design scrapes owned by the caller", async () => {
		recorder.listRows = [
			{
				id: "scrape-1",
				sourceUrl: "https://example.com",
				domain: "example.com",
				title: "Example",
				mode: "design",
				metadata: null,
				status: "completed",
				createdAt: new Date(),
			},
		];
		const sources = await listScrapeDesignSources("user-3");
		// The count and the page query are both owner-scoped and both filtered to
		// completed design runs, so neither can leak another tenant's scrape.
		expect(eqValues("scrapes.user_id")).toEqual(["user-3", "user-3"]);
		expect(eqValues("scrapes.mode")).toEqual(["design", "design"]);
		expect(eqValues("scrapes.status")).toEqual(["completed", "completed"]);
		expect(recorder.listQuery?.limit).toBe(SCRAPE_DESIGN_SOURCE_LIMIT);
		expect(sources).toEqual([
			{
				id: "scrape-1",
				title: "Example",
				domain: "example.com",
				sourceUrl: "https://example.com",
			},
		]);
	});
});
