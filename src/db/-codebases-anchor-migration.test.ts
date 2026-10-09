import { readFileSync } from "node:fs";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { codebases } from "./schema";

describe("codebases onboardingProjectId schema", () => {
	it("declares nullable onboardingProjectId column on codebases", () => {
		const config = getTableConfig(codebases);
		const column = config.columns.find(
			(c) => c.name === "onboarding_project_id",
		);
		expect(column).toBeDefined();
		expect(column?.notNull).toBe(false);
	});

	it("declares foreign key referencing projects.id with onDelete set null", () => {
		const config = getTableConfig(codebases);
		const foreignKey = config.foreignKeys.find((fk) => {
			const fkConfig = fk.reference();
			const foreignTableConfig = getTableConfig(fkConfig.foreignTable);
			return (
				fkConfig.columns.some((c) => c.name === "onboarding_project_id") &&
				foreignTableConfig.name === "projects"
			);
		});
		expect(foreignKey).toBeDefined();
		expect(foreignKey?.onDelete).toBe("set null");
	});
});

describe("codebase onboarding project migration (0032)", () => {
	const migrationPath = "drizzle/0032_codebase_onboarding_project_id.sql";

	it("adds the column and foreign key constraint", () => {
		const sql = readFileSync(migrationPath, "utf8").replace(/\r\n/g, "\n");
		expect(sql).toContain(
			'ALTER TABLE "codebases" ADD COLUMN "onboarding_project_id" text;',
		);
		expect(sql).toContain(
			'FOREIGN KEY ("onboarding_project_id") REFERENCES "public"."projects"("id") ON DELETE set null',
		);
	});

	it("backfills only existing linked, same-owner, existing_codebase projects with deterministic ordering", () => {
		const sql = readFileSync(migrationPath, "utf8").replace(/\r\n/g, "\n");

		// Must update codebases
		expect(sql).toMatch(/UPDATE\s+"?codebases"?/i);
		// Linked project guard: p.codebase_id = c.id or c.id = p.codebase_id
		expect(sql).toMatch(
			/(?:p\.codebase_id\s*=\s*c\.id|c\.id\s*=\s*p\.codebase_id)/,
		);

		// Same owner guard: p.user_id = c.user_id or c.user_id = p.user_id
		expect(sql).toMatch(
			/(?:p\.user_id\s*=\s*c\.user_id|c\.user_id\s*=\s*p\.user_id)/,
		);

		// Only existing_codebase project_mode
		expect(sql).toContain("project_mode = 'existing_codebase'");

		// Only active projects (not tombstoned)
		expect(sql).toContain("p.deleted_at IS NULL");

		// Deterministic ordering: createdAt ASC NULLS LAST, id ASC
		expect(sql).toMatch(
			/ORDER BY\s+p\.created_at\s+ASC\s+NULLS\s+LAST,\s+p\.id\s+ASC/i,
		);

		// Idempotent: only fills rows where onboarding_project_id IS NULL
		expect(sql).toContain("c.onboarding_project_id IS NULL");
	});

	it("is registered in the Drizzle journal following index and timestamp sequence", () => {
		const journal = JSON.parse(
			readFileSync("drizzle/meta/_journal.json", "utf8"),
		) as { entries: Array<{ idx: number; when: number; tag: string }> };

		const entry = journal.entries.find(
			(candidate) => candidate.tag === "0032_codebase_onboarding_project_id",
		);
		expect(entry).toBeDefined();
		expect(entry?.idx).toBe(32);

		const previous = journal.entries.find(
			(candidate) => candidate.tag === "0031_previous_ultron",
		);
		expect(previous).toBeDefined();
		expect(entry?.when).toBeGreaterThan(previous?.when ?? 0);
	});

	it("ships a snapshot carrying the column and foreign key", () => {
		const snapshot = JSON.parse(
			readFileSync("drizzle/meta/0032_snapshot.json", "utf8"),
		) as {
			id: string;
			prevId: string;
			tables: {
				"public.codebases": {
					columns: Record<
						string,
						{ name: string; type: string; notNull: boolean }
					>;
					foreignKeys: Record<string, { tableTo: string; onDelete: string }>;
				};
			};
		};

		const prevSnapshot = JSON.parse(
			readFileSync("drizzle/meta/0031_snapshot.json", "utf8"),
		) as { id: string };

		expect(snapshot.prevId).toBe(prevSnapshot.id);

		const col =
			snapshot.tables["public.codebases"].columns.onboarding_project_id;
		expect(col).toEqual({
			name: "onboarding_project_id",
			type: "text",
			primaryKey: false,
			notNull: false,
		});

		const fks = Object.values(snapshot.tables["public.codebases"].foreignKeys);
		const fk = fks.find((candidate) => candidate.tableTo === "projects");
		expect(fk).toBeDefined();
		expect(fk?.onDelete).toBe("set null");
	});
});
