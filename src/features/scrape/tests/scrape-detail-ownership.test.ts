import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ScrapeRow } from "@/db/schema";
import { scrapeDocuments, scrapePages, scrapes } from "@/db/schema";
import { SCRAPE_LIMITS } from "@/features/scrape/types/scrape-contract";

const storage = vi.hoisted(
	(): {
		batches: unknown[][];
		tables: unknown[];
		conditions: SQL[];
	} => ({ batches: [], tables: [], conditions: [] }),
);

vi.mock("@/db", () => {
	function select() {
		const result = Promise.resolve(storage.batches.shift() ?? []);
		const chain = {
			from: (table: unknown) => {
				storage.tables.push(table);
				return chain;
			},
			where: (condition: SQL) => {
				storage.conditions.push(condition);
				return Object.assign(result, {
					limit: () => result,
					orderBy: () => result,
				});
			},
		};
		return chain;
	}
	return { db: { select } };
});

const { getScrapeById } = await import(
	"@/features/scrape/services/scrape-detail-service"
);

const createdAt = new Date(
	Date.now() - SCRAPE_LIMITS.queueHealthAfterMs - 60_000,
);

function row(overrides: Partial<ScrapeRow> = {}): ScrapeRow {
	return {
		id: "scrape-1",
		userId: "owner-1",
		sourceUrl: "https://example.com/",
		domain: "example.com",
		title: "Example",
		mode: "crawl",
		status: "queued",
		html: null,
		previewHtml: null,
		metadata: { stage: "queued" },
		request: null,
		jobToken: null,
		leaseExpiresAt: null,
		jobAttempts: 0,
		createdAt,
		updatedAt: createdAt,
		...overrides,
	};
}

function compiled(index: number): { sql: string; params: unknown[] } {
	const condition = storage.conditions[index];
	if (!condition) throw new Error("expected a query condition");
	return new PgDialect().sqlToQuery(condition);
}

beforeEach(() => {
	storage.batches.length = 0;
	storage.tables.length = 0;
	storage.conditions.length = 0;
});

describe("getScrapeById", () => {
	it("returns the stored document and crawl rows for the owner", async () => {
		storage.batches.push(
			[row()],
			[{ designMd: "# DESIGN" }],
			[{ id: "page-1" }],
		);

		const detail = await getScrapeById("scrape-1", "owner-1");

		expect(detail.id).toBe("scrape-1");
		expect(detail.document?.designMd).toBe("# DESIGN");
		expect(detail.pages).toHaveLength(1);
		expect(detail.images).toEqual([]);
	});

	it("scopes every read to the requested id and its owner", async () => {
		storage.batches.push([row()], [], [{ id: "page-1" }]);

		await getScrapeById("scrape-1", "owner-1");

		expect(storage.tables).toEqual([scrapes, scrapeDocuments, scrapePages]);
		// The parent read must prove ownership before anything is described...
		expect(compiled(0).params).toEqual(["scrape-1", "owner-1"]);
		// ...and the child reads stay owner-scoped where they can be reached
		// directly by another caller.
		expect(compiled(1).params).toEqual(["scrape-1"]);
		expect(compiled(2).params).toEqual(["scrape-1", "owner-1"]);
		expect(compiled(0).sql).toContain("user_id");
		expect(compiled(2).sql).toContain("user_id");
	});

	it("refuses to describe a scrape that is missing or owned by somebody else", async () => {
		storage.batches.push([]);

		await expect(getScrapeById("scrape-1", "other-owner")).rejects.toThrowError(
			expect.objectContaining({ code: "WEBSITE_BLOCKED" }),
		);
	});

	it("reports worker health only while the queue is genuinely stalled", async () => {
		storage.batches.push([row()], [], []);
		const stalled = await getScrapeById("scrape-1", "owner-1");
		expect(typeof stalled.metadata?.workerHealth).toBe("string");

		storage.batches.push([row({ status: "completed" })], [], []);
		const done = await getScrapeById("scrape-1", "owner-1");
		expect(done.metadata?.workerHealth).toBeUndefined();
	});

	it("flags a lease that expired without a terminal stage", async () => {
		storage.batches.push(
			[
				row({
					status: "capturing",
					leaseExpiresAt: new Date(Date.now() - 1_000),
				}),
			],
			[],
			[],
		);

		const stalled = await getScrapeById("scrape-1", "owner-1");

		expect(typeof stalled.metadata?.workerHealth).toBe("string");
	});
});
