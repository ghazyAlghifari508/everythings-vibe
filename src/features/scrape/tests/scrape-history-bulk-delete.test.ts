import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	dedupeScrapeIds,
	deleteOwnedScrapes,
	prepareScrapeHistoryBulkSelection,
} from "@/features/scrape/services/scrape-history-delete-service";
import { deleteScrape } from "@/features/scrape/services/scrape-service";
import {
	SCRAPE_HISTORY_BULK_DELETE_MAX_IDS,
	SCRAPE_HISTORY_BULK_SELECTION_MAX_IDS,
} from "@/features/scrape/types/scrape-constants";
import { parseScrapeHistoryBulkDelete } from "@/features/scrape/types/scrape-contract";

interface BulkDeleteStorage {
	wheres: SQL[];
	deleteStatements: number;
	deleted: Array<{ id: string }>;
	countTotal: number;
	idRows: Array<{ id: string }>;
	listLimit: number | null;
}

const storage = vi.hoisted(
	(): BulkDeleteStorage => ({
		wheres: [],
		deleteStatements: 0,
		deleted: [],
		countTotal: 0,
		idRows: [],
		listLimit: null,
	}),
);

vi.mock("@/db", () => {
	const db = {
		select: (shape: Record<string, unknown>) => {
			if (Object.keys(shape).includes("total")) {
				return {
					from: () => ({
						where: async (condition: SQL) => {
							storage.wheres.push(condition);
							return [{ total: storage.countTotal }];
						},
					}),
				};
			}
			return {
				from: () => ({
					where: (condition: SQL) => {
						storage.wheres.push(condition);
						return {
							orderBy: () => ({
								limit: async (limit: number) => {
									storage.listLimit = limit;
									return storage.idRows.slice(0, limit);
								},
							}),
						};
					},
				}),
			};
		},
		delete: () => {
			storage.deleteStatements += 1;
			return {
				where: (condition: SQL) => {
					storage.wheres.push(condition);
					return { returning: async () => storage.deleted };
				},
			};
		},
	};
	return { db };
});

function compiled(value: SQL | undefined): { sql: string; params: unknown[] } {
	if (!value) throw new Error("expected a compiled predicate");
	return new PgDialect().sqlToQuery(value);
}

beforeEach(() => {
	storage.wheres.length = 0;
	storage.deleteStatements = 0;
	storage.deleted = [];
	storage.countTotal = 0;
	storage.idRows = [];
	storage.listLimit = null;
});

describe("dedupeScrapeIds", () => {
	it("keeps one entry per id and drops blank values", () => {
		expect(dedupeScrapeIds(["a", "a", " a ", "", "  "])).toEqual(["a"]);
	});
});

describe("deleteOwnedScrapes", () => {
	it("scopes the delete to the owning user and the requested ids", async () => {
		storage.deleted = [{ id: "a" }, { id: "b" }];
		const result = await deleteOwnedScrapes(["a", "b"], "owner-1");

		expect(result).toEqual({
			deleted: 2,
			skipped: 0,
			deletedIds: ["a", "b"],
		});
		const query = compiled(storage.wheres.at(-1));
		expect(query.sql).toContain('"scrapes"."id"');
		expect(query.sql).toContain('"scrapes"."user_id"');
		expect(query.params).toContain("owner-1");
		expect(query.params).toContain("a");
		expect(query.params).toContain("b");
	});

	it("removes the whole batch in a single statement", async () => {
		storage.deleted = [{ id: "a" }, { id: "b" }, { id: "c" }];
		await deleteOwnedScrapes(["a", "b", "c"], "owner-1");

		expect(storage.deleteStatements).toBe(1);
		const query = compiled(storage.wheres.at(-1));
		expect(query.sql).toContain("in (");
	});

	it("deletes one id by equality so the single-item predicate is unchanged", async () => {
		storage.deleted = [{ id: "a" }];
		await deleteOwnedScrapes(["a"], "owner-1");

		const query = compiled(storage.wheres.at(-1));
		expect(query.sql).not.toContain("in (");
		expect(query.params).toEqual(["a", "owner-1"]);
	});

	it("deduplicates repeated ids before touching the database", async () => {
		storage.deleted = [{ id: "a" }];
		const result = await deleteOwnedScrapes(["a", "a", " a "], "owner-1");

		expect(result).toEqual({
			deleted: 1,
			skipped: 0,
			deletedIds: ["a"],
		});
		const query = compiled(storage.wheres.at(-1));
		expect(query.params.filter((param) => param === "a")).toHaveLength(1);
	});

	it("reports rows that are already gone instead of claiming success", async () => {
		storage.deleted = [];
		const result = await deleteOwnedScrapes(["gone", "also-gone"], "owner-1");

		expect(result).toEqual({
			deleted: 0,
			skipped: 2,
			deletedIds: [],
		});
	});

	it("reports a partial delete honestly", async () => {
		storage.deleted = [{ id: "a" }];
		const result = await deleteOwnedScrapes(["a", "missing"], "owner-1");

		expect(result).toEqual({
			deleted: 1,
			skipped: 1,
			deletedIds: ["a"],
		});
	});

	it("does not filter by status so in-flight jobs keep the one-item semantics", async () => {
		storage.deleted = [{ id: "a" }];
		await deleteOwnedScrapes(["a"], "owner-1");

		const query = compiled(storage.wheres.at(-1));
		expect(query.sql).not.toContain("status");
	});

	it("rejects a batch larger than the allowed bound without deleting anything", async () => {
		const ids = Array.from(
			{ length: SCRAPE_HISTORY_BULK_DELETE_MAX_IDS + 1 },
			(_, index) => `id-${index}`,
		);

		await expect(deleteOwnedScrapes(ids, "owner-1")).rejects.toThrow();
		expect(storage.deleteStatements).toBe(0);
	});

	it("does nothing for an empty request", async () => {
		const result = await deleteOwnedScrapes([], "owner-1");

		expect(result).toEqual({ deleted: 0, skipped: 0, deletedIds: [] });
		expect(storage.deleteStatements).toBe(0);
	});
});

