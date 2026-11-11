import {
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import type {
	StudioElementEdit,
	StudioElementPreview,
	StudioElementTarget,
} from "@/features/studio/types/studio-element";
import { users } from "./auth";
import { studioFrames, studioProjects } from "./studio";

export const studioElementRevisions = pgTable(
	"studio_element_revisions",
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
		frameId: text("frame_id")
			.notNull()
			.references(() => studioFrames.id, { onDelete: "cascade" }),
		frameName: text("frame_name").notNull(),
		requestId: text("request_id").notNull(),
		requestHash: text("request_hash").notNull(),
		baseRevision: integer("base_revision").notNull(),
		baseHash: text("base_hash").notNull(),
		target: jsonb("target").$type<StudioElementTarget>().notNull(),
		prompt: text("prompt").notNull(),
		edit: jsonb("edit").$type<StudioElementEdit>(),
		status: text("status").$type<StudioElementPreview["status"]>().notNull(),
		beforeHtml: text("before_html").notNull(),
		afterHtml: text("after_html"),
		summary: text("summary").notNull().default(""),
		errorCode: text("error_code"),
		appliedRevision: integer("applied_revision"),
		undoRevision: integer("undo_revision"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(t) => [
		uniqueIndex("studio_element_revisions_request_idx").on(
			t.userId,
			t.projectId,
			t.requestId,
		),
		index("studio_element_revisions_frame_idx").on(
			t.userId,
			t.projectId,
			t.frameId,
		),
	],
);
export type StudioElementRevisionRow =
	typeof studioElementRevisions.$inferSelect;
