-- Provenance for `studio_projects.title`. The planning step may replace the
-- provisional title it cut from the brief, but it must never overwrite a name a
-- person typed through the rename dialog. Only rows still marked 'auto' are
-- eligible, and the column defaults to 'user' so a writer that forgets it is
-- protected rather than silently clobbered.
ALTER TABLE "studio_projects" ADD COLUMN IF NOT EXISTS "title_source" text DEFAULT 'user' NOT NULL;
