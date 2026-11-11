CREATE TABLE "studio_element_revisions" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"user_id" text NOT NULL,
	"frame_id" text NOT NULL,
	"frame_name" text NOT NULL,
	"request_id" text NOT NULL,
	"request_hash" text NOT NULL,
	"base_revision" integer NOT NULL,
	"base_hash" text NOT NULL,
	"target" jsonb NOT NULL,
	"prompt" text NOT NULL,
	"edit" jsonb,
	"status" text NOT NULL,
	"before_html" text NOT NULL,
	"after_html" text,
	"summary" text DEFAULT '' NOT NULL,
	"error_code" text,
	"applied_revision" integer,
	"undo_revision" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "studio_element_revisions" ADD CONSTRAINT "studio_element_revisions_project_id_studio_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."studio_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_element_revisions" ADD CONSTRAINT "studio_element_revisions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_element_revisions" ADD CONSTRAINT "studio_element_revisions_frame_id_studio_frames_id_fk" FOREIGN KEY ("frame_id") REFERENCES "public"."studio_frames"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "studio_element_revisions_request_idx" ON "studio_element_revisions" USING btree ("user_id","project_id","request_id");--> statement-breakpoint
CREATE INDEX "studio_element_revisions_frame_idx" ON "studio_element_revisions" USING btree ("user_id","project_id","frame_id");