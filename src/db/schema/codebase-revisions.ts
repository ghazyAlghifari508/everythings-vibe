import {
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import { codebaseSnapshots, codebases } from "./codebase";
import { type ProjectFeatureTree, projects } from "./projects";

export const featureVersions = pgTable(
	"feature_versions",
	{
		id: text("id").primaryKey(),
		projectId: text("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		version: integer("version").notNull(),
		content: jsonb("content").$type<ProjectFeatureTree>().notNull(),
		changeSummary: text("change_summary"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		uniqueIndex("feature_versions_project_id_version_idx").on(
			t.projectId,
			t.version,
		),
	],
);

export const taskVersions = pgTable(
	"task_versions",
	{
		id: text("id").primaryKey(),
		projectId: text("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		version: integer("version").notNull(),
		content: jsonb("content").notNull(),
		changeSummary: text("change_summary"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		uniqueIndex("task_versions_project_id_version_idx").on(
			t.projectId,
			t.version,
		),
	],
);

export const codebaseRevisionProposals = pgTable(
	"codebase_revision_proposals",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		projectId: text("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		codebaseId: text("codebase_id")
			.notNull()
			.references(() => codebases.id, { onDelete: "cascade" }),
		snapshotId: text("snapshot_id")
			.notNull()
			.references(() => codebaseSnapshots.id, { onDelete: "cascade" }),
		targetKind: text("target_kind")
			.notNull()
			.$type<"feature" | "prd" | "ac" | "tasks">(),
		baseVersionId: text("base_version_id").notNull(),
		instruction: text("instruction").notNull(),
		baseContent: text("base_content").notNull(),
		proposedContent: text("proposed_content").notNull(),
		impact: jsonb("impact").notNull().$type<{
			prd?: "NEEDS_REVIEW";
			ac?: "NEEDS_REVIEW";
			tasks?: "NEEDS_REVIEW";
			reconciliation?: Array<{
				name: string;
				action:
					| "unchanged"
					| "added"
					| "modified"
					| "superseded"
					| "needs_review";
				reason?: string;
			}>;
			sections?: string[];
		}>(),
		status: text("status")
			.notNull()
			.default("pending")
			.$type<"pending" | "approved" | "rejected">(),
		approvedBy: text("approved_by").references(() => users.id),
		approvedAt: timestamp("approved_at", { withTimezone: true }),
		appliedVersionId: text("applied_version_id"),
		idempotencyKey: text("idempotency_key").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		uniqueIndex("codebase_revision_proposals_user_key_idx").on(
			t.userId,
			t.idempotencyKey,
		),
		index("codebase_revision_proposals_project_idx").on(t.userId, t.projectId),
	],
);
