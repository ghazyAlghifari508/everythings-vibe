import { readFileSync } from "node:fs";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import {
	codebaseSnapshots,
	codebaseSyncSessions,
	codebases,
	projects,
} from "./schema";

describe("codebases schema", () => {
	it("declares the expected columns", () => {
		const config = getTableConfig(codebases);
		expect(config.name).toBe("codebases");
		const columns = config.columns.map((column) => column.name).sort();
		expect(columns).toEqual(
			[
				"created_at",
				"id",
				"name",
				"name_source",
				"updated_at",
				"user_id",
			].sort(),
		);
	});

	it("defaults name provenance to user so a forgotten writer is never clobbered", () => {
		const config = getTableConfig(codebases);
		const column = config.columns.find((c) => c.name === "name_source");
		expect(column?.notNull).toBe(true);
		expect(column?.hasDefault).toBe(true);
		expect(column?.default).toBe("user");
	});

	it("indexes user_id", () => {
		const config = getTableConfig(codebases);
		expect(config.indexes.map((index) => index.config.name)).toContain(
			"codebases_user_id_idx",
		);
	});

	it("adds a nullable codebase_id to projects", () => {
		const config = getTableConfig(projects);
		const column = config.columns.find((c) => c.name === "codebase_id");
		expect(column).toBeDefined();
		expect(column?.notNull).toBe(false);
	});

	it("adds codebase_id to sync sessions and snapshots", () => {
		for (const table of [codebaseSyncSessions, codebaseSnapshots]) {
			const config = getTableConfig(table);
			expect(config.columns.some((c) => c.name === "codebase_id")).toBe(true);
		}
	});
});

describe("codebase name provenance migration", () => {
	const migration = readFileSync(
		"drizzle/0030_codebase_name_source.sql",
		"utf8",
	).replace(/\r\n/g, "\n");

	it("adds the column with a fail-safe default", () => {
		expect(migration).toContain('ADD COLUMN "name_source" text');
		expect(migration).toContain("DEFAULT 'user' NOT NULL");
	});

	it("auto-names only rows still holding the untouched placeholder", () => {
		// Deterministic and non-guessing: no analysis text, file names,
		// framework, or snapshot content may decide a repository name.
		expect(migration).toContain(
			`UPDATE "codebases"
SET "name_source" = 'auto'
WHERE "name" = 'Repository Lokal';`,
		);
	});

	it("never promotes a row that already carries a user-chosen name", () => {
		const updates = migration.match(/UPDATE "codebases"/g) ?? [];
		expect(updates).toHaveLength(1);
		expect(migration).not.toContain("LIKE");
		expect(migration).not.toContain("ILIKE");
	});

	it("is registered in the Drizzle journal so the migrator actually applies it", () => {
		// Regression: a hand-written .sql file that is missing from the journal is
		// never read by `readMigrationFiles`, so it never runs and the app then
		// fails at runtime with Postgres 42703 on every insert.
		const journal = JSON.parse(
			readFileSync("drizzle/meta/_journal.json", "utf8"),
		) as { entries: Array<{ idx: number; when: number; tag: string }> };
		const tags = journal.entries.map((entry) => entry.tag);
		expect(tags).toContain("0030_codebase_name_source");

		const entry = journal.entries.find(
			(candidate) => candidate.tag === "0030_codebase_name_source",
		);
		const previous = journal.entries.find(
			(candidate) => candidate.tag === "0029_fitur-stage",
		);
		expect(entry?.idx).toBe(previous ? previous.idx + 1 : 30);
		// `migrate` only applies an entry whose `when` is greater than the newest
		// applied `created_at`, so an out-of-order timestamp is silently skipped.
		expect(entry?.when).toBeGreaterThan(previous?.when ?? 0);
	});

	it("ships a snapshot carrying the new column so the next generate is drift-free", () => {
		// `preparePrevSnapshot` diffs against the newest snapshot file, not the
		// journal. Without a 0030 snapshot the next `db:generate` would re-emit
		// this ALTER and the following migrate would fail on a duplicate column.
		const snapshot = JSON.parse(
			readFileSync("drizzle/meta/0030_snapshot.json", "utf8"),
		) as {
			prevId: string;
			tables: {
				"public.codebases": {
					columns: Record<
						string,
						{ name: string; type: string; notNull: boolean; default?: string }
					>;
				};
			};
		};
		const previousSnapshot = JSON.parse(
			readFileSync("drizzle/meta/0029_snapshot.json", "utf8"),
		) as { id: string };
		expect(snapshot.prevId).toBe(previousSnapshot.id);

		const column = snapshot.tables["public.codebases"].columns.name_source;
		expect(column).toEqual({
			name: "name_source",
			type: "text",
			primaryKey: false,
			notNull: true,
			default: "'user'",
		});
	});
});
