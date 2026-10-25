import {
	type AnyPgColumn,
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	unique,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import { codebases } from "./codebase";

export interface SubfeatureNode {
	id: string;
	name: string;
	description: string;
}

export interface FeatureNode {
	id: string;
	name: string;
	phase: number;
	description: string;
	subfeatures: SubfeatureNode[];
}

export interface ProjectFeatureTree {
	productName: string;
	features: FeatureNode[];
	createdAt: string;
}

export const projects = pgTable(
	"projects",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => users.id),
		name: text("name").notNull(),
		description: text("description"),
		status: text("status").default("draft"),
		mode: text("mode").default("ai_auto"),
		// Existing-codebase project mode: "greenfield" | "existing_codebase".
		// Unrelated to `mode` (Ask generation mode "ai_auto" | "manual").
		// Existing projects default to "greenfield" (greenfield flow unchanged).
		projectMode: text("project_mode").notNull().default("greenfield"),
		// Existing-codebase projects belong to a codebase; greenfield stays null.
		// Nullable so greenfield rows and pre-migration rows remain valid.
		codebaseId: text("codebase_id").references(
			(): AnyPgColumn => codebases.id,
			{
				onDelete: "set null",
			},
		),
		language: text("language").default("id"),
		step: text("step").default("prd"), // question, fitur, prd, ac, task
		featuresStatus: text("features_status").default("pending"),
		featureTree: jsonb("feature_tree").$type<ProjectFeatureTree>(),
		acStatus: text("ac_status").default("pending"),
		taskStatus: text("task_status").default("pending"),
		shareToken: text("share_token"),
		lastUrl: text("last_url"),
		// User-facing deletion tombstone. The project row is retained because
		// credit_operations and the append-only credit_ledger_entries reference
		// it (accounting/audit retention), while every product artifact is
		// purged. A non-null value means "deleted": the project is hidden from
		// History and all normal project APIs and routes.
		deletedAt: timestamp("deleted_at"),
		createdAt: timestamp("created_at").defaultNow(),
		updatedAt: timestamp("updated_at").defaultNow(),
	},
	(t) => [
		index("projects_user_id_idx").on(t.userId),
		// Active-project listing (History, admin, lookups) filters on both.
		index("projects_user_id_deleted_at_idx").on(t.userId, t.deletedAt),
		index("projects_codebase_id_idx").on(t.codebaseId),
		unique("projects_user_id_id_unique").on(t.id, t.userId),
	],
);

// Prd Versions
export const prdVersions = pgTable(
	"prd_versions",
	{
		id: text("id").primaryKey(),
		projectId: text("project_id")
			.notNull()
			.references(() => projects.id),
		version: integer("version").notNull(),
		content: text("content").notNull(),
		changeSummary: text("change_summary"),
		createdAt: timestamp("created_at").defaultNow(),
	},
	(t) => [
		// Hot path: prd-service getLatestPrdContent, prd/$id loader
		// WHERE project_id = ? ORDER BY version DESC
		// unique: two concurrent revisions cannot both insert the same version
		uniqueIndex("prd_versions_project_id_version_idx").on(
			t.projectId,
			t.version,
		),
	],
);

// Ac Versions
export const acVersions = pgTable(
	"ac_versions",
	{
		id: text("id").primaryKey(),
		projectId: text("project_id")
			.notNull()
			.references(() => projects.id),
		version: integer("version").notNull(),
		content: text("content").notNull(),
		changeSummary: text("change_summary"),
		createdAt: timestamp("created_at").defaultNow(),
	},
	(t) => [
		// Hot path: ac-service, kanban loader
		// WHERE project_id = ? ORDER BY version DESC
		// unique: two concurrent revisions cannot both insert the same version
		uniqueIndex("ac_versions_project_id_version_idx").on(
			t.projectId,
			t.version,
		),
	],
);

// Conversations
export const conversations = pgTable(
	"conversations",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => users.id),
		projectId: text("project_id").references(() => projects.id),
		title: text("title"),
		createdAt: timestamp("created_at").defaultNow(),
		updatedAt: timestamp("updated_at").defaultNow(),
	},
	(t) => [
		index("conversations_user_id_idx").on(t.userId),
		// Hot path: prd/$id loader
		// WHERE project_id = ? ORDER BY created_at DESC LIMIT 1
		index("conversations_project_id_created_at_idx").on(
			t.projectId,
			t.createdAt,
		),
	],
);

// Messages
export const messages = pgTable(
	"messages",
	{
		id: text("id").primaryKey(),
		conversationId: text("conversation_id")
			.notNull()
			.references(() => conversations.id),
		role: text("role").notNull(), // user, assistant, system
		content: text("content").notNull(),
		metadata: jsonb("metadata"),
		createdAt: timestamp("created_at").defaultNow(),
	},
	(t) => [
		// Hot path: chat-service getConversationHistory, prd/$id loader
		// WHERE conversation_id = ? ORDER BY created_at ASC
		index("messages_conversation_id_created_at_idx").on(
			t.conversationId,
			t.createdAt,
		),
	],
);

// Tasks
export const tasks = pgTable(
	"tasks",
	{
		id: text("id").primaryKey(),
		projectId: text("project_id")
			.notNull()
			.references(() => projects.id),
		title: text("title").notNull(),
		description: text("description"),
		status: text("status").default("pending"),
		priority: text("priority").default("medium"),
		assignee: text("assignee"),
		dependencies: jsonb("dependencies"),
		// Requirement ids this task delivers, e.g. ["AC-1.1", "AC-1.2"].
		// Nullable: rows generated before the coverage contract existed carry
		// their references in prose only and are read via the legacy fallback.
		covers: jsonb("covers").$type<string[]>(),
		// Page/Screen inventory entries this task implements, referencing the
		// PRD's `User Flow → Pages & Screens` names. Nullable: legacy rows
		// predate the surface contract and read as no references.
		surfaces: jsonb("surfaces").$type<string[]>(),
		subtasks: jsonb("subtasks"),
		position: jsonb("position"), // { x, y } for kanban
		order: integer("order").default(0),
		featureName: text("feature_name"),
		subfeatureId: text("subfeature_id"),
		subfeatureName: text("subfeature_name"),
		startedAt: timestamp("started_at"),
		completedAt: timestamp("completed_at"),
		createdAt: timestamp("created_at").defaultNow(),
		updatedAt: timestamp("updated_at").defaultNow(),
	},
	(t) => [
		// Hot path: kanban, task-service, v1 API
		// WHERE project_id = ? ORDER BY order ASC
		index("tasks_project_id_order_idx").on(t.projectId, t.order),
	],
);
