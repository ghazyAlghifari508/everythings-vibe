CREATE TABLE "scrape_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"scrape_id" text NOT NULL,
	"design_md" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scrapes" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"source_url" text NOT NULL,
	"domain" text NOT NULL,
	"title" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"html" text,
	"preview_html" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "studio_projects" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "studio_revisions" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"prompt" text NOT NULL,
	"html_code" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scrape_documents" ADD CONSTRAINT "scrape_documents_scrape_id_scrapes_id_fk" FOREIGN KEY ("scrape_id") REFERENCES "public"."scrapes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrapes" ADD CONSTRAINT "scrapes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_projects" ADD CONSTRAINT "studio_projects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_revisions" ADD CONSTRAINT "studio_revisions_project_id_studio_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."studio_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scrape_documents_scrape_id_idx" ON "scrape_documents" USING btree ("scrape_id");--> statement-breakpoint
CREATE INDEX "scrapes_user_id_idx" ON "scrapes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "studio_projects_user_id_idx" ON "studio_projects" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "studio_revisions_project_id_idx" ON "studio_revisions" USING btree ("project_id");