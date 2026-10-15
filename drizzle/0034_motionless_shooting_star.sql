CREATE TABLE "studio_assets" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"project_id" text,
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"byte_length" integer NOT NULL,
	"data" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "studio_frames" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"viewport" text DEFAULT 'web' NOT NULL,
	"html_code" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "studio_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"user_id" text NOT NULL,
	"prompt" text NOT NULL,
	"job_type" text DEFAULT 'initial' NOT NULL,
	"target_frame_id" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "studio_projects" ADD COLUMN "design_mode" text DEFAULT 'web' NOT NULL;--> statement-breakpoint
ALTER TABLE "studio_projects" ADD COLUMN "design_md" text;--> statement-breakpoint
ALTER TABLE "studio_projects" ADD COLUMN "logo_asset_id" text;--> statement-breakpoint
ALTER TABLE "studio_assets" ADD CONSTRAINT "studio_assets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_frames" ADD CONSTRAINT "studio_frames_project_id_studio_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."studio_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_jobs" ADD CONSTRAINT "studio_jobs_project_id_studio_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."studio_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_jobs" ADD CONSTRAINT "studio_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "studio_assets_user_id_idx" ON "studio_assets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "studio_assets_project_id_idx" ON "studio_assets" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "studio_frames_project_id_idx" ON "studio_frames" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "studio_frames_order_idx" ON "studio_frames" USING btree ("order");--> statement-breakpoint
CREATE INDEX "studio_jobs_project_id_idx" ON "studio_jobs" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "studio_jobs_user_id_idx" ON "studio_jobs" USING btree ("user_id");