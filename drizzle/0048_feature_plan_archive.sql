ALTER TABLE "projects" ADD COLUMN "archived_at" timestamp;--> statement-breakpoint
CREATE INDEX "projects_user_id_archived_at_idx" ON "projects" USING btree ("user_id","archived_at");