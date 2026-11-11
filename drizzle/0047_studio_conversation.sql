CREATE TABLE "studio_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"user_id" text NOT NULL,
	"operation_id" text NOT NULL,
	"job_ids" jsonb NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"order" integer NOT NULL,
	"status" text NOT NULL,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"progress" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "studio_messages" ADD CONSTRAINT "studio_messages_project_id_studio_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."studio_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_messages" ADD CONSTRAINT "studio_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "studio_messages_operation_role_idx" ON "studio_messages" USING btree ("project_id","user_id","operation_id","role");--> statement-breakpoint
CREATE UNIQUE INDEX "studio_messages_project_order_idx" ON "studio_messages" USING btree ("project_id","order");--> statement-breakpoint
CREATE INDEX "studio_messages_owner_idx" ON "studio_messages" USING btree ("user_id","project_id");
--> statement-breakpoint
-- Existing jobs become one turn per request, never one duplicate per target job.
WITH operations AS (
	SELECT j.project_id, j.user_id, coalesce(j.request_id, j.id) AS operation_id,
		array_agg(j.id ORDER BY j.operation_index NULLS FIRST, j.created_at, j.id) AS job_ids,
		(array_agg(j.prompt ORDER BY j.created_at, j.id))[1] AS prompt,
		min(j.created_at) AS created_at,
		CASE WHEN bool_or(j.status = 'planning') THEN 'planning'
			WHEN bool_or(j.status = 'generating') THEN 'generating'
			WHEN bool_or(j.status = 'queued') THEN 'queued'
			WHEN bool_and(j.status = 'completed') THEN 'completed'
			WHEN bool_or(j.status IN ('completed', 'partial')) THEN 'partial'
			ELSE 'failed' END AS status
	FROM studio_jobs j JOIN studio_projects p ON p.id = j.project_id AND p.user_id = j.user_id
	GROUP BY j.project_id, j.user_id, coalesce(j.request_id, j.id)
), turns AS (
	SELECT *, (row_number() OVER (PARTITION BY project_id ORDER BY created_at, operation_id) - 1) * 2 AS position
	FROM operations
)
INSERT INTO studio_messages (id, project_id, user_id, operation_id, job_ids, role, content, "order", status, created_at)
SELECT 'history-user-' || operation_id, project_id, user_id, operation_id, to_jsonb(job_ids), 'user', prompt, position, 'accepted', created_at FROM turns
UNION ALL
SELECT 'history-assistant-' || operation_id, project_id, user_id, operation_id, to_jsonb(job_ids), 'assistant',
	CASE status WHEN 'queued' THEN 'Permintaan tersimpan dan menunggu giliran.'
		WHEN 'planning' THEN 'Sedang menyusun rencana layar.'
		WHEN 'generating' THEN 'Pemrosesan desain sedang berjalan.'
		WHEN 'completed' THEN 'Pemrosesan operasi pada riwayat telah berakhir.'
		WHEN 'partial' THEN 'Sebagian operasi pada riwayat belum berhasil. Periksa halaman di canvas.'
		ELSE 'Operasi pada riwayat belum berhasil. Pulihkan halaman di canvas.' END,
	position + 1, status, created_at FROM turns
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- Projects predating durable jobs retain their real revision prompts, without invented assistant turns.
WITH legacy AS (
	SELECT r.*, p.user_id, row_number() OVER (PARTITION BY p.id ORDER BY r.version, r.created_at, r.id) - 1 AS position
	FROM studio_revisions r JOIN studio_projects p ON p.id = r.project_id
	WHERE NOT EXISTS (SELECT 1 FROM studio_jobs j WHERE j.project_id = p.id AND j.user_id = p.user_id)
)
INSERT INTO studio_messages (id, project_id, user_id, operation_id, job_ids, role, content, "order", status, created_at)
SELECT 'history-revision-' || id, project_id, user_id, id, '[]'::jsonb, 'user', prompt, position, 'accepted', created_at FROM legacy
ON CONFLICT DO NOTHING;