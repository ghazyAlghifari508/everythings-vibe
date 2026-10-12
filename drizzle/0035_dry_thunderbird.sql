CREATE TABLE "scrape_images" (
	"id" text PRIMARY KEY NOT NULL,
	"scrape_id" text NOT NULL,
	"user_id" text NOT NULL,
	"url" text NOT NULL,
	"page_url" text NOT NULL,
	"format" text,
	"width" integer,
	"height" integer,
	"classification" text,
	"evidence" jsonb NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "scrape_pages" (
	"id" text PRIMARY KEY NOT NULL,
	"scrape_id" text NOT NULL,
	"user_id" text NOT NULL,
	"url" text NOT NULL,
	"parent_url" text,
	"depth" integer NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"title" text,
	"http_status" integer,
	"content" jsonb,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "scrapes" ADD COLUMN "request" jsonb;--> statement-breakpoint
ALTER TABLE "scrapes" ADD COLUMN "job_token" text;--> statement-breakpoint
ALTER TABLE "scrapes" ADD COLUMN "lease_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "scrapes" ADD COLUMN "job_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "scrape_images" ADD CONSTRAINT "scrape_images_scrape_id_scrapes_id_fk" FOREIGN KEY ("scrape_id") REFERENCES "public"."scrapes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrape_images" ADD CONSTRAINT "scrape_images_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrape_pages" ADD CONSTRAINT "scrape_pages_scrape_id_scrapes_id_fk" FOREIGN KEY ("scrape_id") REFERENCES "public"."scrapes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrape_pages" ADD CONSTRAINT "scrape_pages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "scrape_images_owner_url_idx" ON "scrape_images" USING btree ("user_id","scrape_id","url");--> statement-breakpoint
CREATE UNIQUE INDEX "scrape_pages_owner_url_idx" ON "scrape_pages" USING btree ("user_id","scrape_id","url");--> statement-breakpoint
CREATE INDEX "scrapes_job_queue_idx" ON "scrapes" USING btree ("status","lease_expires_at","created_at");