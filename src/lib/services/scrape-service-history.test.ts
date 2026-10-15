import { beforeEach, describe, expect, it, vi } from "vitest";

interface ScrapeHistoryRecorder {
	ops: Array<{ op: string; col?: unknown; value?: unknown; args?: unknown }>;
	listRows: Array<{
		id: string;
		sourceUrl: string;
		domain: string;
		title: string | null;
		mode: string;
		metadata: { mode?: string } | null;
		status: string;
		createdAt: Date;
	}>;
	countTotal: number;
	lastListQuery: {
		where: unknown;
		orderBy: unknown[];
		limit: number;
		offset: number;
	} | null;
	lastCountWhere: unknown;
	deleted: Array<{ id: string }>;
}

const recorder = vi.hoisted((): ScrapeHistoryRecorder => {
	const ops: ScrapeHistoryRecorder["ops"] = [];
	const listRows: ScrapeHistoryRecorder["listRows"] = [];
	const countTotal = 0;
	const lastListQuery: ScrapeHistoryRecorder["lastListQuery"] = null;
	const lastCountWhere: unknown = null;
	const deleted: ScrapeHistoryRecorder["deleted"] = [{ id: "gone" }];
	return { ops, listRows, countTotal, lastListQuery, lastCountWhere, deleted };
});

vi.mock("drizzle-orm", () => ({
	and: (...args: unknown[]) => ({ op: "and", args }),
	asc: (col: unknown) => ({ op: "asc", col }),
	desc: (col: unknown) => ({ op: "desc", col }),
	eq: (col: unknown, value: unknown) => {
		recorder.ops.push({ op: "eq", col, value });
		return { op: "eq", col, value };
	},
	ilike: (col: unknown, value: unknown) => {
		recorder.ops.push({ op: "ilike", col, value });
		return { op: "ilike", col, value };
	},
	or: (...args: unknown[]) => {
		recorder.ops.push({ op: "or", args });
		return { op: "or", args };
	},
	inArray: (col: unknown, values: unknown) => {
		recorder.ops.push({ op: "inArray", col, value: values });
		return { op: "inArray", col, value: values };
	},
	count: () => ({ op: "count" }),
	sql: Object.assign(
		(strings: TemplateStringsArray, ...values: unknown[]) => ({
			op: "sql",
			strings: strings,
			values,
		}),
		{ raw: (v: string) => ({ op: "sql-raw", v }) },
	),
}));

vi.mock("@/db", () => ({
	db: {
		select: (shape: Record<string, unknown>) => {
			if (shape && "total" in shape) {
				return {
					from: () => ({
						where: (cond: unknown) => {
							recorder.lastCountWhere = cond;
							return Promise.resolve([{ total: recorder.countTotal }]);
						},
					}),
				};
			}
			if (shape && "scrapeId" in shape) {
				return {
					from: () => ({
						where: () => Promise.resolve([]),
					}),
				};
			}
			return {
				from: () => ({
					where: (cond: unknown) => ({
						orderBy: (...orderArgs: unknown[]) => ({
							limit: (limit: number) => ({
								offset: (offset: number) => {
									recorder.lastListQuery = {
										where: cond,
										orderBy: orderArgs,
										limit,
										offset,
									};
									return Promise.resolve(recorder.listRows);
								},
							}),
						}),
					}),
				}),
			};
		},
		delete: () => ({
			where: (cond: unknown) => {
				recorder.lastCountWhere = cond;
				return {
					returning: () => Promise.resolve(recorder.deleted),
				};
			},
		}),
	},
}));

vi.mock("@/db/schema", () => ({
	scrapes: {
		id: "scrapes.id",
		userId: "scrapes.user_id",
		sourceUrl: "scrapes.source_url",
		domain: "scrapes.domain",
		title: "scrapes.title",
		mode: "scrapes.mode",
		metadata: "scrapes.metadata",
		status: "scrapes.status",
		createdAt: "scrapes.created_at",
	},
	scrapeImages: {
		scrapeId: "scrape_images.scrape_id",
		userId: "scrape_images.user_id",
		status: "scrape_images.status",
		assetId: "scrape_images.asset_id",
	},
	scrapeDocuments: { scrapeId: "scrape_documents.scrape_id" },
	scrapePages: { id: "scrape_pages.id" },
	users: { id: "users.id" },
}));

import {
	countScrapes,
	deleteScrape,
	listScrapeHistory,
	listScrapes,
	normalizeScrapeHistoryQuery,
} from "./scrape-service";

function hasEq(col: unknown, value: unknown): boolean {
	return recorder.ops.some(
		(o) => o.op === "eq" && o.col === col && o.value === value,
	);
}

beforeEach(() => {
	recorder.ops.length = 0;
	recorder.lastListQuery = null;
	recorder.lastCountWhere = null;
	recorder.listRows = [];
	recorder.countTotal = 0;
	recorder.deleted = [{ id: "gone" }];
});

describe("normalizeScrapeHistoryQuery", () => {
	it("defaults to the newest first page", () => {
		expect(normalizeScrapeHistoryQuery({})).toEqual({
			search: "",
			sort: "newest",
			limit: 10,
			offset: 0,
		});
	});

	it("keeps a combined mode, status, search, and sort filter", () => {
		expect(
			normalizeScrapeHistoryQuery({
				mode: "html",
				status: "failed",
				search: "stitch",
				sort: "oldest",
				limit: 20,
				offset: 20,
			}),
		).toEqual({
			mode: "html",
			status: "failed",
			search: "stitch",
			sort: "oldest",
			limit: 20,
			offset: 20,
		});
	});

	it("clamps pagination and trims search to a literal substring", () => {
		expect(
			normalizeScrapeHistoryQuery({ limit: 999, offset: -5, search: "  x  " }),
		).toMatchObject({ limit: 50, offset: 0, search: "x" });
		expect(
			normalizeScrapeHistoryQuery({ search: "y".repeat(400) }).search,
		).toHaveLength(128);
	});

	it("drops unknown mode and status values instead of querying them", () => {
		expect(normalizeScrapeHistoryQuery({})).toEqual({
			search: "",
			sort: "newest",
			limit: 10,
			offset: 0,
		});
	});
});

