CREATE TABLE "product_trials" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"product" text NOT NULL,
	"job_id" text NOT NULL,
	"request_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"state" text DEFAULT 'reserved' NOT NULL,
	"completed_units" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "product_trials_product_check" CHECK ("product_trials"."product" in ('studio', 'scrape')),
	CONSTRAINT "product_trials_state_check" CHECK (("product_trials"."state" = 'reserved' and "product_trials"."completed_units" = 0 and "product_trials"."closed_at" is null) or ("product_trials"."state" = 'consumed' and "product_trials"."completed_units" > 0 and "product_trials"."closed_at" is not null) or ("product_trials"."state" = 'released' and "product_trials"."completed_units" = 0 and "product_trials"."closed_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "product_trials" ADD CONSTRAINT "product_trials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "product_trials_live_account_product_idx" ON "product_trials" USING btree ("user_id","product") WHERE "product_trials"."state" <> 'released';--> statement-breakpoint
CREATE UNIQUE INDEX "product_trials_request_idx" ON "product_trials" USING btree ("user_id","product","request_key");--> statement-breakpoint
CREATE UNIQUE INDEX "product_trials_job_idx" ON "product_trials" USING btree ("user_id","product","job_id");