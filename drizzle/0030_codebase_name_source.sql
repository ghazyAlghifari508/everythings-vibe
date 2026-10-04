-- Provenance for `codebases.name`. Auto-naming (repository folder name reported
-- by the CLI at sync handshake) may only replace a name the system chose, so a
-- custom user rename is never overwritten.
--
-- The column defaults to 'user' on purpose: a writer that forgets to set it is
-- protected rather than silently clobbered by the next sync.
ALTER TABLE "codebases"
  ADD COLUMN "name_source" text DEFAULT 'user' NOT NULL;

-- Only rows still holding the untouched placeholder are eligible for
-- auto-naming. Every other row already carries a name a person chose (an
-- explicit name input, a composer message) or renamed through the library, so
-- it is marked 'user' and protected. Nothing is guessed from analysis text,
-- file names, or snapshot contents.
UPDATE "codebases"
SET "name_source" = 'auto'
WHERE "name" = 'Repository Lokal';