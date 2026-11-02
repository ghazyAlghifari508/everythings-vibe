import { createHash } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { expect, it, vi } from "vitest";
import { apiKeys } from "@/db/schema";

// Redirect even escaped dynamic DB imports; DATABASE_URL is never used here.
vi.mock("pg", async (importOriginal) => {
	const original = await importOriginal<typeof import("pg")>();
	return {
		...original,
		Pool: class extends original.Pool {
			constructor() {
				const connectionString = process.env.API_KEY_ISOLATED_TEST_DATABASE_URL;
				if (!connectionString)
					throw new Error("Explicit isolated database required");
				super({
					connectionString,
					options: "-c search_path=credential_concurrency",
				});
			}
		},
	};
});
vi.mock("@tanstack/react-start/server", () => ({
	getRequestHeaders: () => new Headers(),
}));
vi.mock("@/lib/session", () => ({
	requireUser: async () => ({ id: "test-owner" }),
}));

import { cleanupObsoleteApiKeys } from "../services/api-keys.server";
import { createAutoApiKey } from "../services/auto-api-key.server";

it.skipIf(!process.env.API_KEY_ISOLATED_TEST_DATABASE_URL)(
	"issues concurrent credentials without changing active or legacy access",
	async () => {
		const pool = new Pool();
		try {
			await pool.query("CREATE SCHEMA credential_concurrency");
			await pool.query(
				`CREATE TABLE api_keys (id text PRIMARY KEY, user_id text NOT NULL, name text NOT NULL, key text UNIQUE NOT NULL, key_prefix text, scopes text[], last_used_at timestamp, created_at timestamp DEFAULT now(), expires_at timestamp)`,
			);
			const database = drizzle(pool);
			const expiry = new Date(Date.now() + 86_400_000);
			await database.insert(apiKeys).values([
				{
					id: "active",
					userId: "test-owner",
					name: "auto-cli-active",
					key: "active-hash",
					expiresAt: expiry,
				},
				{
					id: "legacy",
					userId: "test-owner",
					name: "auto-cli-legacy",
					key: "legacy-hash",
				},
			]);
			const responses = await Promise.all(
				Array.from({ length: 8 }, () => createAutoApiKey()),
			);
			const payloads = await Promise.all(
				responses.map((response) => response.json()),
			);
			expect(responses.every((response) => response.status === 200)).toBe(true);
			expect(new Set(payloads.map((payload) => payload.rawKey)).size).toBe(8);
			const rows = await database.select().from(apiKeys);
			expect(rows).toHaveLength(10);
			expect(rows.find((row) => row.id === "active")?.expiresAt).toEqual(
				expiry,
			);
			expect(rows.find((row) => row.id === "legacy")?.expiresAt).toBeNull();
			for (const payload of payloads) {
				const hash = createHash("sha256").update(payload.rawKey).digest("hex");
				expect(
					rows.find((row) => row.key === hash)?.expiresAt?.toISOString(),
				).toBe(payload.expiresAt);
			}
			await database.insert(apiKeys).values({
				id: "expired",
				userId: "test-owner",
				name: "auto-cli-expired",
				key: "expired-hash",
				expiresAt: new Date(Date.now() - 60_000),
			});
			const firstCleanup = await cleanupObsoleteApiKeys();
			expect(await firstCleanup.json()).toMatchObject({
				revoked: 1,
				deleted: 1,
			});
			const secondCleanup = await cleanupObsoleteApiKeys();
			expect(await secondCleanup.json()).toMatchObject({
				revoked: 0,
				deleted: 0,
			});
			const remaining = await database.select().from(apiKeys);
			expect(remaining.find((row) => row.id === "active")?.expiresAt).toEqual(
				expiry,
			);
		} finally {
			await pool.query("DROP SCHEMA IF EXISTS credential_concurrency CASCADE");
			await pool.end();
		}
	},
);
