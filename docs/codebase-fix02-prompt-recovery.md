# Existing Codebase — FIX 02 Prompt Recovery Record

Scope: recovery of an unfinished existing-codebase sync when the user leaves
`/plan/codebase` and comes back through History. Final contract: recover the
SAME repository, never create another.

## 1. Root cause

`useOnboardingRecovery` treated "waiting for the CLI, but the raw one-time
credential is not in this browser" as `POST /session { action: "recover" }` →
`409 CODEBASE_SESSION_RECOVERY_REQUIRED` → `setError(message)`.

The raw credential is returned exactly once (only the hash is stored), so a
route navigation that unmounts the page lost it, and the recovery path was
presented as a failed sync with a generic `Coba lagi`. Nothing had failed: the
repository, session, snapshot, and History entry were all intact.

## 2. Token recovery limits

- The server never stores the raw credential and the hash is not reversible.
- A browser reload creates a new JS realm; in-memory prompts are gone.
- Therefore credential recovery is only possible for **the same running app
  instance**, and only until the server-reported `expiresAt`.

## 3. Decision: memory-only vault

`src/features/codebase/services/sync-prompt-vault.ts`

- One entry per codebase (`Map<codebaseId, { payload, expiresAtMs }>`), private
  to the module; nothing is serialized.
- Browser only (`typeof window` guard), so a server module instance can never
  retain a tenant credential across requests.
- Read validates expiry and session identity; a mismatch deletes the entry
  (replacement, never reuse).
- Cleared on logout (`navbar`), on a fresh start, on a stale pointer, and
  overwritten on replacement.
- Tenant isolation is still enforced by the server: the vault is only consulted
  after `GET /status` confirmed the signed-in user owns the codebase.
- No localStorage, sessionStorage, URL, loader data, log, or analytics ever
  receive the token.

## 4. Recovery decision tree (authoritative status first)

| Server status | Prompt in vault | Behaviour |
| --- | --- | --- |
| `waiting_for_cli` | valid, same session | show the SAME prompt; no request, no rotation |
| `waiting_for_cli` | missing / expired / other session | `PROMPT_UNAVAILABLE` — explicit **Buat prompt baru** |
| `expired` | — | `PROMPT_EXPIRED` — explicit **Buat prompt baru** |
| `connected`…`uploading` | — | live progress; no replacement action |
| `uploaded` / `analyzing` / `ready` | — | transport-done + analysis lifecycle; no new token |

Recovery never mints and never revokes. Replacement is the user's click.

## 5. Replacement protocol

`POST /api/codebases/:id/session { action: "retry", sessionId }`

Inside one transaction with `pg_advisory_xact_lock(hashtext(codebaseId))` plus
the session handshake lock:

1. Ownership: codebase `user_id` and latest session `user_id`.
2. `sessionId` must equal the latest session, otherwise
   `409 SYNC_SESSION_STALE` (no mint, no revoke; the caller re-reads).
3. Reject when a snapshot upload already completed (`uploaded`/`analyzing`/
   `ready`, or a stored `uploaded`/`ready` snapshot) → `409 SYNC_SNAPSHOT_UPLOADED`.
4. Reject while a CLI is live (`connected`/`scanning`/`filtering`/`uploading`),
   regardless of credential usability → `409 SYNC_SESSION_ACTIVE`.
5. Otherwise revoke the named waiting credential (`status: expired`,
   `consumedAt`) and insert a new session under the SAME codebase with the next
   `attempt`.

`action: "recover"` returns metadata only and never mints; a codebase with no
session answers `404 NO_SYNC_SESSION`. Double clicks, lost responses, and
concurrent tabs therefore converge on the same repository: one request wins, the
other gets `SYNC_SESSION_STALE`, and no duplicate codebase can be created.

## 6. Frontend state ownership

`promptRecovery: { code: PROMPT_UNAVAILABLE | PROMPT_EXPIRED, sessionId }` is
separate from `error` and is rendered through the existing
`LockedPromptStateView` inside `ScreenConnectPromptStep` (no new layout):
one action, `Buat prompt baru`. Credit eligibility still outranks it, and it is
cleared as soon as real CLI activity, an upload, or a replacement lands.
`SYNC_SESSION_ACTIVE` / `SYNC_SNAPSHOT_UPLOADED` / `SYNC_SESSION_STALE` are
mapped to a status re-read, never to an error or a replacement prompt.

FIX 03 (`docs/codebase-fix03-recovery-presentation.md`) owns the wording and the
layout of these states, adds the pending/failed variants, and removes the sync
header's repository eyebrow. The state machine above is unchanged.

## 7. Tests

- `tests/sync-prompt-vault.test.ts` — same-instance reuse, session mismatch,
  expiry, clear, SSR guard, no browser storage.
- `tests/onboarding-recovery-lifecycle.test.tsx` — vault reuse without a
  `/session` request; missing prompt is recoverable and not an error; expired
  session offers recovery without rotation.
- `tests/onboarding-idempotency-ui.test.tsx` — lost create response stays on the
  same repository attempt; reload + explicit replacement; same-instance reuse.
- `tests/onboarding-replacement.integration.test.ts` — PostgreSQL: one history
  row, revoked old credential, valid new credential (real CLI handshake), active
  CLI and uploaded snapshot cannot be replaced, credits untouched, cross-user
  404.
- `tests/sync-eligibility.integration.test.ts` — concurrent replacement yields
  one mint and one `SYNC_SESSION_STALE`.

## 8. CLI compatibility

No CLI change. The CLI still receives the raw credential only in the prompt;
replacement invalidates the previous waiting credential, so a stale prompt fails
the handshake with the existing `SYNC_CREDENTIAL_REVOKED`/`SYNC_SESSION_EXPIRED`
codes and the CLI already instructs the user to fetch a new token.