describe("listScrapeHistory ownership and filtering", () => {
	it("always scopes list and count to the owner", async () => {
		recorder.countTotal = 0;
		await listScrapeHistory("owner-1", {});
		expect(hasEq("scrapes.user_id", "owner-1")).toBe(true);
		expect(recorder.lastCountWhere).toBeDefined();
		expect(recorder.lastListQuery?.limit).toBe(10);
		expect(recorder.lastListQuery?.offset).toBe(0);
	});

	it("filters by extraction mode across the full dataset", async () => {
		recorder.countTotal = 1;
		recorder.listRows = [
			{
				id: "row-1",
				sourceUrl: "https://example.test/",
				domain: "example.test",
				title: null,
				mode: "html",
				metadata: null,
				status: "completed",
				createdAt: new Date("2026-10-01T00:00:00.000Z"),
			},
		];
		const page = await listScrapeHistory("owner-1", { mode: "html" });
		expect(hasEq("scrapes.mode", "html")).toBe(true);
		expect(page.total).toBe(1);
		expect(page.items[0]?.mode).toBe("html");
	});

	it("maps the failed group to a single failed status", async () => {
		await listScrapeHistory("owner-1", { status: "failed" });
		expect(hasEq("scrapes.status", "failed")).toBe(true);
	});

	it("maps the processing group to every active capture status", async () => {
		await listScrapeHistory("owner-1", { status: "processing" });
		const inArrayOp = recorder.ops.find((o) => o.op === "inArray");
		expect(inArrayOp?.col).toBe("scrapes.status");
		expect(inArrayOp?.value).toEqual([
			"queued",
			"capturing",
			"extracting",
			"generating",
			"saving",
		]);
	});

	it("searches domain, title, and source URL as one literal substring", async () => {
		await listScrapeHistory("owner-1", { search: "100%_match" });
		const orOps = recorder.ops.filter((o) => o.op === "or");
		expect(orOps).toHaveLength(2);
		const patterns = recorder.ops
			.filter((o) => o.op === "ilike")
			.map((o) => o.value);
		expect(patterns).toHaveLength(6);
		for (const pattern of patterns) {
			expect(pattern).toBe("%100\\%\\_match%");
		}
	});

	it("sorts oldest with a deterministic tie-breaker", async () => {
		await listScrapeHistory("owner-1", { sort: "oldest" });
		expect(recorder.lastListQuery?.orderBy).toEqual([
			{ op: "asc", col: "scrapes.created_at" },
			{ op: "asc", col: "scrapes.id" },
		]);
	});

	it("sorts newest with a deterministic tie-breaker", async () => {
		await listScrapeHistory("owner-1", { sort: "newest" });
		expect(recorder.lastListQuery?.orderBy).toEqual([
			{ op: "desc", col: "scrapes.created_at" },
			{ op: "desc", col: "scrapes.id" },
		]);
	});

	it("pages with limit and offset and reports the filtered total", async () => {
		recorder.countTotal = 33;
		const page = await listScrapeHistory("owner-1", {
			limit: 10,
			offset: 20,
		});
		expect(recorder.lastListQuery?.limit).toBe(10);
		expect(recorder.lastListQuery?.offset).toBe(20);
		expect(page.total).toBe(33);
		expect(page.limit).toBe(10);
		expect(page.offset).toBe(20);
	});

	it("returns an empty page with an accurate total past the end", async () => {
		recorder.countTotal = 5;
		recorder.listRows = [];
		const page = await listScrapeHistory("owner-1", { limit: 10, offset: 50 });
		expect(page.items).toEqual([]);
		expect(page.total).toBe(5);
	});
});

describe("countScrapes", () => {
	it("counts the same filtered dataset without rows", async () => {
		recorder.countTotal = 7;
		await expect(
			countScrapes("owner-1", { mode: "crawl", search: "example" }),
		).resolves.toBe(7);
		expect(hasEq("scrapes.user_id", "owner-1")).toBe(true);
		expect(hasEq("scrapes.mode", "crawl")).toBe(true);
	});
});

describe("listScrapes backward compatibility", () => {
	it("returns page items for the legacy limit caller", async () => {
		recorder.countTotal = 2;
		recorder.listRows = [
			{
				id: "row-1",
				sourceUrl: "https://example.test/a",
				domain: "example.test",
				title: null,
				mode: "design",
				metadata: null,
				status: "completed",
				createdAt: new Date("2026-10-02T00:00:00.000Z"),
			},
		];
		const items = await listScrapes("owner-1");
		expect(Array.isArray(items)).toBe(true);
		expect(items).toHaveLength(1);
		expect(recorder.lastListQuery?.limit).toBe(50);
		expect(recorder.lastListQuery?.offset).toBe(0);
	});
});

describe("deleteScrape ownership", () => {
	it("deletes only the owner's row and confirms", async () => {
		await expect(deleteScrape("gone", "owner-1")).resolves.toEqual({
			ok: true,
		});
		expect(hasEq("scrapes.id", "gone")).toBe(true);
		expect(hasEq("scrapes.user_id", "owner-1")).toBe(true);
	});

	it("rejects deleting another owner's row as not found", async () => {
		recorder.deleted = [];
		await expect(deleteScrape("gone", "owner-2")).rejects.toMatchObject({
			code: "WEBSITE_BLOCKED",
		});
	});
});
