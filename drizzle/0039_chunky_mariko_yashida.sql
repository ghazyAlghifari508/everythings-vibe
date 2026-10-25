CREATE TABLE "codebase_generation_operations" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"project_id" text NOT NULL,
	"stage" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"identity_hash" text NOT NULL,
	"input" jsonb NOT NULL,
	"source" jsonb,
	"attempt" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"job_token" text,
	"claimed_by" text,
	"lease_expires_at" timestamp with time zone,
	"heartbeat_at" timestamp with time zone,
	"artifact_id" text,
	"result" jsonb,
	"error" text,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "codebase_generation_operations" ADD CONSTRAINT "codebase_generation_operations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "codebase_generation_operations" ADD CONSTRAINT "codebase_generation_operations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "codebase_gen_ops_active_stage_idx" ON "codebase_generation_operations" USING btree ("project_id","stage") WHERE status IN ('queued', 'running');--> statement-breakpoint
CREATE INDEX "codebase_gen_ops_identity_hash_idx" ON "codebase_generation_operations" USING btree ("identity_hash");--> statement-breakpoint
CREATE INDEX "codebase_gen_ops_user_project_idx" ON "codebase_generation_operations" USING btree ("user_id","project_id");--> statement-breakpoint
CREATE INDEX "codebase_gen_ops_project_status_idx" ON "codebase_generation_operations" USING btree ("project_id","status");--> statement-breakpoint
CREATE INDEX "codebase_gen_ops_claim_idx" ON "codebase_generation_operations" USING btree ("status","lease_expires_at");