ALTER TABLE "studio_frames" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "studio_frames" ADD COLUMN "visual_hash" text;--> statement-breakpoint
ALTER TABLE "studio_frames" ADD COLUMN "prompt_hash" text;--> statement-breakpoint
ALTER TABLE "studio_jobs" ADD COLUMN "claimed_by" text;--> statement-breakpoint
ALTER TABLE "studio_jobs" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "studio_jobs" ADD COLUMN "claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "studio_jobs" ADD COLUMN "lease_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "studio_jobs" ADD COLUMN "started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "studio_jobs" ADD COLUMN "finished_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "studio_projects" ADD COLUMN "design_skill_id" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "studio_projects" ADD COLUMN "initial_page_count" integer;--> statement-breakpoint
ALTER TABLE "studio_projects" ADD COLUMN "design_reference" jsonb;--> statement-breakpoint
ALTER TABLE "studio_projects" ADD COLUMN "design_blueprint" jsonb;--> statement-breakpoint
ALTER TABLE "studio_projects" ADD COLUMN "design_blueprint_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "studio_projects" ADD COLUMN "design_skill_version" integer;--> statement-breakpoint
CREATE INDEX "studio_frames_project_status_idx" ON "studio_frames" USING btree ("project_id","status");--> statement-breakpoint
CREATE INDEX "studio_jobs_status_idx" ON "studio_jobs" USING btree ("status");--> statement-breakpoint
ALTER TABLE "studio_frames" ADD CONSTRAINT "studio_frames_project_order_unique" UNIQUE("project_id","order");