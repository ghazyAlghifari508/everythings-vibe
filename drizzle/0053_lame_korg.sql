ALTER TABLE "studio_jobs" ADD COLUMN "credit_operation_id" text;--> statement-breakpoint
ALTER TABLE "studio_jobs" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "studio_projects" ADD COLUMN "deleted_at" timestamp with time zone;