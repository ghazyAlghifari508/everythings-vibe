import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import {
	createTariffRegistry,
	type Tariff,
} from "@/features/billing/services/pricing-policy";
import {
	applyMigrations,
	createIsolatedDatabase,
	ISOLATED_ADMIN_URL,
} from "@/features/billing/tests/support/isolated-credit-db";
import { scrapeRequestSchema } from "../types/scrape-contract";

const fixture = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/db", () => ({ db: fixture.db }));
vi.mock("@/lib/rate-limit", () => ({
	checkRateLimit: async () => ({ allowed: true }),
}));
vi.mock(import("../services/scrape-credit-policy"), async (original) => {
	const policy = await original();
	const version = "synthetic-crawl-integration";
	const tariff: Tariff = {
		mode: "adaptive",
		version,
		billingUnit: "page",
		creditsPerUnit: 2,
		minimumCredits: 2,
		maximumCredits: 100,
		rounding: "ceil",
		settlement: {
			success: "completed_units",
			partial: "completed_units",
			failed: "no_charge",
			cancelled: "no_charge",
		},
	};
	return {
		...policy,
		SCRAPE_TARIFFS: createTariffRegistry({
			id: version,
			tariffs: { "scrape.crawl": { [version]: tariff } },
			activeVersions: { "scrape.crawl": version },
		}),
	};
});

describe.skipIf(!ISOLATED_ADMIN_URL)("Scrape shared ledger lifecycle", () => {
	let db: ReturnType<typeof drizzle<typeof schema>>;
	let pool: Pool;
	let drop: () => Promise<void>;
	beforeAll(async () => {
		if (!ISOLATED_ADMIN_URL) throw new Error("Isolated test URL required");
		const isolated = await createIsolatedDatabase(ISOLATED_ADMIN_URL);
		drop = isolated.drop;
		await applyMigrations(isolated.url, {});
		pool = new Pool({ connectionString: isolated.url });
		db = drizzle(pool, { schema });
		fixture.db = db;
		vi.stubEnv("SCRAPE_CREDIT_CHARGING_ENABLED", "true");
	});
	afterAll(async () => {
		vi.unstubAllEnvs();
		await pool?.end();
		await drop?.();
	});

	it("holds shared credits once, recovers the same job, then settles completed pages only", async () => {
		const { createScrape } = await import("../services/scrape-create-service");
		const { claimScrapeJob, createScrapeJobUpdate, releaseScrapeClaim } =
			await import("../services/scrape-job-service");
		const { getScrapeById } = await import("../services/scrape-detail-service");
		const { deleteOwnedScrapes } = await import(
			"../services/scrape-history-delete-service"
		);
		const userId = crypto.randomUUID();
		await db
			.insert(schema.users)
			.values({ id: userId, email: `${userId}@example.test` });
		await db.insert(schema.subscriptions).values({
			id: userId,
			userId,
			plan: "pro",
			credits: 8,
			currentPeriodEnd: new Date(Date.now() + 60_000),
		});
		const request = scrapeRequestSchema.parse({
			url: "https://example.test/",
			mode: "crawl",
			settings: { maxPages: 4 },
		});
		const start = (key: string, url = request.url) =>
			createScrape(userId, url, "crawl", { ...request, url }, key);
		const [first, second] = await Promise.all([
			start("synthetic-first-key"),
			start("synthetic-first-key"),
		]);
		expect(second.id).toBe(first.id);
		await expect(
			start("synthetic-other-key", "https://other.example.test/"),
		).rejects.toMatchObject({ code: "INSUFFICIENT_CREDITS" });
		const original = await claimScrapeJob();
		if (!original) throw new Error("Missing worker lease");
		await releaseScrapeClaim(original);
		const reclaimed = await claimScrapeJob();
		if (!reclaimed) throw new Error("Missing recovered lease");
		expect(reclaimed.id).toBe(first.id);
		expect(reclaimed.token).not.toBe(original.token);
		await db.insert(schema.scrapePages).values([
			{
				userId,
				scrapeId: first.id,
				url: request.url,
				depth: 0,
				status: "completed",
			},
			{
				userId,
				scrapeId: first.id,
				url: `${request.url}failed`,
				depth: 1,
				status: "failed",
			},
		]);
		await createScrapeJobUpdate(first, reclaimed)({ status: "completed" });
		expect((await getScrapeById(first.id, userId)).pages).toHaveLength(2);
		expect((await getScrapeById(first.id, userId)).pages).toHaveLength(2);
		const balance = async () =>
			(
				await db
					.select()
					.from(schema.subscriptions)
					.where(eq(schema.subscriptions.userId, userId))
			)[0];
		expect(await balance()).toMatchObject({
			creditsUsed: 2,
			creditsReserved: 0,
		});
		const queued = await createScrape(
			userId,
			request.url,
			"crawl",
			scrapeRequestSchema.parse({ ...request, settings: { maxPages: 1 } }),
			"synthetic-cancel-key",
		);
		expect(await balance()).toMatchObject({
			creditsUsed: 2,
			creditsReserved: 2,
		});
		await deleteOwnedScrapes([first.id, queued.id], userId);
		await expect(getScrapeById(first.id, userId)).rejects.toMatchObject({
			code: "WEBSITE_BLOCKED",
		});
		expect(await balance()).toMatchObject({
			creditsUsed: 2,
			creditsReserved: 0,
		});
		const [operation] = await db
			.select()
			.from(schema.creditOperations)
			.where(
				and(
					eq(schema.creditOperations.userId, userId),
					eq(schema.creditOperations.scrapeId, queued.id),
				),
			);
		expect(operation).toMatchObject({ state: "released", reservedCredits: 0 });
	});
});
