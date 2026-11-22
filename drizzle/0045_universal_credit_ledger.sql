ALTER TABLE "credit_operations" ALTER COLUMN "project_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_operations" ADD COLUMN "resource_type" text;--> statement-breakpoint
ALTER TABLE "credit_operations" ADD COLUMN "studio_project_id" text;--> statement-breakpoint
ALTER TABLE "credit_operations" ADD COLUMN "studio_job_id" text;--> statement-breakpoint
ALTER TABLE "credit_operations" ADD COLUMN "scrape_id" text;--> statement-breakpoint
ALTER TABLE "credit_operations" ADD COLUMN "product" text;--> statement-breakpoint
ALTER TABLE "credit_operations" ADD COLUMN "funding_source" text;--> statement-breakpoint
ALTER TABLE "credit_operations" ADD COLUMN "subscription_epoch" integer;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "allocation_epoch" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Additive backfill from verified data only. No amount, state, pricing
-- version, timestamp or ledger row is touched. Every historical operation
-- was a VibePlan project operation (project_id was NOT NULL).
UPDATE "credit_operations" SET "resource_type" = 'plan_project';--> statement-breakpoint
-- projects.project_mode is written once at insert and never updated.
-- Contradictory evidence (greenfield mode with codebase context, unknown
-- mode) is labelled legacy_unknown instead of guessed.
UPDATE "credit_operations" AS operation
SET "product" = CASE
  WHEN project."project_mode" = 'existing_codebase' THEN 'vibeplan_codebase'
  WHEN project."project_mode" = 'greenfield'
    AND operation."kind" <> 'codebase_analysis'
    AND COALESCE(operation."metrics" ->> 'hasCodebaseContext', 'false') <> 'true'
    THEN 'vibeplan_greenfield'
  ELSE 'legacy_unknown'
END
FROM "projects" AS project
WHERE project."id" = operation."project_id" AND project."user_id" = operation."user_id";--> statement-breakpoint
UPDATE "credit_operations" SET "product" = 'legacy_unknown' WHERE "product" IS NULL;--> statement-breakpoint
-- Plan allocation and top-ups share one subscriptions.credits counter, so
-- they cannot be told apart per operation; both stay subscription_balance.
UPDATE "credit_operations" SET "funding_source" = CASE
  WHEN "is_exempt" THEN 'exempt'
  WHEN "initial_analysis_allowance" THEN 'initial_analysis_allowance'
  WHEN "subscription_id" IS NOT NULL THEN 'subscription_balance'
  ELSE 'legacy_unknown'
END;--> statement-breakpoint
-- Every subscription starts at allocation_epoch 0, so bound operations
-- already reserved in epoch 0.
UPDATE "credit_operations" SET "subscription_epoch" = 0 WHERE "subscription_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_operations" ALTER COLUMN "resource_type" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_operations" ALTER COLUMN "product" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_operations" ALTER COLUMN "funding_source" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "scrapes" ADD CONSTRAINT "scrapes_user_id_id_unique" UNIQUE("id","user_id");--> statement-breakpoint
ALTER TABLE "studio_jobs" ADD CONSTRAINT "studio_jobs_id_project_id_user_id_unique" UNIQUE("id","project_id","user_id");--> statement-breakpoint
ALTER TABLE "studio_projects" ADD CONSTRAINT "studio_projects_user_id_id_unique" UNIQUE("id","user_id");--> statement-breakpoint
ALTER TABLE "credit_operations" ADD CONSTRAINT "credit_operations_user_studio_project_fk" FOREIGN KEY ("studio_project_id","user_id") REFERENCES "public"."studio_projects"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_operations" ADD CONSTRAINT "credit_operations_user_studio_job_fk" FOREIGN KEY ("studio_job_id","studio_project_id","user_id") REFERENCES "public"."studio_jobs"("id","project_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_operations" ADD CONSTRAINT "credit_operations_user_scrape_fk" FOREIGN KEY ("scrape_id","user_id") REFERENCES "public"."scrapes"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "credit_operations_studio_project_id_idx" ON "credit_operations" USING btree ("studio_project_id") WHERE studio_project_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "credit_operations_studio_job_id_idx" ON "credit_operations" USING btree ("studio_job_id") WHERE studio_job_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "credit_operations_scrape_id_idx" ON "credit_operations" USING btree ("scrape_id") WHERE scrape_id IS NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_operations" ADD CONSTRAINT "credit_operations_resource_check" CHECK (CASE resource_type WHEN 'plan_project' THEN product IN ('vibeplan_greenfield', 'vibeplan_codebase', 'legacy_unknown') AND kind NOT LIKE 'studio.%' AND kind NOT LIKE 'scrape.%' AND project_id IS NOT NULL AND studio_project_id IS NULL AND studio_job_id IS NULL AND scrape_id IS NULL WHEN 'studio_project' THEN product = 'studio' AND kind LIKE 'studio.%' AND project_id IS NULL AND studio_project_id IS NOT NULL AND scrape_id IS NULL WHEN 'scrape' THEN product = 'scrape' AND kind LIKE 'scrape.%' AND project_id IS NULL AND studio_project_id IS NULL AND studio_job_id IS NULL AND scrape_id IS NOT NULL ELSE false END);--> statement-breakpoint
ALTER TABLE "credit_operations" ADD CONSTRAINT "credit_operations_funding_source_check" CHECK (funding_source IN ('subscription_balance', 'initial_analysis_allowance', 'exempt', 'trial', 'legacy_unknown') AND (funding_source = 'exempt') = is_exempt AND (funding_source = 'initial_analysis_allowance') = (initial_analysis_allowance AND NOT is_exempt) AND (funding_source <> 'subscription_balance' OR subscription_id IS NOT NULL) AND (funding_source <> 'trial' OR (reserved_credits = 0 AND COALESCE(final_charge, 0) = 0)));