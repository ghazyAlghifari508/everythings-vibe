import {
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	unique,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import type { StudioDesignReferenceMetadata } from "@/features/studio/services/studio-generation-options";
import type { StudioTitleSource } from "@/features/studio/services/studio-project-title";
import type { StudioDesignBlueprint } from "@/lib/studio-design-blueprint";
import { users } from "./auth";

export const studioProjects = pgTable(
	"studio_projects",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		title: text("title").notNull(),
		// Provenance of `title`: "auto" is a system-chosen name (the provisional
		// title cut from the brief, then the planner's product name), "user" is a
		// name a person typed through the rename dialog. Planning only replaces a
		// title still marked "auto", so a rename is never overwritten. Defaults to
		// "user" so a writer that forgets the column is protected.
		titleSource: text("title_source")
			.$type<StudioTitleSource>()
			.notNull()
			.default("user"),
		designMode: text("design_mode").notNull().default("web"),
		designMd: text("design_md"),
		/**
		 * Legacy: the retired user-selectable design skill. Studio no longer
		 * offers, reads or writes a skill, so this column is inert metadata kept
		 * so historic projects load and export unchanged. Every new row takes the
		 * "none" default. Dropping it would destroy history for no functional
		 * gain; see docs/prompt-design-studio/p7-implementation.md.
		 */
		designSkillId: text("design_skill_id").notNull().default("none"),
		initialPageCount: integer("initial_page_count"),
		designReference:
			jsonb("design_reference").$type<StudioDesignReferenceMetadata>(),
		designBlueprint: jsonb("design_blueprint").$type<StudioDesignBlueprint>(),
		designBlueprintVersion: integer("design_blueprint_version")
			.notNull()
			.default(1),
		/** Legacy companion of `designSkillId`; never written by current code. */
		designSkillVersion: integer("design_skill_version"),
		logoAssetId: text("logo_asset_id"),
		prdContent: text("prd_content"),
		prdFilename: text("prd_filename"),
		prdContentHash: text("prd_content_hash"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(t) => [index("studio_projects_user_id_idx").on(t.userId)],
);

export const studioAssets = pgTable(
	"studio_assets",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		projectId: text("project_id"),
		filename: text("filename").notNull(),
		mimeType: text("mime_type").notNull(),
		byteLength: integer("byte_length").notNull(),
		data: text("data").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(t) => [
		index("studio_assets_user_id_idx").on(t.userId),
		index("studio_assets_project_id_idx").on(t.projectId),
	],
);

export const studioRevisions = pgTable(
	"studio_revisions",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		projectId: text("project_id")
			.notNull()
			.references(() => studioProjects.id, { onDelete: "cascade" }),
		prompt: text("prompt").notNull(),
		htmlCode: text("html_code").notNull(),
		frameId: text("frame_id"),
		frameRevision: integer("frame_revision"),
		jobId: text("job_id"),
		version: integer("version").notNull().default(1),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(t) => [index("studio_revisions_project_id_idx").on(t.projectId)],
);

export const studioJobs = pgTable(
	"studio_jobs",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		projectId: text("project_id")
			.notNull()
			.references(() => studioProjects.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		prompt: text("prompt").notNull(),
		jobType: text("job_type").notNull().default("initial"),
		targetFrameId: text("target_frame_id"),
		status: text("status").notNull().default("queued"),
		error: text("error"),
		claimedBy: text("claimed_by"),
		/** One composer request may create several independently recoverable jobs. */
		requestId: text("request_id"),
		requestHash: text("request_hash"),
		operationIntent: text("operation_intent"),
		operationIndex: integer("operation_index"),
		blueprintJobId: text("blueprint_job_id"),
		dependsOnJobId: text("depends_on_job_id"),
		baseRevision: integer("base_revision"),
		planningCompletedAt: timestamp("planning_completed_at", {
			withTimezone: true,
		}),
		errorCode: text("error_code"),
		attempts: integer("attempts").notNull().default(0),
		claimedAt: timestamp("claimed_at", { withTimezone: true }),
		leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
		startedAt: timestamp("started_at", { withTimezone: true }),
		finishedAt: timestamp("finished_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(t) => [
		index("studio_jobs_project_id_idx").on(t.projectId),
		index("studio_jobs_user_id_idx").on(t.userId),
		index("studio_jobs_status_idx").on(t.status),
		uniqueIndex("studio_jobs_request_part_idx").on(
			t.projectId,
			t.userId,
			t.requestId,
			t.operationIndex,
		),
		index("studio_jobs_dependency_idx").on(t.dependsOnJobId),
	],
);

export const studioFrames = pgTable(
	"studio_frames",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		projectId: text("project_id")
			.notNull()
			.references(() => studioProjects.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		description: text("description"),
		viewport: text("viewport").notNull().default("web"),
		htmlCode: text("html_code"),
		status: text("status").notNull().default("queued"),
		order: integer("order").notNull().default(0),
		error: text("error"),
		attempts: integer("attempts").notNull().default(0),
		visualHash: text("visual_hash"),
		promptHash: text("prompt_hash"),
		/**
		 * Frame provenance and write ownership. `originJobId` is the job that
		 * created the row ("initial" for a planned slot, "add" for a screen the
		 * composer requested), `initialSlot` is the planned position inside that
		 * job, `revision` counts persisted HTML versions and `lastJobId` names the
		 * job that wrote the current revision. Provisional, planned, added,
		 * revised, failed and ready frames are therefore distinguishable from
		 * persisted relationships instead of from names or display order.
		 */
		originJobId: text("origin_job_id"),
		initialSlot: integer("initial_slot"),
		revision: integer("revision").notNull().default(0),
		lastJobId: text("last_job_id"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(t) => [
		index("studio_frames_project_id_idx").on(t.projectId),
		index("studio_frames_order_idx").on(t.order),
		index("studio_frames_project_status_idx").on(t.projectId, t.status),
		unique("studio_frames_project_order_unique").on(t.projectId, t.order),
		index("studio_frames_origin_idx").on(t.originJobId),
		uniqueIndex("studio_frames_initial_slot_idx").on(
			t.originJobId,
			t.initialSlot,
		),
	],
);

export type StudioProjectRow = typeof studioProjects.$inferSelect;
export type InsertStudioProjectRow = typeof studioProjects.$inferInsert;
export type StudioAssetRow = typeof studioAssets.$inferSelect;
export type InsertStudioAssetRow = typeof studioAssets.$inferInsert;
export type StudioRevisionRow = typeof studioRevisions.$inferSelect;
export type InsertStudioRevisionRow = typeof studioRevisions.$inferInsert;
export type StudioJobRow = typeof studioJobs.$inferSelect;
export type InsertStudioJobRow = typeof studioJobs.$inferInsert;
export type StudioFrameRow = typeof studioFrames.$inferSelect;
export type InsertStudioFrameRow = typeof studioFrames.$inferInsert;
