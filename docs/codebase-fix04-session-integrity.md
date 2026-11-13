# FIX 04: Re-sync Session and Attempt Integrity

## Transaction diagnosis

The configured runtime database had applied migration `0045` but not
`0046_codebase_resync_requests`. Read-only introspection found
`to_regclass('codebase_sync_requests') = null`. A read-only lookup against the
missing relation produced PostgreSQL SQLSTATE `42P01` (`parserOpenTable`).
`prepareResyncSession` reads this table before minting or aliasing a session;
the transaction therefore fails before returning a prompt. The endpoint correctly
returns HTTP 503, but previously logged only `error.name`, hiding the database
cause. This is reproduced schema drift in the configured database, not evidence
that every historical 503 had the same cause.

With explicit permission, `pnpm db:migrate` applied the existing migration through
the normal Drizzle migrator. No manual business-data/status updates, new migration,
or forced success response were used.

Session preparation now logs the existing safe error serializer's cause chain and
SQLSTATE, together with action/request/session/codebase identity. SQL, parameters,
messages, stacks, raw credentials and credential hashes are excluded. Failures
remain `503 CODEBASE_SESSION_REPLACEMENT_FAILED`, with `Cache-Control: no-store`.

## Server session lifecycle

- A retry must name its session; an unbound retry is rejected with HTTP 400.
- Re-sync identity hashes `(userId, codebaseId, "resync", requestId)`. The
  codebase transaction lock serializes same-request retries and different tabs.
  A durable alias restores the same attempt without reissuing its secret.
- Expired, unused `waiting_for_cli` sessions are reconciled under the handshake
  lock, including on request replay. A fresh request can then create one new
  attempt instead of restoring an unusable waiting session forever.
- Connected/scanning/filtering/uploading credentials are not replaced by this
  reconciliation. Handshake and replacement still share their existing lock.
- Explicit replacement updates the request aliases in the same transaction and
  invalidates only the named unused/failed credential. Stale callers receive the
  authoritative session instead of revoking a newer credential.
- Recovery conflicts include safe session metadata, allowing the client to
  distinguish running, uploaded, expired and unavailable-prompt states.
- Existing snapshots, analyses, repository identity, plans and artifacts remain
  untouched by session preparation. Credit preflight/guards remain enforced;
  session creation and recovery do not charge credits.

## Backend verification

`resync-recovery.integration.test.ts` adds regression coverage for explicit retry
identity, time-based expiration and concurrent recovery, active CLI preservation,
retry after a failure reported through the real CLI API, and safe nested
PostgreSQL error diagnostics/HTTP 503 propagation. The fixture uses an isolated
PostgreSQL schema; expiration advances the clock and CLI failure uses the service
boundary instead of manually marking an attempt successful.

Targeted run: `resync-recovery.integration.test.ts`,
`resync-concurrency.integration.test.ts`, `resync-session.integration.test.ts`:
**3 files, 12 tests passed**. Targeted Biome check passed for the five backend files.

No browser, Playwright, Puppeteer, external AI provider or subagent was used.

## Current-attempt integrity

- Opening re-sync clears only transport/prompt state. An explicit session response
  must verify the new identity before status reads resume. A request-generation
  fence rejects late session/status replies, including repository switches.
- The browser persists only the request ID. Double clicks single-flight locally;
  network errors and the bounded session-request timeout retain that ID for retry.
  Reopening a verified active attempt reuses it. Reopening a finished attempt
  starts a fresh request ID and discards the old in-memory prompt.
  A completed durable replay on reload is checked through the pinned status API;
  it cannot paint the previous completion as a freshly opened attempt. Only one
  bounded follow-up request is allowed; active/awaiting-analysis recovery is reused.
- Polling, SSE reconciliation triggers, recovered seeds and modal progress require
  matching codebase/session identity. Status cannot supply its own completion
  identity. `Selesai` requires that attempt's verified snapshot and readable ready
  analysis; preparing/error/unbound states remain disabled.
- Completed transport no longer offers a spent prompt for copying. Active CLI
  recovery shows progress without rotating its credential. Lost unused prompts,
  expired attempts and creation failures retain their contextual recovery actions.
