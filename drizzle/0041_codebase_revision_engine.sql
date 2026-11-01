CREATE TABLE "codebase_revision_proposals" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"project_id" text NOT NULL,
	"codebase_id" text NOT NULL,
	"snapshot_id" text NOT NULL,
	"target_kind" text NOT NULL,
	"base_version_id" text NOT NULL,
	"instruction" text NOT NULL,
	"base_content" text NOT NULL,
	"proposed_content" text NOT NULL,
	"impact" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"applied_version_id" text,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feature_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"version" integer NOT NULL,
	"content" jsonb NOT NULL,
	"change_summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"version" integer NOT NULL,
	"content" jsonb NOT NULL,
	"change_summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "codebase_revision_proposals" ADD CONSTRAINT "codebase_revision_proposals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "codebase_revision_proposals" ADD CONSTRAINT "codebase_revision_proposals_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "codebase_revision_proposals" ADD CONSTRAINT "codebase_revision_proposals_codebase_id_codebases_id_fk" FOREIGN KEY ("codebase_id") REFERENCES "public"."codebases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "codebase_revision_proposals" ADD CONSTRAINT "codebase_revision_proposals_snapshot_id_codebase_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."codebase_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "codebase_revision_proposals" ADD CONSTRAINT "codebase_revision_proposals_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_versions" ADD CONSTRAINT "feature_versions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_versions" ADD CONSTRAINT "task_versions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "codebase_revision_proposals_user_key_idx" ON "codebase_revision_proposals" USING btree ("user_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "codebase_revision_proposals_project_idx" ON "codebase_revision_proposals" USING btree ("user_id","project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "feature_versions_project_id_version_idx" ON "feature_versions" USING btree ("project_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "task_versions_project_id_version_idx" ON "task_versions" USING btree ("project_id","version");