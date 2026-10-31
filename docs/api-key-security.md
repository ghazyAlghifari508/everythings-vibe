# Handoff credential boundaries

Greenfield handoff uses `api_keys`: random 256-bit secrets, SHA-256 lookup, and
only `read:project`, `write:task:status`, `write:subtask:status`. New automatic keys
expire after 30 days by default, accommodating multi-phase implementation and
human checkpoints. `AUTO_API_KEY_TTL_DAYS` accepts integer days clamped to 1–90;
invalid input falls back to 30. Re-handoff creates a fresh secret without changing
existing deadlines or renewing expired credentials. No migration invalidates
legacy or manual keys.

Issuance serializes per owner in a transaction and removes only already-expired
automatic rows. Repeated handoffs can still produce multiple active keys within
the TTL; there is no active-key cap that would interrupt another agent. The UI
does not automatically retry issuance. Settings lists source, deadline, and last
use, and supports immediate owner-scoped revocation. Explicit cleanup assigns
legacy automatic keys without expiry a deadline controlled by
`AUTO_API_KEY_SUPERSEDE_GRACE_HOURS` (default 72, bounds 0–168), then deletes
expired rows. This is deliberate user action, not automatic revocation on deploy.
Manual keys without expiry are not cleanup targets.

## Project scoping dependency

Automatic API keys remain **owner-scoped, not project-scoped**. A project name or
prompt project ID is not an authorization boundary. `api_keys` has no project
binding and `/api/settings/api-keys/auto` takes no project ID. Public project
reads and task/subtask writes require the appropriate scope plus project
ownership; a key can therefore operate on other projects belonging to its owner.
True project isolation requires a persisted binding, validated issuance input,
and enforcement across direct project reads and task-ID-based writes, with
legacy unbound-key compatibility. This change does not fake that isolation or
silently change existing CLI authorization semantics.

## Secret exposure and compatibility

Raw keys are returned once with `Cache-Control: no-store`, never in list/loader
projections. The handoff necessarily shares a bearer secret with an external
agent through copied text. Only trusted agents should receive it. Browser state
is cleared when the dialog closes; clipboard and external agent retention remain
outside application control. The current CLI accepts `login --api-key` and
persists credentials in its user config (restricted file mode where supported).
Command arguments may appear in shell history/process inspection. Do not commit,
log, or paste the prompt publicly; revoke access after work. A hidden interactive
CLI login exists, but unattended secure provisioning is not introduced here.
A 401 requires explicit re-handoff/login, not silent renewal.

Existing Codebase synchronization remains a different credential: a hash in
`codebase_sync_sessions`, bound to codebase/session/attempt with its own expiry
and revocation. It is not interchangeable with an API key. Its one-time issuance
response also uses no-store.

## Verification boundaries

Focused tests cover hashing, one-time response projections, expiry (including the
exact boundary and corrupt dates), missing/revoked keys, scopes, ownership SQL,
legacy compatibility, repeated handler issuance, no-store headers,
Settings secret visibility, and literal handoff substitution. Issuance tests use
a mocked database boundary and assert transaction/lock SQL; they are **not** a
live PostgreSQL concurrency stress test. Concurrent dynamic-import execution in
the current Vitest mock harness escaped the DB mock; the attempted inserts failed
on the fixture owner's foreign-key constraint. No fixture user was created and
no successful credential insert was observed. A properly isolated database test
is still needed before claiming concurrent execution verification. A temporary
PostgreSQL cluster subsequently accepted concurrent issuance, but its raw `pg`
verification query parsed timezone-less timestamps in local time. That comparison
is not evidence of a production expiry defect: Drizzle's timestamp mapper reads
those values as UTC. `api-key-timestamp.test.ts` verifies that mapping without a
schema change or invalidating legacy credentials. The isolated concurrency test
still needs a retained, safe harness with ORM-based verification.
CLI config/client/task/export and sync handshake/upload suites provide
compatibility evidence. No browser QA is used.
