ALTER TABLE "credit_operations" ADD COLUMN IF NOT EXISTS "is_exempt" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_operations" ADD COLUMN IF NOT EXISTS "exemption_reason" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "billing_exempt" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "billing_exemption_reason" text;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "billing_exemption_audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"action" text NOT NULL,
	"reason" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "billing_exemption_audit_logs_user_id_idx" ON "billing_exemption_audit_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "billing_exemption_audit_logs_actor_id_idx" ON "billing_exemption_audit_logs" USING btree ("actor_id");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "billing_exemption_audit_logs" ADD CONSTRAINT "billing_exemption_audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "billing_exemption_audit_logs" ADD CONSTRAINT "billing_exemption_audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
