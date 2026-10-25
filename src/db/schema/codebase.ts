import {
	type AnyPgColumn,
	index,
	integer,
	jsonb,
	pgTable,
	primaryKey,
	text,
	timestamp,
} from "drizzle-orm/pg-core";
import type { CodebaseNameSource } from "@/features/codebase/services/library";
import { users } from "./auth";
import { projects } from "./projects";

// Codebase: one user-owned repository. Sync sessions and snapshots belong to
// the codebase, not to a project, so a repository is synced once and reused by
// every feature planned against it. Each feature stays a normal project.
export const codebases = pgTable(
	"codebases",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		// Provenance of `name`. "auto" means the system chose it (the create
		// placeholder, later replaced by the repository folder name the CLI
		// reports at handshake); "user" means a person chose it via a name input,
		// a composer message, or the rename endpoint. Auto-naming may only write
		// rows still marked "auto", so a custom name is never overwritten.
		// Defaults to "user" so a writer that forgets the column is protected
		// rather than clobbered.
		nameSource: text("name_source")
			.$type<CodebaseNameSource>()
			.notNull()
			.default("user"),
		// Anchor onboarding project created during initial repository setup.
		// Immutable once assigned; subsequent feature projects never overwrite it.
		// Nullable until the first feature planned or if no safe candidate exists.
		onboardingProjectId: text("onboarding_project_id").references(
			(): AnyPgColumn => projects.id,
			{ onDelete: "set null" },
		),
		// Normalized Git remote identity (`host/owner/repo`, lowercase, no
		// credentials, port, or `.git`). Nullable: repositories synced before
		// this column existed have no identity yet and adopt one on their next
		// sync. Never derived from the folder name, and never used to merge two
		// codebases automatically — a mismatch is reported, not acted on.
		repositoryIdentity: text("repository_identity"),
		createdAt: timestamp("created_at").defaultNow(),
		updatedAt: timestamp("updated_at").defaultNow(),
	},
	(t) => [
		index("codebases_user_id_idx").on(t.userId),
		// Re-sync resolves an existing codebase by identity within one owner's
		// rows, so the index leads with the tenant column.
		index("codebases_user_id_repository_identity_idx").on(
			t.userId,
			t.repositoryIdentity,
		),
	],
);

// Sync session: one short-lived codebase-scoped credential per attempt.
export const codebaseSyncSessions = pgTable(
	"codebase_sync_sessions",
	{
		id: text("id").primaryKey(),
		// Legacy project linkage for historical rows. New codebase-scoped
		// sessions leave this unset; ownership flows via codebaseId.
		projectId: text("project_id").references(() => projects.id, {
			onDelete: "cascade",
		}),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		// Owner of the sync attempt. Nullable until the migration backfill runs;
		// `projectId` remains for historical rows and is no longer the owner key.
		codebaseId: text("codebase_id").references(() => codebases.id, {
			onDelete: "cascade",
		}),
		// SHA-256 hex of the raw sync credential. Raw value is never stored.
		credentialHash: text("credential_hash").notNull(),
		// Sync status: waiting_for_cli | connected | scanning | filtering |
		// uploading | uploaded | analyzing | ready | failed | expired.
		status: text("status").notNull().default("waiting_for_cli"),
		expiresAt: timestamp("expires_at").notNull(),
		consumedAt: timestamp("consumed_at"),
		cliMinVersion: text("cli_min_version").notNull().default("2.0.0"),
		attempt: integer("attempt").notNull().default(1),
		metadata: jsonb("metadata"),
		createdAt: timestamp("created_at").defaultNow(),
		updatedAt: timestamp("updated_at").defaultNow(),
	},
	(t) => [
		index("codebase_sync_sessions_project_id_idx").on(t.projectId),
		index("codebase_sync_sessions_user_id_idx").on(t.userId),
		index("codebase_sync_sessions_codebase_id_idx").on(t.codebaseId),
	],
);

// Snapshot: persisted manifest + filtered source-context references.
export const codebaseSnapshots = pgTable(
	"codebase_snapshots",
	{
		id: text("id").primaryKey(),
		// Legacy project linkage for historical rows. New codebase-scoped
		// snapshots leave this unset; ownership flows via codebaseId.
		projectId: text("project_id").references(() => projects.id, {
			onDelete: "cascade",
		}),
		syncSessionId: text("sync_session_id")
			.notNull()
			.references(() => codebaseSyncSessions.id, { onDelete: "cascade" }),
		// Owner of the snapshot. Nullable until the migration backfill runs;
		// `projectId` remains for historical rows and is no longer the owner key.
		codebaseId: text("codebase_id").references(() => codebases.id, {
			onDelete: "cascade",
		}),
		branch: text("branch"),
		commitSha: text("commit_sha"),
		manifest: jsonb("manifest"),
		fileCount: integer("file_count").notNull().default(0),
		excludedCount: integer("excluded_count").notNull().default(0),
		contentSize: integer("content_size").notNull().default(0),
		// Snapshot status uses CODEBASE_SNAPSHOT_STATUSES
		// (see src/lib/codebase-sync.ts); default "uploading" is a member.
		status: text("status").notNull().default("uploading"),
		createdAt: timestamp("created_at").defaultNow(),
	},
	(t) => [
		index("codebase_snapshots_project_id_idx").on(t.projectId),
		index("codebase_snapshots_sync_session_id_idx").on(t.syncSessionId),
		index("codebase_snapshots_codebase_id_idx").on(t.codebaseId),
	],
);

