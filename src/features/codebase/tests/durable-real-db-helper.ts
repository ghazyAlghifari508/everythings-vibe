import crypto from "node:crypto";
import { Pool } from "pg";

export async function setupIsolatedTestSchema(): Promise<{
	testSchema: string;
	originalDatabaseUrl: string;
	cleanup: () => Promise<void>;
}> {
	const originalDatabaseUrl = process.env.DATABASE_URL;
	if (!originalDatabaseUrl) {
		throw new Error("DATABASE_URL environment variable is required");
	}
	const testSchema = `test_durable_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
	const masterPool = new Pool({ connectionString: originalDatabaseUrl });

	await masterPool.query(`CREATE SCHEMA ${testSchema}`);
	await masterPool.query(
		`CREATE TABLE ${testSchema}.users (LIKE public.users INCLUDING ALL)`,
	);
	await masterPool.query(
		`CREATE TABLE ${testSchema}.projects (LIKE public.projects INCLUDING ALL)`,
	);
	await masterPool.query(
		`CREATE TABLE ${testSchema}.codebase_generation_operations (LIKE public.codebase_generation_operations INCLUDING ALL)`,
	);

	const url = new URL(originalDatabaseUrl);
	url.searchParams.set("options", `-c search_path=${testSchema},public`);
	process.env.DATABASE_URL = url.toString();

	return {
		testSchema,
		originalDatabaseUrl,
		cleanup: async () => {
			try {
				await masterPool.query(`DROP SCHEMA IF EXISTS ${testSchema} CASCADE`);
			} finally {
				await masterPool.end();
				process.env.DATABASE_URL = originalDatabaseUrl;
			}
		},
	};
}
