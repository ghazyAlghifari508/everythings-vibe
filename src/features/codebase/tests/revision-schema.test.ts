import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import {
	codebaseRevisionProposals,
	featureVersions,
	taskVersions,
} from "@/db/schema";

describe("revision proposal and artifact versioning persistence contract", () => {
	it("stores proposal, base version, approval and idempotency separately", () => {
		const table = getTableConfig(codebaseRevisionProposals);
		expect(table.name).toBe("codebase_revision_proposals");
		const columns = table.columns.map((column) => column.name);
		for (const name of [
			"id",
			"user_id",
			"project_id",
			"codebase_id",
			"snapshot_id",
			"target_kind",
			"base_version_id",
			"instruction",
			"base_content",
			"proposed_content",
			"impact",
			"status",
			"approved_by",
			"approved_at",
			"applied_version_id",
			"idempotency_key",
		])
			expect(columns).toContain(name);
		expect(table.indexes.map((index) => index.config.name)).toContain(
			"codebase_revision_proposals_user_key_idx",
		);
	});

	it("provides dedicated version tables for feature specification and task breakdown", () => {
		const featureConfig = getTableConfig(featureVersions);
		expect(featureConfig.name).toBe("feature_versions");
		expect(featureConfig.columns.map((c) => c.name)).toContain("version");
		expect(featureConfig.columns.map((c) => c.name)).toContain("content");
		expect(featureConfig.indexes.map((i) => i.config.name)).toContain(
			"feature_versions_project_id_version_idx",
		);

		const taskConfig = getTableConfig(taskVersions);
		expect(taskConfig.name).toBe("task_versions");
		expect(taskConfig.columns.map((c) => c.name)).toContain("version");
		expect(taskConfig.columns.map((c) => c.name)).toContain("content");
		expect(taskConfig.indexes.map((i) => i.config.name)).toContain(
			"task_versions_project_id_version_idx",
		);
	});
});
