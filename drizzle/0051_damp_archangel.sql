CREATE TABLE "shadow_usage_records" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"product_family" text NOT NULL,
	"operation_kind" text NOT NULL,
	"logical_job_id" text NOT NULL,
	"attempt_id" text NOT NULL,
	"attempt_index" integer DEFAULT 0 NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"duration_ms" integer,
	"outcome" text DEFAULT 'unknown' NOT NULL,
	"requested_units" integer,
	"completed_units" integer DEFAULT 0 NOT NULL,
	"resource_limits" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"metrics" jsonb NOT NULL,
	"provider_usage" jsonb,
	"cost" jsonb NOT NULL,
	"price_source" text,
	"pricing_version" text,
	"dedupe_key" text NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "shadow_usage_records_bounds_check" CHECK (attempt_index >= 0 AND retry_count >= 0 AND completed_units >= 0 AND (duration_ms IS NULL OR duration_ms >= 0))
);
--> statement-breakpoint
ALTER TABLE "shadow_usage_records" ADD CONSTRAINT "shadow_usage_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "shadow_usage_records_user_dedupe_unique" ON "shadow_usage_records" USING btree ("user_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "shadow_usage_records_group_recorded_idx" ON "shadow_usage_records" USING btree ("product_family","operation_kind","recorded_at");--> statement-breakpoint
CREATE INDEX "shadow_usage_records_user_recorded_idx" ON "shadow_usage_records" USING btree ("user_id","recorded_at");--> statement-breakpoint
CREATE INDEX "shadow_usage_records_expires_at_idx" ON "shadow_usage_records" USING btree ("expires_at");