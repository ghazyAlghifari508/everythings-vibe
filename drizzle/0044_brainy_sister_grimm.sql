ALTER TABLE "error_reports" ADD COLUMN IF NOT EXISTS "handling_status" text DEFAULT 'new' NOT NULL;--> statement-breakpoint
ALTER TABLE "error_reports" ADD COLUMN IF NOT EXISTS "archived_at" timestamp;--> statement-breakpoint
ALTER TABLE "feedback" ADD COLUMN IF NOT EXISTS "handling_status" text DEFAULT 'new' NOT NULL;--> statement-breakpoint
ALTER TABLE "feedback" ADD COLUMN IF NOT EXISTS "archived_at" timestamp;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "error_reports_created_at_idx" ON "error_reports" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "error_reports_handling_status_idx" ON "error_reports" USING btree ("handling_status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "error_reports_archived_at_idx" ON "error_reports" USING btree ("archived_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feedback_created_at_idx" ON "feedback" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feedback_type_idx" ON "feedback" USING btree ("type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feedback_handling_status_idx" ON "feedback" USING btree ("handling_status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feedback_archived_at_idx" ON "feedback" USING btree ("archived_at");