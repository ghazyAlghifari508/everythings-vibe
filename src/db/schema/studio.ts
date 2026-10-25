import {
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	unique,
} from "drizzle-orm/pg-core";
import type { StudioDesignBlueprint } from "@/lib/studio-design-blueprint";
import type {
	StudioDesignReferenceMetadata,
	StudioDesignSkillId,
} from "@/lib/studio-generation-options";
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
		designMode: text("design_mode").notNull().default("web"),
		designMd: text("design_md"),
		designSkillId: text("design_skill_id")
			.$type<StudioDesignSkillId>()
			.notNull()
			.default("none"),
		initialPageCount: integer("initial_page_count"),
		designReference:
			jsonb("design_reference").$type<StudioDesignReferenceMetadata>(),
		designBlueprint: jsonb("design_blueprint").$type<StudioDesignBlueprint>(),
		designBlueprintVersion: integer("design_blueprint_version")
			.notNull()
			.default(1),
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
