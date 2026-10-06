ALTER TABLE "users" ADD COLUMN "is_admin" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "banned_at" timestamp;--> statement-breakpoint
-- Both columns are declared by drizzle/meta/0008_snapshot.json but were only
-- ever created in running databases through `db:push`, so a database replayed
-- from this folder needs them here.
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "language" text DEFAULT 'id';--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "reminder_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