describe("prepareScrapeHistoryBulkSelection", () => {
	it("returns the server-side ids that match the filter", async () => {
		storage.idRows = [{ id: "a" }, { id: "b" }];
		storage.countTotal = 2;

		const selection = await prepareScrapeHistoryBulkSelection("owner-1", {});

		expect(selection).toEqual({ ids: ["a", "b"], total: 2, truncated: false });
	});

	it("scopes the snapshot to the owning user", async () => {
		storage.idRows = [{ id: "a" }];
		storage.countTotal = 1;

		await prepareScrapeHistoryBulkSelection("owner-1", {});

		const query = compiled(storage.wheres.at(-1));
		expect(query.sql).toContain('"scrapes"."user_id"');
		expect(query.params).toContain("owner-1");
	});

	it("does not limit the snapshot to the visible page size", async () => {
		storage.idRows = Array.from({ length: 50 }, (_, index) => ({
			id: `id-${index}`,
		}));
		storage.countTotal = 50;

		await prepareScrapeHistoryBulkSelection("owner-1", {});

		expect(storage.listLimit).toBe(SCRAPE_HISTORY_BULK_SELECTION_MAX_IDS);
		expect(storage.listLimit).not.toBe(10);
	});

	it("reports a truncated snapshot instead of hiding the gap", async () => {
		storage.idRows = [{ id: "a" }];
		storage.countTotal = 120;

		const selection = await prepareScrapeHistoryBulkSelection("owner-1", {});

		expect(selection.total).toBe(120);
		expect(selection.truncated).toBe(true);
		expect(selection.ids).toHaveLength(1);
	});

	it("deletes exactly the prepared snapshot ids rather than re-evaluating the filter", async () => {
		storage.idRows = [{ id: "a" }, { id: "b" }];
		storage.countTotal = 2;
		const selection = await prepareScrapeHistoryBulkSelection("owner-1", {});

		storage.deleted = [{ id: "a" }, { id: "b" }];
		await deleteOwnedScrapes(selection.ids, "owner-1");

		const query = compiled(storage.wheres.at(-1));
		expect(query.params).toContain("a");
		expect(query.params).toContain("b");
		expect(query.sql).not.toContain("ilike");
	});
});

describe("parseScrapeHistoryBulkDelete", () => {
	it("accepts a bounded list of ids", () => {
		expect(parseScrapeHistoryBulkDelete({ ids: ["a", "b"] })).toEqual({
			ids: ["a", "b"],
		});
	});

	it("rejects a request without ids", () => {
		expect(() => parseScrapeHistoryBulkDelete({})).toThrow();
	});

	it("rejects an empty request", () => {
		expect(() => parseScrapeHistoryBulkDelete({ ids: [] })).toThrow();
	});

	it("rejects ids that are not strings", () => {
		expect(() => parseScrapeHistoryBulkDelete({ ids: [1] })).toThrow();
	});

	it("rejects a request larger than the allowed bound", () => {
		const ids = Array.from(
			{ length: SCRAPE_HISTORY_BULK_DELETE_MAX_IDS + 1 },
			(_, index) => `id-${index}`,
		);
		expect(() => parseScrapeHistoryBulkDelete({ ids })).toThrow();
	});
});

describe("deleteScrape ownership", () => {
	it("deletes only the owner's row and confirms", async () => {
		storage.deleted = [{ id: "gone" }];

		await expect(deleteScrape("gone", "owner-1")).resolves.toEqual({
			ok: true,
		});
		const query = compiled(storage.wheres.at(-1));
		expect(query.params).toEqual(["gone", "owner-1"]);
	});

	it("rejects deleting another owner's row as not found", async () => {
		storage.deleted = [];

		await expect(deleteScrape("gone", "owner-2")).rejects.toMatchObject({
			code: "WEBSITE_BLOCKED",
		});
	});
});
