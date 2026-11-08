CREATE TABLE "codebase_sync_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"codebase_id" text NOT NULL,
	"session_id" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "codebase_sync_requests" ADD CONSTRAINT "codebase_sync_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "codebase_sync_requests" ADD CONSTRAINT "codebase_sync_requests_codebase_id_codebases_id_fk" FOREIGN KEY ("codebase_id") REFERENCES "public"."codebases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "codebase_sync_requests" ADD CONSTRAINT "codebase_sync_requests_session_id_codebase_sync_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."codebase_sync_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "codebase_sync_requests_owner_idx" ON "codebase_sync_requests" USING btree ("user_id","codebase_id");