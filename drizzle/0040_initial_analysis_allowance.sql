ALTER TABLE "credit_operations" ADD COLUMN IF NOT EXISTS "initial_analysis_allowance" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "initial_analysis_used_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "credit_operations_active_initial_allowance_unique" ON "credit_operations" USING btree ("user_id") WHERE initial_analysis_allowance = true AND state IN ('reserved', 'running', 'settling');--> statement-breakpoint
UPDATE "users" AS u SET "initial_analysis_used_at" = COALESCE(
  (SELECT MIN(a.created_at) FROM codebase_analyses a JOIN projects p ON p.id = a.project_id WHERE p.user_id = u.id AND a.status = 'ready'),
  (SELECT MIN(o.settled_at) FROM credit_operations o WHERE o.user_id = u.id AND o.kind = 'codebase_analysis' AND o.state IN ('settled', 'refunded'))
) WHERE u.initial_analysis_used_at IS NULL AND (
  EXISTS (SELECT 1 FROM codebase_analyses a JOIN projects p ON p.id = a.project_id WHERE p.user_id = u.id AND a.status = 'ready') OR
  EXISTS (SELECT 1 FROM credit_operations o WHERE o.user_id = u.id AND o.kind = 'codebase_analysis' AND o.state IN ('settled', 'refunded'))
);