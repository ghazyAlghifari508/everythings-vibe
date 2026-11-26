DO $migration$
BEGIN
  -- Older Studio deployments can skip main migrations with lower recorded timestamps.
  IF to_regclass('codebase_sync_requests') IS NULL THEN
    CREATE TABLE "codebase_sync_requests" (
      "id" text PRIMARY KEY NOT NULL,
      "user_id" text NOT NULL,
      "codebase_id" text NOT NULL,
      "session_id" text NOT NULL,
      "created_at" timestamp DEFAULT now()
    );
    ALTER TABLE "codebase_sync_requests" ADD CONSTRAINT "codebase_sync_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
    ALTER TABLE "codebase_sync_requests" ADD CONSTRAINT "codebase_sync_requests_codebase_id_codebases_id_fk" FOREIGN KEY ("codebase_id") REFERENCES "public"."codebases"("id") ON DELETE cascade ON UPDATE no action;
    ALTER TABLE "codebase_sync_requests" ADD CONSTRAINT "codebase_sync_requests_session_id_codebase_sync_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."codebase_sync_sessions"("id") ON DELETE cascade ON UPDATE no action;
    CREATE INDEX "codebase_sync_requests_owner_idx" ON "codebase_sync_requests" USING btree ("user_id", "codebase_id");
  END IF;

  ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "workspace_event" jsonb;
  ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "archived_at" timestamp;
  CREATE INDEX IF NOT EXISTS "projects_user_id_archived_at_idx" ON "projects" USING btree ("user_id", "archived_at");
  -- Feature migrations 0046-0048 may already be applied on deployed databases.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'studio_frames' AND column_name = 'origin_job_id'
  ) THEN
    ALTER TABLE "studio_frames" ADD COLUMN "origin_job_id" text;
    ALTER TABLE "studio_frames" ADD COLUMN "initial_slot" integer;
    ALTER TABLE "studio_frames" ADD COLUMN "revision" integer DEFAULT 0 NOT NULL;
    ALTER TABLE "studio_frames" ADD COLUMN "last_job_id" text;
    ALTER TABLE "studio_jobs" ADD COLUMN "request_id" text;
    ALTER TABLE "studio_jobs" ADD COLUMN "request_hash" text;
    ALTER TABLE "studio_jobs" ADD COLUMN "operation_intent" text;
    ALTER TABLE "studio_jobs" ADD COLUMN "operation_index" integer;
    ALTER TABLE "studio_jobs" ADD COLUMN "blueprint_job_id" text;
    ALTER TABLE "studio_jobs" ADD COLUMN "depends_on_job_id" text;
    ALTER TABLE "studio_jobs" ADD COLUMN "base_revision" integer;
    ALTER TABLE "studio_jobs" ADD COLUMN "planning_completed_at" timestamp with time zone;
    ALTER TABLE "studio_jobs" ADD COLUMN "error_code" text;
    ALTER TABLE "studio_revisions" ADD COLUMN "frame_id" text;
    ALTER TABLE "studio_revisions" ADD COLUMN "frame_revision" integer;
    ALTER TABLE "studio_revisions" ADD COLUMN "job_id" text;
    CREATE INDEX "studio_frames_origin_idx" ON "studio_frames" USING btree ("origin_job_id");
    CREATE UNIQUE INDEX "studio_frames_initial_slot_idx" ON "studio_frames" USING btree ("origin_job_id", "initial_slot");
    CREATE UNIQUE INDEX "studio_jobs_request_part_idx" ON "studio_jobs" USING btree ("project_id", "user_id", "request_id", "operation_index");
    CREATE INDEX "studio_jobs_dependency_idx" ON "studio_jobs" USING btree ("depends_on_job_id");

    -- Stop workers before migration; old writers do not enforce frame versions.
    UPDATE studio_frames SET revision = 1 WHERE html_code IS NOT NULL;

    WITH origins AS (
      SELECT DISTINCT ON (j.target_frame_id) j.target_frame_id, j.id
      FROM studio_jobs j JOIN studio_projects p ON p.id = j.project_id AND p.user_id = j.user_id
      WHERE j.job_type = 'add' AND j.target_frame_id IS NOT NULL
      ORDER BY j.target_frame_id, j.created_at, j.id
    )
    UPDATE studio_frames f SET origin_job_id = origins.id
    FROM origins WHERE f.id = origins.target_frame_id;

    WITH initial AS (
      SELECT project_id, min(id) AS id FROM studio_jobs WHERE job_type = 'initial'
      GROUP BY project_id HAVING count(*) = 1
    ), slots AS (
      SELECT f.id, initial.id AS job_id,
        row_number() OVER (PARTITION BY initial.id ORDER BY f."order", f.id) - 1 AS slot
      FROM studio_frames f JOIN initial ON initial.project_id = f.project_id
      JOIN studio_projects p ON p.id = f.project_id
      JOIN studio_jobs j ON j.id = initial.id AND j.user_id = p.user_id
      WHERE f.origin_job_id IS NULL
    )
    UPDATE studio_frames f SET origin_job_id = slots.job_id, initial_slot = slots.slot
    FROM slots WHERE f.id = slots.id;

    UPDATE studio_jobs j SET planning_completed_at = p.updated_at
    FROM studio_projects p WHERE j.project_id = p.id AND j.user_id = p.user_id
      AND j.job_type = 'initial' AND p.design_blueprint IS NOT NULL;

    UPDATE studio_jobs j SET blueprint_job_id = initial.id
    FROM studio_jobs initial WHERE j.project_id = initial.project_id AND j.user_id = initial.user_id
      AND j.job_type <> 'initial' AND initial.job_type = 'initial'
      AND NOT EXISTS (SELECT 1 FROM studio_jobs other WHERE other.project_id = initial.project_id
        AND other.user_id = initial.user_id AND other.job_type = 'initial' AND other.id <> initial.id);

    UPDATE studio_jobs j SET status = 'failed', error_code = 'STUDIO_DEPENDENCY_FAILED',
      error = 'Operasi legacy belum memiliki versi target yang aman. Kirim ulang permintaan.',
      finished_at = clock_timestamp(), claimed_by = NULL, claimed_at = NULL, lease_expires_at = NULL
    WHERE j.job_type <> 'initial' AND j.status IN ('queued', 'planning', 'generating');
  END IF;

  IF to_regclass('studio_messages') IS NULL THEN
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
    ALTER TABLE "studio_messages" ADD CONSTRAINT "studio_messages_project_id_studio_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."studio_projects"("id") ON DELETE cascade ON UPDATE no action;
    ALTER TABLE "studio_messages" ADD CONSTRAINT "studio_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
    CREATE UNIQUE INDEX "studio_messages_operation_role_idx" ON "studio_messages" USING btree ("project_id", "user_id", "operation_id", "role");
    CREATE UNIQUE INDEX "studio_messages_project_order_idx" ON "studio_messages" USING btree ("project_id", "order");
    CREATE INDEX "studio_messages_owner_idx" ON "studio_messages" USING btree ("user_id", "project_id");

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

    -- Projects predating durable jobs retain their real revision prompts, without invented assistant turns.
    WITH legacy AS (
      SELECT r.*, p.user_id, row_number() OVER (PARTITION BY p.id ORDER BY r.version, r.created_at, r.id) - 1 AS position
      FROM studio_revisions r JOIN studio_projects p ON p.id = r.project_id
      WHERE NOT EXISTS (SELECT 1 FROM studio_jobs j WHERE j.project_id = p.id AND j.user_id = p.user_id)
    )
    INSERT INTO studio_messages (id, project_id, user_id, operation_id, job_ids, role, content, "order", status, created_at)
    SELECT 'history-revision-' || id, project_id, user_id, id, '[]'::jsonb, 'user', prompt, position, 'accepted', created_at FROM legacy
    ON CONFLICT DO NOTHING;
  END IF;

  IF to_regclass('studio_element_revisions') IS NULL THEN
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
    ALTER TABLE "studio_element_revisions" ADD CONSTRAINT "studio_element_revisions_project_id_studio_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."studio_projects"("id") ON DELETE cascade ON UPDATE no action;
    ALTER TABLE "studio_element_revisions" ADD CONSTRAINT "studio_element_revisions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
    ALTER TABLE "studio_element_revisions" ADD CONSTRAINT "studio_element_revisions_frame_id_studio_frames_id_fk" FOREIGN KEY ("frame_id") REFERENCES "public"."studio_frames"("id") ON DELETE cascade ON UPDATE no action;
    CREATE UNIQUE INDEX "studio_element_revisions_request_idx" ON "studio_element_revisions" USING btree ("user_id", "project_id", "request_id");
    CREATE INDEX "studio_element_revisions_frame_idx" ON "studio_element_revisions" USING btree ("user_id", "project_id", "frame_id");
  END IF;
END;
$migration$;