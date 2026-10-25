import { sql } from "drizzle-orm";
import {
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { projects, users } from "./schema";

export const codebaseGenerationStatusValues = [
	"queued",
	"running",
	"completed",
	"failed",
	"cancelled",
] as const;
export type CodebaseGenerationStatus =
	(typeof codebaseGenerationStatusValues)[number];

export const codebaseGenerationStageValues = [
	"questions",
	"feature",
	"prd",
	"ac",
	"task",
] as const;
export type CodebaseGenerationStage =
	(typeof codebaseGenerationStageValues)[number];

export const codebaseGenerationOperations = pgTable(
	"codebase_generation_operations",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		projectId: text("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		stage: text("stage").notNull().$type<CodebaseGenerationStage>(),
		status: text("status")
			.notNull()
			.default("queued")
			.$type<CodebaseGenerationStatus>(),
		identityHash: text("identity_hash").notNull(),
		input: jsonb("input").notNull().$type<Record<string, unknown>>(),
		source: jsonb("source").$type<{
			codebaseId: string;
			snapshotId: string;
			analysisId?: string;
			inputRevision: string;
		}>(),
		attempt: integer("attempt").notNull().default(0),
		maxAttempts: integer("max_attempts").notNull().default(3),
		jobToken: text("job_token"),
		claimedBy: text("claimed_by"),
		leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
		heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }),
		baselineArtifactId: text("baseline_artifact_id"),
		artifactId: text("artifact_id"),
		result: jsonb("result").$type<Record<string, unknown>>(),
		error: text("error"),
		errorCode: text("error_code"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		startedAt: timestamp("started_at", { withTimezone: true }),
		finishedAt: timestamp("finished_at", { withTimezone: true }),
	},
	(t) => [
		uniqueIndex("codebase_gen_ops_active_stage_idx")
			.on(t.projectId, t.stage)
			.where(sql`status IN ('queued', 'running')`),
		uniqueIndex("codebase_gen_ops_identity_hash_idx").on(t.identityHash),
		index("codebase_gen_ops_user_project_idx").on(t.userId, t.projectId),
		index("codebase_gen_ops_project_status_idx").on(t.projectId, t.status),
		index("codebase_gen_ops_claim_idx").on(t.status, t.leaseExpiresAt),
	],
);

export type CodebaseGenerationOperationRow =
	typeof codebaseGenerationOperations.$inferSelect;
export type InsertCodebaseGenerationOperationRow =
	typeof codebaseGenerationOperations.$inferInsert;
