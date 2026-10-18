import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ScrapeRow } from "@/db/schema";
import {
	createScrapeJobUpdate,
	SCRAPE_JOB_LEASE_MS,
	scrapeClaimPredicate,
} from "@/features/scrape/services/scrape-job-service";

interface RecordedPatch {
	status?: string;
	metadata?: Record<string, unknown> | null;
	updatedAt?: Date;
}

const storage = vi.hoisted(
	(): {
		patches: RecordedPatch[];
		wheres: SQL[];
		returning: { id: string }[];
	} => ({
		patches: [],
		wheres: [],
		returning: [],
	}),
);

vi.mock("@/db", () => {
	const update = {
		set: (patch: RecordedPatch) => {
			storage.patches.push(patch);
			return update;
		},
		where: (condition: SQL) => {
			storage.wheres.push(condition);
			return update;
		},
		returning: async () => storage.returning,
	};
	return { db: { update: () => update } };
});

const claim = { id: "scrape-1", userId: "owner-1", token: "token-1" };

function row(): ScrapeRow {
	return {
		id: claim.id,
		userId: claim.userId,
		sourceUrl: "https://example.com/",
		domain: "example.com",
		title: null,
		mode: "html",
		status: "queued",
		html: null,
		previewHtml: null,
		metadata: { stage: "queued" },
		request: null,
		jobToken: claim.token,
		leaseExpiresAt: new Date(Date.now() + SCRAPE_JOB_LEASE_MS),
		jobAttempts: 1,
		createdAt: new Date("2026-01-01T00:00:00.000Z"),
		updatedAt: new Date("2026-01-01T00:00:00.000Z"),
	};
}

function compiled(value: SQL | undefined): { sql: string; params: unknown[] } {
	if (!value) throw new Error("expected a compiled predicate");
	return new PgDialect().sqlToQuery(value);
}

beforeEach(() => {
	storage.patches.length = 0;
	storage.wheres.length = 0;
	storage.returning = [{ id: claim.id }];
});

describe("scrapeClaimPredicate", () => {
	it("scopes a job write to the owner, the token and a live lease", () => {
		const query = compiled(scrapeClaimPredicate(claim));
		expect(query.params.slice(0, 3)).toEqual([
			claim.id,
			claim.userId,
			claim.token,
		]);
		expect(query.params).toHaveLength(4);
		for (const column of ["id", "user_id", "job_token", "lease_expires_at"])
			expect(query.sql).toContain(column);
	});
});

describe("createScrapeJobUpdate", () => {
	it("stamps the target stage and merges metadata on a status transition", async () => {
		const update = createScrapeJobUpdate(row(), claim);
		await update({ status: "capturing", metadata: { completedPages: 2 } });

		const patch = storage.patches[0];
		if (!patch?.metadata) throw new Error("no metadata was written");
		expect(patch.status).toBe("capturing");
		expect(patch.metadata).toMatchObject({
			stage: "capturing",
			completedPages: 2,
		});
		expect(typeof patch.metadata.stageStartedAt).toBe("string");
		expect(
			Number.isNaN(Date.parse(String(patch.metadata.stageStartedAt))),
		).toBe(false);
		expect(patch.updatedAt).toBeInstanceOf(Date);
	});

	it("keeps earlier metadata across consecutive stage transitions", async () => {
		const update = createScrapeJobUpdate(row(), claim);
		await update({ status: "capturing", metadata: { completedPages: 2 } });
		await update({ status: "extracting", metadata: { discoveredPages: 5 } });

		expect(storage.patches[1]?.metadata).toMatchObject({
			stage: "extracting",
			completedPages: 2,
			discoveredPages: 5,
		});
	});

	it("does not advance the stage for a metadata-only update", async () => {
		const scrape = row();
		await createScrapeJobUpdate(
			scrape,
			claim,
		)({
			metadata: { ...scrape.metadata, activity: "/next" },
		});

		expect(storage.patches[0]?.status).toBeUndefined();
		expect(storage.patches[0]?.metadata?.stageStartedAt).toBeUndefined();
	});

	it("keeps metadata written without a status when the next stage starts", async () => {
		const scrape = row();
		const update = createScrapeJobUpdate(scrape, claim);
		await update({ metadata: { ...scrape.metadata, activity: "/next" } });
		await update({ status: "extracting" });

		expect(storage.patches[1]?.metadata).toMatchObject({
			stage: "extracting",
			activity: "/next",
		});
	});

	it("scopes every write to the owner and the current token", async () => {
		await createScrapeJobUpdate(row(), claim)({ status: "generating" });

		const query = compiled(storage.wheres[0]);
		expect(query.params.slice(0, 3)).toEqual([
			claim.id,
			claim.userId,
			claim.token,
		]);
		expect(query.sql).toContain("user_id");
	});

	it("fails loudly once the lease was taken over by another worker", async () => {
		storage.returning = [];
		const update = createScrapeJobUpdate(row(), claim);

		await expect(update({ status: "saving" })).rejects.toThrowError(
			expect.objectContaining({ code: "STORAGE_FAILED" }),
		);
	});
});
