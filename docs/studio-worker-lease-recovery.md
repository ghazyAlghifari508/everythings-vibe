# Studio worker lease, heartbeat, and recovery

The durable Studio worker claims a job with a PostgreSQL lease
(`STUDIO_JOB_CLAIM_TTL_MS`), renews it from a heartbeat
(`STUDIO_JOB_HEARTBEAT_MS`), and aborts the in-flight provider stream when the
lease is no longer provably current. This note records the traps that are not
visible from the code.

## The 105-second aborts were not a timeout

Reported frames ended at 105,145–105,251 ms with `finishReason: "aborted"` and
`LEASE_LOST`. The lease TTL is 150 s and the heartbeat cadence is 15 s, so a
self-expiring lease could not have produced an abort at 105 s (exactly the 7th
heartbeat tick). Raising the TTL therefore does not address the observed
failure, and the timeout values are intentionally unchanged. What the old code
could not answer was *why* the renewal failed: `withStudioHeartbeat` turned both
"the update matched no row" and "the query threw" into `StudioLeaseLostError`,
so the original cause never reached the log.

## Abort taxonomy

`refreshStudioJobLease` returns a `StudioLeaseRefresh` outcome instead of a
boolean, and the heartbeat maps exactly one outcome to one abort reason:

| Renewal outcome | Abort reason | Meaning |
| --- | --- | --- |
| `renewed` | – | lease extended |
| `lease-expired` | `LEASE_EXPIRED` | we held the claim, the lease ran out |
| `ownership-changed` | `LEASE_OWNERSHIP_CHANGED` | another worker owns the job |
| `job-inactive` | `JOB_CANCELLED` | the job left the active status set |
| `database-error` | `HEARTBEAT_DB_ERROR` | renewal could not be evaluated |

`LEASE_FENCE` is used when a fenced write is refused, `JOB_TIMEOUT` for the
30-minute job ceiling, and `WORKER_SHUTDOWN` when the worker process was
signalled. The reason travels in the error message, the `failure` timing `code`,
and the heartbeat telemetry, so a repeat occurrence is diagnosable from the log
alone.

## Retryable database failures

A single failed renewal used to abort an expensive provider stream. A transient
database failure is now tolerated while the last confirmed lease still covers
the next beat; past that point ownership cannot be proven, so the job stops with
`HEARTBEAT_DB_ERROR` and the lease is left to expire into normal recovery. The
tolerance is derived from the lease itself, not from a retry counter, so it
cannot exceed the window in which the worker may still write.

Renewals are single-flight: a renewal still in flight suppresses the next beat,
and `beat()` clears the guard when it settles. Without that cleanup the guard
would latch and silently stop every later heartbeat.

## Clock domain

Claims, renewals, and lease comparison all use PostgreSQL `clock_timestamp()`.
`recoverStalledStudioJobs` must compare in the same domain; it previously
compared `leaseExpiresAt` against a JavaScript `Date`, so a Node clock running
behind the database clock could reclaim a lease that was still live.

## Lock contention

The renewal runs in a short transaction with `set_config('lock_timeout', …)`
bounded by the heartbeat interval. A renewal blocked behind another writer's row
lock previously waited indefinitely while the lease ticked down; it now fails
fast and reports the PostgreSQL lock code (`55P03`) as
`databaseErrorCategory`. Drizzle wraps driver errors, so the category is read
from the `cause` chain. Frames, revisions, and job finalisation stay inside
`withStudioJobWrite`, whose claim predicate fences stale writers.

The connection pool was deliberately not raised: no evidence points to pool
exhaustion, and a larger pool would hide the contention the timeout now surfaces.

## Reading the telemetry

Every renewal emits one `{"scope":"studio","stage":"heartbeat"}` JSON line with
`jobId`, `workerId`, `heartbeatAttempt`, `heartbeatStartedAt`,
`heartbeatDurationMs`, `leaseExpiresAt`, `databaseErrorCategory`,
`leaseRefreshResult`, `jobStatus`, `claimedByMatches`, and `abortReason`.
Timeouts and shutdowns emit the same shape with `leaseRefreshResult: "skipped"`.
Only identifiers, counters, and error codes are recorded; provider messages,
prompts, and connection strings are never included.

## Verification

```sh
pnpm vitest run src/features/studio/tests/studio-job-runtime.test.ts
pnpm vitest run src/features/studio/tests/studio-job-durability.integration.test.ts
pnpm vitest run src/features/studio --exclude '**/studio-visual.test.ts'
```

The deterministic suite uses fake clocks for renewal timing and a real database
for claim fencing, lock-contention classification, and lease handoff. No browser
QA and no paid provider calls are involved.
