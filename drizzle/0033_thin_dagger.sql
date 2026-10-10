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
ALTER TABLE "studio_projects" ADD COLUMN "design_mode" text DEFAULT 'web' NOT NULL;--> statement-breakpoint
ALTER TABLE "studio_projects" ADD COLUMN "design_md" text;--> statement-breakpoint
ALTER TABLE "studio_projects" ADD COLUMN "logo_asset_id" text;--> statement-breakpoint
ALTER TABLE "studio_assets" ADD CONSTRAINT "studio_assets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "studio_assets_user_id_idx" ON "studio_assets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "studio_assets_project_id_idx" ON "studio_assets" USING btree ("project_id");