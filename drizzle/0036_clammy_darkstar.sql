CREATE TABLE "scrape_image_assets" (
	"id" text PRIMARY KEY NOT NULL,
	"scrape_id" text NOT NULL,
	"user_id" text NOT NULL,
	"sha256" text NOT NULL,
	"mime_type" text NOT NULL,
	"byte_length" integer NOT NULL,
	"body" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scrape_image_assets_size_check" CHECK ("scrape_image_assets"."byte_length" > 0 AND "scrape_image_assets"."byte_length" = octet_length("scrape_image_assets"."body"))
);
--> statement-breakpoint
ALTER TABLE "scrape_images" ADD COLUMN "asset_id" text;--> statement-breakpoint
ALTER TABLE "scrape_images" ADD COLUMN "failure_code" text;--> statement-breakpoint
ALTER TABLE "scrape_images" ADD COLUMN "http_status" integer;--> statement-breakpoint
ALTER TABLE "scrape_image_assets" ADD CONSTRAINT "scrape_image_assets_scrape_id_scrapes_id_fk" FOREIGN KEY ("scrape_id") REFERENCES "public"."scrapes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrape_image_assets" ADD CONSTRAINT "scrape_image_assets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "scrape_image_assets_owner_hash_idx" ON "scrape_image_assets" USING btree ("user_id","scrape_id","sha256");--> statement-breakpoint
ALTER TABLE "scrape_images" ADD CONSTRAINT "scrape_images_asset_id_scrape_image_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."scrape_image_assets"("id") ON DELETE set null ON UPDATE no action;