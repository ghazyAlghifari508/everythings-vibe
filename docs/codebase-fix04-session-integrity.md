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
