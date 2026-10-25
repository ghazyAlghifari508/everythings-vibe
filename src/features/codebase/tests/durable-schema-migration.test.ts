import { readFileSync } from "node:fs";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { codebaseGenerationOperations } from "@/db/schema";

describe("codebase_generation_operations schema", () => {
	it("declares the expected columns and defaults", () => {
		const config = getTableConfig(codebaseGenerationOperations);
		expect(config.name).toBe("codebase_generation_operations");

		const columnNames = config.columns.map((c) => c.name).sort();
		expect(columnNames).toEqual(
			[
				"id",
				"user_id",
				"project_id",
				"stage",
				"status",
				"identity_hash",
				"input",
				"source",
				"attempt",
				"max_attempts",
				"job_token",
				"claimed_by",
				"lease_expires_at",
				"heartbeat_at",
				"artifact_id",
				"result",
				"error",
				"error_code",
				"created_at",
				"updated_at",
				"started_at",
				"finished_at",
			].sort(),
		);

		const statusCol = config.columns.find((c) => c.name === "status");
		expect(statusCol?.notNull).toBe(true);
		expect(statusCol?.default).toBe("queued");

		const attemptCol = config.columns.find((c) => c.name === "attempt");
		expect(attemptCol?.notNull).toBe(true);
		expect(attemptCol?.default).toBe(0);

		const maxAttemptsCol = config.columns.find(
			(c) => c.name === "max_attempts",
		);
		expect(maxAttemptsCol?.notNull).toBe(true);
		expect(maxAttemptsCol?.default).toBe(3);
	});

	it("configures foreign key cascades to users and projects", () => {
		const config = getTableConfig(codebaseGenerationOperations);
		expect(config.foreignKeys).toHaveLength(2);

		const userFk = config.foreignKeys.find((fk) =>
			fk.reference().columns.some((c) => c.name === "user_id"),
		);
		expect(userFk).toBeDefined();
		expect(userFk?.onDelete).toBe("cascade");

		const projectFk = config.foreignKeys.find((fk) =>
			fk.reference().columns.some((c) => c.name === "project_id"),
		);
		expect(projectFk).toBeDefined();
		expect(projectFk?.onDelete).toBe("cascade");
	});

	it("has active stage unique index and query acceleration indexes", () => {
		const config = getTableConfig(codebaseGenerationOperations);
		const indexNames = config.indexes.map((i) => i.config.name);

		expect(indexNames).toContain("codebase_gen_ops_active_stage_idx");
		expect(indexNames).toContain("codebase_gen_ops_identity_hash_idx");
		expect(indexNames).toContain("codebase_gen_ops_user_project_idx");
		expect(indexNames).toContain("codebase_gen_ops_project_status_idx");
		expect(indexNames).toContain("codebase_gen_ops_claim_idx");

		const activeIndex = config.indexes.find(
			(i) => i.config.name === "codebase_gen_ops_active_stage_idx",
		);
		expect(activeIndex?.config.unique).toBe(true);
	});
});

describe("codebase generation migration file and journal", () => {
	it("is registered in drizzle journal with correct sequence", () => {
		const journal = JSON.parse(
			readFileSync("drizzle/meta/_journal.json", "utf8"),
		) as {
			entries: Array<{ idx: number; when: number; tag: string }>;
		};

		const entry = journal.entries.find(
			(e) => e.tag === "0039_chunky_mariko_yashida",
		);
		expect(entry).toBeDefined();
		expect(entry?.idx).toBe(39);

		const previous = journal.entries.find(
			(e) => e.tag === "0038_clammy_darkstar",
		);
		expect(entry?.when).toBeGreaterThan(previous?.when ?? 0);
	});

	it("includes SQL definitions with partial unique index for active stages", () => {
		const sql = readFileSync(
			"drizzle/0039_chunky_mariko_yashida.sql",
			"utf8",
		).replace(/\r\n/g, "\n");

		expect(sql).toContain('CREATE TABLE "codebase_generation_operations"');
		expect(sql).toContain(
			'CREATE UNIQUE INDEX "codebase_gen_ops_active_stage_idx" ON "codebase_generation_operations" USING btree ("project_id","stage") WHERE status IN (\'queued\', \'running\');',
		);
		expect(sql).toContain(
			'CREATE INDEX "codebase_gen_ops_claim_idx" ON "codebase_generation_operations" USING btree ("status","lease_expires_at");',
		);
	});

	it("has corresponding snapshot file linked to previous migration", () => {
		const snapshot39 = JSON.parse(
			readFileSync("drizzle/meta/0039_snapshot.json", "utf8"),
		) as {
			id: string;
			prevId: string;
			tables: Record<string, unknown>;
		};

		const snapshot38 = JSON.parse(
			readFileSync("drizzle/meta/0038_snapshot.json", "utf8"),
		) as {
			id: string;
		};

		expect(snapshot39.prevId).toBe(snapshot38.id);
		expect(
			snapshot39.tables["public.codebase_generation_operations"],
		).toBeDefined();
	});
});
