import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Pool } from "pg";
import { z } from "zod";

/**
 * Disposable-database harness for credit accounting tests. Every run creates
 * its own database on the server named by CREDIT_ISOLATED_TEST_ADMIN_URL and
 * drops it afterwards; DATABASE_URL and real data are never used.
 */
export const ISOLATED_ADMIN_URL = process.env.CREDIT_ISOLATED_TEST_ADMIN_URL;

const MIGRATIONS_DIR = resolve(process.cwd(), "drizzle");

const journalSchema = z.object({
	entries: z.array(z.object({ idx: z.number(), tag: z.string() })),
});

function journal() {
	const raw = readFileSync(
		resolve(MIGRATIONS_DIR, "meta/_journal.json"),
		"utf8",
	);
	return journalSchema.parse(JSON.parse(raw)).entries;
}

export function connectionUrlFor(adminUrl: string, database: string): string {
	const url = new URL(adminUrl);
	url.pathname = `/${database}`;
	return url.toString();
}

export async function createIsolatedDatabase(
	adminUrl: string,
): Promise<{ name: string; url: string; drop: () => Promise<void> }> {
	if (adminUrl === process.env.DATABASE_URL)
		throw new Error("Isolated test database must differ from DATABASE_URL");
	const name = `credit_iso_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
	const admin = new Pool({ connectionString: adminUrl });
	await admin.query(`CREATE DATABASE ${name}`);
	await admin.end();
	return {
		name,
		url: connectionUrlFor(adminUrl, name),
		drop: async () => {
			const cleanup = new Pool({ connectionString: adminUrl });
			await cleanup.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
			await cleanup.end();
		},
	};
}

/** Applies journal migrations whose tag sorts <= `through` (inclusive). */
export async function applyMigrations(
	url: string,
	range: { after?: string; through?: string },
): Promise<string[]> {
	const pool = new Pool({ connectionString: url });
	const applied: string[] = [];
	try {
		for (const entry of journal()) {
			if (range.after && entry.tag <= range.after) continue;
			if (range.through && entry.tag > range.through) break;
			const sqlText = readFileSync(
				resolve(MIGRATIONS_DIR, `${entry.tag}.sql`),
				"utf8",
			);
			const client = await pool.connect();
			try {
				await client.query("BEGIN");
				for (const statement of sqlText.split("--> statement-breakpoint"))
					if (statement.trim()) await client.query(statement);
				await client.query("COMMIT");
			} catch (error) {
				await client.query("ROLLBACK");
				throw new Error(`Migration ${entry.tag} failed: ${String(error)}`);
			} finally {
				client.release();
			}
			applied.push(entry.tag);
		}
	} finally {
		await pool.end();
	}
	return applied;
}

export const PRE_UNIVERSAL_MIGRATION = "0044_brainy_sister_grimm";