// Snapshot file chunks: bounded base64 text slices keyed by
// (snapshot, path, chunk index). One row per uploaded chunk; completion
// reassembles per path and verifies hashes before the snapshot becomes
// `uploaded`. Raw filtered source is retained for the project lifetime so
// analysis can be regenerated; project deletion cascades everything.
export const codebaseSnapshotFiles = pgTable(
	"codebase_snapshot_files",
	{
		snapshotId: text("snapshot_id")
			.notNull()
			.references(() => codebaseSnapshots.id, { onDelete: "cascade" }),
		path: text("path").notNull(),
		chunkIndex: integer("chunk_index").notNull(),
		chunkTotal: integer("chunk_total").notNull(),
		contentHash: text("content_hash").notNull(),
		encoding: text("encoding").notNull().default("base64"),
		// Base64 text slice as sent by the CLI (binaries never uploaded).
		data: text("data").notNull(),
		// Decoded byte length of `data` for bound accounting without decoding.
		size: integer("size").notNull().default(0),
		createdAt: timestamp("created_at").defaultNow(),
	},
	(t) => [
		primaryKey({
			columns: [t.snapshotId, t.path, t.chunkIndex],
			name: "codebase_snapshot_files_pkey",
		}),
		index("codebase_snapshot_files_snapshot_id_idx").on(t.snapshotId),
	],
);

// Sync idempotency keys: small stored responses for idempotent replay.
// Keys embed only the attempt identity (`${attemptId}:${kind}:${index}`)
// and carry no credentials; stored responses are status payloads only
// (never tokens or source content).
export const codebaseSyncIdempotencyKeys = pgTable(
	"codebase_sync_idempotency_keys",
	{
		key: text("key").primaryKey(),
		sessionId: text("session_id")
			.notNull()
			.references(() => codebaseSyncSessions.id, { onDelete: "cascade" }),
		snapshotId: text("snapshot_id")
			.notNull()
			.references(() => codebaseSnapshots.id, { onDelete: "cascade" }),
		kind: text("kind").notNull(),
		statusCode: integer("status_code").notNull(),
		response: jsonb("response").notNull(),
		createdAt: timestamp("created_at").defaultNow(),
	},
	(t) => [
		index("codebase_sync_idempotency_keys_session_id_idx").on(t.sessionId),
	],
);

// Analysis: validated structured output bound to one snapshot.
export const codebaseAnalyses = pgTable(
	"codebase_analyses",
	{
		id: text("id").primaryKey(),
		projectId: text("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		snapshotId: text("snapshot_id")
			.notNull()
			.references(() => codebaseSnapshots.id, { onDelete: "cascade" }),
		output: jsonb("output"),
		// Analysis status uses CODEBASE_ANALYSIS_STATUSES
		// (see src/lib/codebase-sync.ts); default "pending" is a member.
		status: text("status").notNull().default("pending"),
		errorCode: text("error_code"),
		errorMessage: text("error_message"),
		createdAt: timestamp("created_at").defaultNow(),
		updatedAt: timestamp("updated_at").defaultNow(),
	},
	(t) => [
		index("codebase_analyses_project_id_idx").on(t.projectId),
		index("codebase_analyses_snapshot_id_idx").on(t.snapshotId),
	],
);

// Generation context: links the active snapshot/analysis to later Ask/PRD/AC/
// Task generation without changing existing version-table semantics.
export const codebaseGenerationContexts = pgTable(
	"codebase_generation_contexts",
	{
		id: text("id").primaryKey(),
		projectId: text("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		snapshotId: text("snapshot_id")
			.notNull()
			.references(() => codebaseSnapshots.id, { onDelete: "cascade" }),
		analysisId: text("analysis_id").references(() => codebaseAnalyses.id, {
			onDelete: "cascade",
		}),
		createdAt: timestamp("created_at").defaultNow(),
		updatedAt: timestamp("updated_at").defaultNow(),
	},
	(t) => [
		// Hot paths: latest context per project, plus snapshot/analysis
		// lookups when linking generation output back to its source.
		index("codebase_generation_contexts_project_id_idx").on(t.projectId),
		index("codebase_generation_contexts_snapshot_id_idx").on(t.snapshotId),
		index("codebase_generation_contexts_analysis_id_idx").on(t.analysisId),
	],
);

// Ask handoff: authoritative server-side copy of the Ask answers/compiled
// prompt for projects (one row per project, upserted on submit). Both
// project modes (greenfield and existing_codebase) write here.
// sessionStorage keeps UI continuity; this row survives refresh and
// multi-device access.
export const codebaseAskHandoffs = pgTable("codebase_ask_handoffs", {
	projectId: text("project_id")
		.primaryKey()
		.references(() => projects.id, { onDelete: "cascade" }),
	userId: text("user_id")
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
	// Advisory binding to the snapshot the Ask flow saw; plain text (no FK)
	// so later snapshot selection never blocks handoff reads.
	snapshotId: text("snapshot_id"),
	answers: jsonb("answers"),
	compiledPrompt: text("compiled_prompt"),
	// Restorable Ask UI snapshot (questions + both sessions' answers).
	state: jsonb("state"),
	createdAt: timestamp("created_at").defaultNow(),
	updatedAt: timestamp("updated_at").defaultNow(),
});
