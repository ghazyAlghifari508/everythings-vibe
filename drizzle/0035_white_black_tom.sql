ALTER TABLE "studio_projects" ADD COLUMN "design_skill_id" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "studio_projects" ADD COLUMN "initial_page_count" integer;--> statement-breakpoint
ALTER TABLE "studio_projects" ADD COLUMN "design_reference" jsonb;