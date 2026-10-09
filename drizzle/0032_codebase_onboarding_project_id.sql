ALTER TABLE "codebases" ADD COLUMN "onboarding_project_id" text;--> statement-breakpoint
ALTER TABLE "codebases" ADD CONSTRAINT "codebases_onboarding_project_id_projects_id_fk" FOREIGN KEY ("onboarding_project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
WITH candidate_projects AS (
  SELECT
    p.id,
    p.codebase_id,
    ROW_NUMBER() OVER (
      PARTITION BY p.codebase_id
      ORDER BY p.created_at ASC NULLS LAST, p.id ASC
    ) AS rn
  FROM "projects" p
  JOIN "codebases" c ON c.id = p.codebase_id AND c.user_id = p.user_id
  WHERE p.project_mode = 'existing_codebase'
    AND p.codebase_id IS NOT NULL
    AND p.deleted_at IS NULL
)
UPDATE "codebases" c
SET "onboarding_project_id" = cp.id
FROM candidate_projects cp
WHERE c.id = cp.codebase_id
  AND cp.rn = 1
  AND c.onboarding_project_id IS NULL;
