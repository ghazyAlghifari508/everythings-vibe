import { readFile } from "node:fs/promises";
import { and, eq } from "drizzle-orm";
import { Pool } from "pg";
import { expect, it } from "vitest";
import { scrapeImageAssets, scrapeImages, scrapes, users } from "@/db/schema";
import {
	IMAGE_STORAGE_LIMITS,
	persistScrapeImage,
	readStoredScrapeImage,
} from "./scrape-image-storage";

it("stores private bytes once under concurrent retries, enforces lease/ownership, and cascades deletion", async () => {
	const pool = new Pool({ connectionString: process.env.DATABASE_URL });
	const schema = `storage_test_${crypto.randomUUID().replaceAll("-", "")}`;
	const connectionString = process.env.DATABASE_URL;
	await pool.query(`CREATE SCHEMA ${schema}`);
	for (const table of ["users", "scrapes", "scrape_images"]) {
		await pool.query(
			`CREATE TABLE ${schema}.${table} (LIKE public.${table} INCLUDING ALL)`,
		);
	}
	await pool.query(
		`ALTER TABLE ${schema}.scrapes ADD FOREIGN KEY (user_id) REFERENCES ${schema}.users(id) ON DELETE CASCADE; ALTER TABLE ${schema}.scrape_images ADD FOREIGN KEY (scrape_id) REFERENCES ${schema}.scrapes(id) ON DELETE CASCADE`,
	);
	const migration = await readFile("drizzle/0038_clammy_darkstar.sql", "utf8");
	const client = await pool.connect();
	try {
		await client.query(`SET search_path TO ${schema}`);
		await client.query(
			`ALTER TABLE scrape_images DROP COLUMN IF EXISTS asset_id, DROP COLUMN IF EXISTS failure_code, DROP COLUMN IF EXISTS http_status`,
		);
		await client.query(migration.replaceAll('"public".', `"${schema}".`));
	} finally {
		client.release();
	}
	const url = new URL(connectionString ?? "");
	url.searchParams.set("options", `-c search_path=${schema}`);
	process.env.DATABASE_URL = url.href;
	const { db } = await import("@/db");
	const userId = crypto.randomUUID();
	const token = crypto.randomUUID();
	await db
		.insert(users)
		.values({ id: userId, email: `${userId}@example.test` });
	try {
		const [scrape] = await db
			.insert(scrapes)
			.values({
				userId,
				sourceUrl: "https://assets.example.test",
				domain: "assets.example.test",
				mode: "images",
				jobToken: token,
				leaseExpiresAt: new Date(Date.now() + 60000),
			})
			.returning();
		const claim = { id: scrape.id, userId, token };
		const asset = {
			body: Buffer.from(
				"89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000b49444154789c636000020000050001a5f645400000000049454e44ae426082",
				"hex",
			),
			contentType: "image/png",
		};
		const image = {
			url: "https://assets.example.test/a.png",
			pageUrl: scrape.sourceUrl,
			evidence: { sources: ["img"], alt: null },
			status: "completed" as const,
		};
		const results = await Promise.all([
			persistScrapeImage(claim, image, asset),
			persistScrapeImage(
				claim,
				{ ...image, url: "https://assets.example.test/b.png" },
				asset,
			),
		]);
		expect(results[0].assetId).toBe(results[1].assetId);
		expect(
			await db
				.select({ id: scrapeImageAssets.id })
				.from(scrapeImageAssets)
				.where(eq(scrapeImageAssets.userId, userId)),
		).toHaveLength(1);
		expect(
			await readStoredScrapeImage(userId, scrape.id, results[0].id),
		).toEqual({
			body: asset.body,
			mimeType: "image/png",
			byteLength: asset.body.length,
		});
		expect(
			await readStoredScrapeImage("different-owner", scrape.id, results[0].id),
		).toBeNull();
		expect(
			await readStoredScrapeImage(userId, "different-scrape", results[0].id),
		).toBeNull();
		const retry = await persistScrapeImage(claim, {
			...image,
			status: "failed",
			error: "Transport unavailable",
		});
		expect(retry.status).toBe("completed");
		expect(retry.assetId).toBe(results[0].assetId);
		const ownerLimit = IMAGE_STORAGE_LIMITS.ownerBytes;
		IMAGE_STORAGE_LIMITS.ownerBytes = asset.body.length;
		try {
			await expect(
				persistScrapeImage(
					claim,
					{ ...image, url: "https://assets.example.test/c.gif" },
					{
						body: Buffer.from(
							"47494638396101000100800000000000ffffff21f90401000000002c00000000010001000002024401003b",
							"hex",
						),
						contentType: "image/gif",
					},
				),
			).rejects.toMatchObject({ assetCode: "OWNER_STORAGE_QUOTA" });
			expect(
				await db
					.select()
					.from(scrapeImageAssets)
					.where(eq(scrapeImageAssets.userId, userId)),
			).toHaveLength(1);
		} finally {
			IMAGE_STORAGE_LIMITS.ownerBytes = ownerLimit;
		}
		await expect(
			persistScrapeImage({ ...claim, token: "stale-token" }, image, asset),
		).rejects.toThrow();
		await db
			.update(scrapes)
			.set({ leaseExpiresAt: new Date(0) })
			.where(and(eq(scrapes.id, scrape.id), eq(scrapes.userId, userId)));
		await expect(persistScrapeImage(claim, image, asset)).rejects.toThrow();
		await db
			.delete(scrapes)
			.where(and(eq(scrapes.id, scrape.id), eq(scrapes.userId, userId)));
		expect(
			await db
				.select()
				.from(scrapeImageAssets)
				.where(eq(scrapeImageAssets.userId, userId)),
		).toHaveLength(0);
		expect(
			await db
				.select()
				.from(scrapeImages)
				.where(eq(scrapeImages.userId, userId)),
		).toHaveLength(0);
	} finally {
		await db.delete(users).where(eq(users.id, userId));
		await db.$client.end();
		process.env.DATABASE_URL = connectionString;
		await pool.query(`DROP SCHEMA ${schema} CASCADE`);
		await pool.end();
	}
});