- The latest server-verified workspace snapshot is retained independently of
  current transport status. Starting/failing a later attempt cannot roll the
  workspace back to its older loader snapshot or remove its usable analysis.

## Failed-analysis reservation recovery

Service-boundary failure/retry coverage exposed a missing projection:
`getCreditOperation()` omitted `analysisReference`. The existing failure guard
therefore could not prove ownership of a running reservation, left it running,
and a retry returned HTTP 409. Returning the stored reference lets that unchanged
guard release only its exact failed attempt. Credit guards, settlement and tenant
filters are unchanged. The regression uploads through real CLI service handlers,
injects a provider failure, then retries through the analysis API.

## Required scenario evidence

All paths below are under `src/features/codebase/tests/`.

| P4 scenario | Coverage |
| --- | --- |
| 1. Initial sync then fresh re-sync | `resync-cli.integration.test.ts`, `resync-session.integration.test.ts` |
| 2. Old status cannot complete a new attempt | `resync-attempt-isolation.test.tsx`, `resync-attempt-gate.test.tsx`, `resync-status.integration.test.ts` |
| 3. Honest waiting state | `resync-status.integration.test.ts`, `resync-modal-lifecycle.test.tsx` |
| 4. Duplicate clicks/request replay/tabs | `resync-attempt-isolation.test.tsx`, `resync-session.integration.test.ts`, `resync-concurrency.integration.test.ts` |
| 5. Session creation failure | `resync-attempt-isolation.test.tsx`, `use-codebase-resync.test.tsx` |
| 6. HTTP 503 propagation and safe SQLSTATE | `resync-recovery.integration.test.ts` |
| 7. Active recovery without credential rotation | `resync-recovery.integration.test.ts`, `resync-concurrency.integration.test.ts`, `use-codebase-resync.test.tsx` |
| 8. Expired session recovery | `resync-recovery.integration.test.ts` |
| 9. Failed session retry | `resync-recovery.integration.test.ts`, `use-codebase-resync.test.tsx` |
| 10. Stale response/seed rejection | `resync-attempt-isolation.test.tsx`, `resync-status-seed.test.tsx`, `resync-reload.test.tsx`, `use-codebase-sync-status.test.tsx`, `use-codebase-sync-stream.test.tsx` |
| 11. SSE/polling consistency | `resync-status.integration.test.ts`, `use-codebase-sync-stream.test.tsx` |
| 12. Snapshot retention | `resync-session.integration.test.ts`, `resync-snapshot-retention.test.tsx`, `resync-analysis-retry.integration.test.ts` |
| 13. Planning/answers/handoff preservation | `resync-session.integration.test.ts`, `workspace-analysis-reconciliation.test.tsx` |
| 14. Current-attempt completion gate | `resync-status.integration.test.ts`, `resync-ready-gate.test.ts`, `resync-attempt-gate.test.tsx`, `resync-modal-verification.test.tsx` |
| 15. No duplicate credit charge | `resync-status.integration.test.ts`, `resync-cli.integration.test.ts`, `resync-session.integration.test.ts` |
| 16. No leaked credentials | `resync-status.integration.test.ts`, `resync-recovery.integration.test.ts`, `use-codebase-resync.test.tsx` |

Integration fixtures seed prior saved state in isolated schemas; new successful
sync/analysis transitions use service/API boundaries, not direct status updates.
Preservation checks compare repository identity, snapshots, feature tree, project
step, PRD, AC, tasks, generation context and saved handoff/answers after re-sync.
The existing planning-snapshot warning remains wired to the retained source ID.

## Final verification

- Final targeted P4 run: **19 files, 98 tests passed**.
- Targeted Biome check: **26 files passed**.
- `pnpm exec tsc --noEmit --lib es2024,dom,dom.iterable`: passed.
- Default `pnpm exec tsc --noEmit` also found an unrelated existing library-target
  mismatch: `Promise.withResolvers` in `src/features/studio/tests/studio-composer.test.tsx:241`.
  Studio code and TypeScript configuration were not changed.
- No browser/manual visual QA, Playwright, Puppeteer, live AI-provider request,
  subagent, merge or deployment.
