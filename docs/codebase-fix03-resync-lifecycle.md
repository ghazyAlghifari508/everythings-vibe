# FIX 03: Existing Codebase Resync Lifecycle

## Root cause and original conflict

The workspace routed `Sync ulang` through `startSession("retry")`, sending
`sessionId: activeSessionId`, including `null` before status reconciliation.
The session endpoint accepts an omitted session ID or a non-empty string, not
`null`. When given the completed session ID, the replacement path correctly
refused to replace an uploaded snapshot (`409 SYNC_SNAPSHOT_UPLOADED`). Neither
response meant that a genuine new resync was forbidden. The client had conflated
resync, credential replacement, and recovery, then collapsed their responses
into a generic session-creation error.

## Operations and API

`POST /api/codebases/:id/session` retains the initial/recovery contract and adds:

```json
{ "action": "resync", "requestId": "<UUID>" }
```

- `recover`: inspect the existing attempt; never mint or recover a raw secret.
- `retry` with the authoritative `sessionId`: explicitly replace an unused or
  failed attempt; never revoke a connected CLI or an uploaded snapshot.
- `resync`: create a new session under the same codebase after a finished attempt,
  or restore an already accepted/active logical attempt.

A new response contains `codebaseId`, legacy `projectId` (the same codebase ID),
`requestId`, `sessionId`, `status`, expiry, CLI command/version, API origin, and
one-time `syncToken`. A replay contains safe session metadata, never that token.
Initial requests omit `sessionId`; a resync never relies on a stale browser ID.
Recoverable 409 responses select their authoritative session and trigger the
existing status reconciliation, rather than displaying a generic failure.
Genuine preparation failures remain 503 with a functional retry.

## Idempotency and concurrency

Migration `0046_codebase_resync_requests.sql` adds `codebase_sync_requests` with
owner/codebase/session foreign keys, a primary request hash, and an owner index.
Drizzle schema, snapshot metadata, and migration journal are included.

The request key hashes `(userId, codebaseId, "resync", requestId)`. A transaction
locks the codebase, checks a durable alias, locks/rereads the latest session using
the same advisory lock as handshake, and either restores it or creates one
session. Different tabs' request keys alias the same active attempt. A completed
request replay stays on that attempt; only a new request identity can start the
next attempt. Explicit unused-token replacement updates aliases transactionally.

The client single-flight guard prevents double-click requests. Only a request UUID
is stored locally, allowing network retry/refresh to restore the accepted
operation. Raw credentials remain in component memory, never browser storage or
URLs. A lost one-time prompt is not reconstructed: an unused session can be
explicitly replaced; a live CLI continues without credential rotation.

## Snapshot, analysis, and planning invariants

- Same codebase and History entry; each genuine resync gets a new session/token.
- Snapshots and analyses are append-only. Existing Feature/PRD/AC/Task revisions,
  Kanban progress, and generation-context links remain unchanged.
- `readWorkspaceSnapshot` selects the newest uploaded/context-eligible snapshot
  with a readable, identity-matching ready analysis on the owned anchor project.
  Before any ready analysis exists, it retains the first uploaded snapshot for
  initial onboarding recovery.
- Loader and polling/SSE share this selection via `workspaceSnapshotId`, while
  `snapshotId` continues to identify the queried transport attempt. The client
  analyzes the new uploaded snapshot without discarding the prior usable context.
- Failed, pending, or identity-mismatched analysis cannot promote a new snapshot.
- `Selesai` requires the active session's uploaded snapshot plus ready analysis ID;
  upload alone or an old session cannot unlock it.
- Existing planning links remain pinned to their prior snapshots. Saved documents
  stay readable; this fix does not rewrite their generation context or revisions.

## Credits and security

Opening the modal, creating/restoring a prompt, and reading status do not charge
or run analysis. Upload completion initiates the existing analysis boundary.
Credit reservation/settlement/release policy and pricing remain unchanged;
duplicate analysis requests reuse existing persisted results and do not debit
again. Restricted accounts cannot create a new attempt, but restriction never
hides an already accepted operation. Existing exemption handling is reused.

Ownership guards precede session mutation. New tokens use the existing secure
random generator and server-side hash/expiry checks. Replays never expose hashes
or secrets; explicit replacement invalidates the old credential. Handshake and
replacement share locking so an in-flight upload cannot be silently revoked.

## Verification

19 targeted test files, 249 tests passed. Coverage of P3's 24 requirements:

| P3 cases | Evidence |
| --- | --- |
| 1–11, 13 | `resync-session.integration.test.ts`: successful new session, no 409, unchanged snapshots/analysis/plans/tasks/context, one History row, fresh credential/hash, concurrent duplicate requests resolve once |
| 12, 15 | Durable replay before/after completion; fresh request starts next attempt; `resync-concurrency.integration.test.ts` covers real uploaded/ready-analysis completion |
| 14, 16–17 | Active CLI replacement refused; expired unused replacement; stale session reconciliation; handshake racing a different tab |
| 18 | `use-codebase-resync.test.tsx`: omitted null session ID and persisted request UUID reused on network retry/refresh |
| 19 | Owner/unauthenticated integration rejection; production HTTP session endpoint returned 401 without authentication |
| 20 | Official CLI upload/analysis replay plus existing real PostgreSQL credit concurrency/release tests |
| 21–22 | Failed/mismatched analysis retains old workspace; ready identity-consistent analysis promotes new snapshot |
| 23–24 | Official CLI client performs initial sync and resync over real local HTTP, manifest/file chunks/completion backed by isolated PostgreSQL |

The CLI smoke uses a deterministic analysis-generator seam, not an external AI
provider. Transport, database persistence, analysis validation, and credit
settlement are real. Production server was launched and exercised through HTTP.
No browser, Playwright, Puppeteer, screenshot QA, or subagent was used.

`pnpm build` passed. Vite reported Node-module externalization warnings involving
`pg`; this record does not claim browser-bundle audit coverage.

Standard `pnpm exec tsc --noEmit` reports an unrelated existing library-target
mismatch at `src/features/studio/tests/studio-composer.test.tsx:241`
(`Promise.withResolvers`, TS2550). That file/configuration was not changed.

## Rollout and compatibility

Apply `pnpm db:migrate` before running the new server code. Migration was exercised
only in isolated test schemas; public database deployment is not part of this fix.
The published CLI protocol/commands are unchanged and exercised using the official
client source. No CLI republish is required for this server/browser lifecycle fix.
No publish, merge, or deployment was performed.

`pnpm exec tsc --noEmit --lib es2024,dom,dom.iterable` passed without changing
repository compiler settings. Targeted Biome checks cover all touched TypeScript
files and migration metadata. Production changes are confined to the codebase
session contract/preparation, workspace snapshot/status/loader, workspace hooks,
existing resync modal lifecycle wiring, and the added request-alias schema.

This record supersedes older lifecycle descriptions where resync was described
as replacing the uploaded session. FIX 04 visual presentation remains out of scope.
