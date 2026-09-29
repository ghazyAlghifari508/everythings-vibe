ALTER TABLE "projects" ADD COLUMN "features_status" text DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "feature_tree" jsonb;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "subfeature_id" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "subfeature_name" text;