import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { afterAll, beforeAll } from "vitest";

const schemaName = `test_analysis_credit_${crypto.randomUUID().replaceAll("-", "")}`;
const originalUrl = process.env.DATABASE_URL;
if (!originalUrl)
	throw new Error(
		"DATABASE_URL is required for isolated billing integration tests",
	);
const admin = new Pool({ connectionString: originalUrl });
export let cleanupPool: Pool | undefined;

beforeAll(async () => {
	await admin.query(`CREATE SCHEMA ${schemaName}`);
	for (const table of [
		"users",
		"projects",
		"subscriptions",
		"codebase_analyses",
		"credit_operations",
		"credit_ledger_entries",
	]) {
		await admin.query(
			`CREATE TABLE ${schemaName}.${table} (LIKE public.${table} INCLUDING ALL)`,
		);
	}
	const url = new URL(originalUrl);
	url.searchParams.set("options", `-c search_path=${schemaName}`);
	process.env.DATABASE_URL = url.toString();
	cleanupPool = new Pool({ connectionString: url.toString() });
	const migration = await readFile(
		"drizzle/0040_initial_analysis_allowance.sql",
		"utf8",
	);
	await cleanupPool.query(migration);
	await cleanupPool.query(migration);
});

afterAll(async () => {
	const { db } = await import("@/db");
	await db.$client.end();
	await cleanupPool?.end();
	await admin.query(`DROP SCHEMA ${schemaName} CASCADE`);
	await admin.end();
	process.env.DATABASE_URL = originalUrl;
});
