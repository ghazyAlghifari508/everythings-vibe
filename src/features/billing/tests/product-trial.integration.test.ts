import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import {
	applyMigrations,
	createIsolatedDatabase,
	ISOLATED_ADMIN_URL,
} from "./support/isolated-credit-db";

const fixture = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/db", () => ({ db: fixture.db }));
vi.mock("@/lib/rate-limit", () => ({
	checkRateLimit: async () => ({ allowed: true }),
}));

describe.skipIf(!ISOLATED_ADMIN_URL)("product trial lifecycle", () => {
	let db: ReturnType<typeof drizzle<typeof schema>>;
	let pool: Pool;
	let drop: () => Promise<void>;
	beforeAll(async () => {
		if (!ISOLATED_ADMIN_URL) throw new Error("Expected isolated admin URL");
		const isolated = await createIsolatedDatabase(ISOLATED_ADMIN_URL);
		drop = isolated.drop;
		await applyMigrations(isolated.url, {});
		pool = new Pool({ connectionString: isolated.url });
		db = drizzle(pool, { schema });
		fixture.db = db;
	}, 120_000);
	afterAll(async () => {
		await pool?.end();
		await drop?.();
	});

	async function account(plan = "free") {
		const id = crypto.randomUUID();
		await db.insert(schema.users).values({ id, email: `${id}@example.test` });
		await db
			.insert(schema.subscriptions)
			.values({ id, userId: id, plan, credits: 2 });
		return id;
	}

	it("reserves only one Studio job concurrently, replays it, and preserves the independent Scrape entitlement", async () => {
		const { createStudioProjectWithJob } = await import(
			"@/features/studio/services/studio-project-enqueue"
		);
		const { createScrape } = await import(
			"@/features/scrape/services/scrape-create-service"
		);
		const { settleProductTrial } = await import(
			"../services/product-trial-settlement.server"
		);
		const { deleteStudioProject } = await import(
			"@/features/studio/services/studio-project-lifecycle"
		);
		const userId = await account();
		const start = (key: string) =>
			createStudioProjectWithJob(
				userId,
				{ prompt: "Design a dashboard for a library" },
				undefined,
				key,
			);
		const [a, b] = await Promise.allSettled([
			start("trial-first-request"),
			start("trial-other-request"),
		]);
		const winner = a.status === "fulfilled" ? a : b;
		const loser = a.status === "rejected" ? a : b;
		if (winner.status !== "fulfilled" || loser.status !== "rejected")
			throw new Error("Expected one winner and one loser");
		expect(loser.reason).toMatchObject({ code: "TRIAL_RESERVED" });
		expect(winner.value.frames).toHaveLength(1);
		const key =
			a.status === "fulfilled" ? "trial-first-request" : "trial-other-request";
		expect((await start(key)).job.id).toBe(winner.value.job.id);
		await db.transaction((tx) =>
			settleProductTrial(tx, "studio", userId, winner.value.job.id, 1),
		);
		await expect(start("trial-third-request")).rejects.toMatchObject({
			code: "TRIAL_EXHAUSTED",
		});
		await expect(
			deleteStudioProject(winner.value.project.id, await account()),
		).rejects.toMatchObject({ code: "WEBSITE_BLOCKED" });
		await deleteStudioProject(winner.value.project.id, userId);
		await db
			.update(schema.subscriptions)
			.set({ allocationEpoch: 2, plan: "pro" })
			.where(eq(schema.subscriptions.userId, userId));
		expect((await start("paid-legacy-request")).frames).toHaveLength(3);
		await db
			.update(schema.subscriptions)
			.set({ allocationEpoch: 3, plan: "free" })
			.where(eq(schema.subscriptions.userId, userId));
		await expect(start("trial-fourth-request")).rejects.toMatchObject({
			code: "TRIAL_EXHAUSTED",
		});
		const scrape = await createScrape(userId, "https://example.com/", "crawl");
		expect(scrape.request).toMatchObject({
			mode: "crawl",
			settings: { maxPages: 3 },
		});
		const [balance] = await db
			.select()
			.from(schema.subscriptions)
			.where(eq(schema.subscriptions.userId, userId));
		expect(balance).toMatchObject({
			credits: 2,
			creditsUsed: 0,
			creditsReserved: 0,
		});
	});

	it("keeps the Scrape hold across automatic retries, releases zero-unit work, and retains partial cancellation evidence", async () => {
		const { createScrape } = await import(
			"@/features/scrape/services/scrape-create-service"
		);
		const { deleteOwnedScrapes } = await import(
			"@/features/scrape/services/scrape-history-delete-service"
		);
		const { claimScrapeJob, releaseScrapeClaim, SCRAPE_JOB_MAX_ATTEMPTS } =
			await import("@/features/scrape/services/scrape-job-service");
		const userId = await account();
		const url = "https://example.com/";
		const first = await createScrape(
			userId,
			url,
			"crawl",
			undefined,
			"scrape-first-request",
		);
		const trial = () =>
			db
				.select()
				.from(schema.productTrials)
				.where(
					and(
						eq(schema.productTrials.userId, userId),
						eq(schema.productTrials.jobId, first.id),
					),
				);
		await db
			.update(schema.scrapes)
			.set({ leaseExpiresAt: null, createdAt: new Date(2000, 0, 1) })
			.where(eq(schema.scrapes.id, first.id));
		for (let i = 0; i < SCRAPE_JOB_MAX_ATTEMPTS; i++) {
			const claim = await claimScrapeJob();
			if (!claim) throw new Error("Expected worker claim");
			expect(claim.id).toBe(first.id);
			await releaseScrapeClaim(claim);
			expect(await trial()).toMatchObject([
				{ state: "reserved", completedUnits: 0 },
			]);
		}
		await claimScrapeJob();
		expect(await trial()).toMatchObject([
			{ state: "released", completedUnits: 0 },
		]);
		expect(
			(
				await createScrape(
					userId,
					url,
					"crawl",
					undefined,
					"scrape-first-request",
				)
			).id,
		).toBe(first.id);
		const second = await createScrape(
			userId,
			url,
			"crawl",
			undefined,
			"scrape-next-request",
		);
		await db.insert(schema.scrapePages).values({
			scrapeId: second.id,
			userId,
			url,
			depth: 0,
			status: "completed",
		});
		expect(await deleteOwnedScrapes([second.id], userId)).toMatchObject({
			deleted: 1,
		});
		await expect(createScrape(userId, url, "crawl")).rejects.toMatchObject({
			code: "TRIAL_EXHAUSTED",
		});
		const [evidence] = await db
			.select()
			.from(schema.productTrials)
			.where(eq(schema.productTrials.jobId, second.id));
		expect(evidence).toMatchObject({ state: "consumed", completedUnits: 1 });
	});

	it("preserves historical reads, manual Studio changes, and billing exemptions", async () => {
		const { getStudioProject } = await import(
			"@/features/studio/services/studio-project-query"
		);
		const { renameStudioProject } = await import(
			"@/features/studio/services/studio-project-lifecycle"
		);
		const { getScrapeById } = await import(
			"@/features/scrape/services/scrape-detail-service"
		);
		const { createScrape } = await import(
			"@/features/scrape/services/scrape-create-service"
		);
		const userId = await account();
		const [project] = await db
			.insert(schema.studioProjects)
			.values({ userId, title: "Historical Studio" })
			.returning();
		const url = "https://example.com/";
		const [scrape] = await db
			.insert(schema.scrapes)
			.values({
				userId,
				sourceUrl: url,
				domain: "example.com",
				mode: "html",
				status: "completed",
				html: "<main>Historical</main>",
			})
			.returning();
		await renameStudioProject(project.id, userId, "Renamed manually");
		expect(await getStudioProject(project.id, userId)).toMatchObject({
			title: "Renamed manually",
		});
		expect(await getScrapeById(scrape.id, userId)).toMatchObject({
			html: scrape.html,
		});
		expect(
			await db
				.select()
				.from(schema.productTrials)
				.where(eq(schema.productTrials.userId, userId)),
		).toEqual([]);
		await db
			.update(schema.users)
			.set({ billingExempt: true })
			.where(eq(schema.users.id, userId));
		const result = await createScrape(userId, url, "crawl");
		expect(result.request).toMatchObject({ settings: { maxPages: 10 } });
		expect(
			await db
				.select()
				.from(schema.productTrials)
				.where(eq(schema.productTrials.userId, userId)),
		).toEqual([]);
	});
});
