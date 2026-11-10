ALTER TABLE "studio_frames" ADD COLUMN "origin_job_id" text;--> statement-breakpoint
ALTER TABLE "studio_frames" ADD COLUMN "initial_slot" integer;--> statement-breakpoint
ALTER TABLE "studio_frames" ADD COLUMN "revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "studio_frames" ADD COLUMN "last_job_id" text;--> statement-breakpoint
ALTER TABLE "studio_jobs" ADD COLUMN "request_id" text;--> statement-breakpoint
ALTER TABLE "studio_jobs" ADD COLUMN "request_hash" text;--> statement-breakpoint
ALTER TABLE "studio_jobs" ADD COLUMN "operation_intent" text;--> statement-breakpoint
ALTER TABLE "studio_jobs" ADD COLUMN "operation_index" integer;--> statement-breakpoint
ALTER TABLE "studio_jobs" ADD COLUMN "blueprint_job_id" text;--> statement-breakpoint
ALTER TABLE "studio_jobs" ADD COLUMN "depends_on_job_id" text;--> statement-breakpoint
ALTER TABLE "studio_jobs" ADD COLUMN "base_revision" integer;--> statement-breakpoint
ALTER TABLE "studio_jobs" ADD COLUMN "planning_completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "studio_jobs" ADD COLUMN "error_code" text;--> statement-breakpoint
ALTER TABLE "studio_revisions" ADD COLUMN "frame_id" text;--> statement-breakpoint
ALTER TABLE "studio_revisions" ADD COLUMN "frame_revision" integer;--> statement-breakpoint
ALTER TABLE "studio_revisions" ADD COLUMN "job_id" text;--> statement-breakpoint
CREATE INDEX "studio_frames_origin_idx" ON "studio_frames" USING btree ("origin_job_id");--> statement-breakpoint
CREATE UNIQUE INDEX "studio_frames_initial_slot_idx" ON "studio_frames" USING btree ("origin_job_id","initial_slot");--> statement-breakpoint
CREATE UNIQUE INDEX "studio_jobs_request_part_idx" ON "studio_jobs" USING btree ("project_id","user_id","request_id","operation_index");--> statement-breakpoint
CREATE INDEX "studio_jobs_dependency_idx" ON "studio_jobs" USING btree ("depends_on_job_id");
--> statement-breakpoint
-- Stop workers before migration; old writers do not enforce frame versions.
UPDATE studio_frames SET revision = 1 WHERE html_code IS NOT NULL;
--> statement-breakpoint
WITH origins AS (
  SELECT DISTINCT ON (j.target_frame_id) j.target_frame_id, j.id
  FROM studio_jobs j JOIN studio_projects p ON p.id = j.project_id AND p.user_id = j.user_id
  WHERE j.job_type = 'add' AND j.target_frame_id IS NOT NULL
  ORDER BY j.target_frame_id, j.created_at, j.id
)
UPDATE studio_frames f SET origin_job_id = origins.id
FROM origins WHERE f.id = origins.target_frame_id;
--> statement-breakpoint
WITH initial AS (
  SELECT project_id, min(id) AS id FROM studio_jobs WHERE job_type = 'initial'
  GROUP BY project_id HAVING count(*) = 1
), slots AS (
  SELECT f.id, initial.id AS job_id,
    row_number() OVER (PARTITION BY initial.id ORDER BY f."order", f.id) - 1 AS slot
  FROM studio_frames f JOIN initial ON initial.project_id = f.project_id
  JOIN studio_projects p ON p.id = f.project_id
  JOIN studio_jobs j ON j.id = initial.id AND j.user_id = p.user_id
  WHERE f.origin_job_id IS NULL
)
UPDATE studio_frames f SET origin_job_id = slots.job_id, initial_slot = slots.slot
FROM slots WHERE f.id = slots.id;
--> statement-breakpoint
UPDATE studio_jobs j SET planning_completed_at = p.updated_at
FROM studio_projects p WHERE j.project_id = p.id AND j.user_id = p.user_id
  AND j.job_type = 'initial' AND p.design_blueprint IS NOT NULL;
--> statement-breakpoint
UPDATE studio_jobs j SET blueprint_job_id = initial.id
FROM studio_jobs initial WHERE j.project_id = initial.project_id AND j.user_id = initial.user_id
  AND j.job_type <> 'initial' AND initial.job_type = 'initial'
  AND NOT EXISTS (SELECT 1 FROM studio_jobs other WHERE other.project_id = initial.project_id
    AND other.user_id = initial.user_id AND other.job_type = 'initial' AND other.id <> initial.id);
--> statement-breakpoint
UPDATE studio_jobs j SET status = 'failed', error_code = 'STUDIO_DEPENDENCY_FAILED',
  error = 'Operasi legacy belum memiliki versi target yang aman. Kirim ulang permintaan.',
  finished_at = clock_timestamp(), claimed_by = NULL, claimed_at = NULL, lease_expires_at = NULL
WHERE j.job_type <> 'initial' AND j.status IN ('queued', 'planning', 'generating');