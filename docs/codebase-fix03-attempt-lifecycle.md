# FIX 03: Correct Durable Generation Retry Lifecycle and Per-Attempt Timer

Scope: how a retried durable generation operation reports its clock, status, and
identity, and what the workspace shows while a worker has not started it. No
schema change, no new table, no new column, no migration, no browser QA, no
Playwright, and no change to credit guards, attempt caps or persistence fences.

## 1. Root cause

The durable operation row is re-used on retry (`getOrCreateGenerationOperation`
re-queues the same row so the job keeps one identity and one billing key), but
the client derived its timer from the row's creation time:

```ts
export function operationStartEpoch(op) {
  const accepted = op.createdAt ? Date.parse(op.createdAt) : Number.NaN;
  if (Number.isFinite(accepted)) return accepted;   // visit 1 of attempt 2
  ...
}
```

`createdAt` is the operation's creation time and never changes, so the second
attempt was timed from the first attempt's start (`anchorRunStart` re-anchored
the running run onto that same `createdAt`). Measured from `createdAt`, an
attempt that took 43.8s and failed made the retry open at `43.8s` and keep
counting — the reported "timer does not return to zero".

Two further defects in the same lifecycle:

- **Claimed the AI was thinking before a worker existed.** The run was created
  as `running` at submit time (`startRun(stage, Date.now())`), so the workspace
  rendered `Menyusun pertanyaan klarifikasi...` with a ticking clock while the
  operation was only `queued`. The durable worker polls every 2s and every
  project is serialized, so that window is real and can be long.
- **A stale callback could rewrite a newer attempt.** `settleRun` guarded only
  on the client `requestId`, so a settled terminal status of an older attempt
  (or of an older operation) could overwrite the run of a newer attempt.

## 2. Operation identity vs attempt identity

```
OPERATION  op-questions-1     (identity_hash, input, source, billing key: proj:questions:op-questions-1)
|
+-- ATTEMPT 1   attempt=1   started_at=T1   finished_at=T2   status=failed
|     client run: requestId=run-x, operationId=op-questions-1, attempt=1, startedAt=T1
|
+-- ATTEMPT 2   attempt=2   started_at=T3   finished_at=T4   status=completed
      client run: requestId=run-y, operationId=op-questions-1, attempt=2, startedAt=T3   (never T1)
```

- **Timestamp source.** `codebase_generation_operations.started_at` /
  `finished_at` are now defined as the **current attempt's window**, not the
  operation's: `claimNextGenerationOperation` stamps `started_at = now` and
  `finished_at = null` on every claim (`startedAt: row.startedAt ?? now` would
  have inherited the previous attempt's start had any re-queue path failed to
  clear it), and every terminal transition stamps `finished_at = now`.
  Re-queuing clears both, so `status = 'queued'` always means
  `started_at = null`. `created_at` stays the operation's acceptance time,
  `updated_at`/`heartbeat_at` stay lease bookkeeping and are never read for
  timing, and `lease_expires_at`/`job_token`/`claimed_by` stay fencing state.
- **Attempt identity on the client** is `(operationId, attempt)`, carried in
  `CodebaseRunState`. It is what a settle callback must match.

## 3. Client run model (`services/chat-flow-run.ts`)

- `CodebaseRunState` gained `operationId`, `attempt`, `status: "queued" |
  "running" | "done" | "failed"`, and `startedAt: number | null`.
  `startedAt` is `null` for as long as no attempt exists.
- `queueRun(stage)` — accepted, unclaimed: no clock (`startedAt: null`).
- `attemptStartEpoch(op)` — the current attempt's start; `null` while `queued`;
  falls back to `createdAt` only for rows written before attempt timestamps
  existed. Replaces `operationStartEpoch`/`anchorRunStart` (both deleted).
- `observeOperation(run, op)` — adopts a snapshot: `queued` clears the clock,
  `running` anchors it on the NEW attempt's start, a settled run is never
  revived, a foreign operation/stage/older attempt is ignored.
- `settleRun` accepts `queued → done/failed` (an operation can complete without
  the client ever seeing it run) and keeps the first recorded outcome.
- `settleRunForOperation(run, op, status, finishedAt, error, requestId?)` —
  refuses a callback whose operation, stage, `requestId`, or attempt is not the
  one the run observes.
- `runFromOperation(op)` — rebuilds a run from the server's own window, used by
  remount/reconnect hydration and by the operations monitor.
- `isRunActive` (queued or running) locks the composer; `isRunWorking` (running)
  means an attempt is really executing. `runDurationSeconds` returns `null`
  rather than a fabricated number when there is no recorded attempt start.

Callers: `useWorkspaceQuestions`, `useWorkspacePipeline` and
`useWorkspaceFeatureGeneration` start at `queueRun`, adopt every poll tick
(`onTick → observeOperation`, so `queued → running` opens the clock at the real
attempt start), and settle through `settleRunForOperation`.
`useWorkspaceOperations` hydrates from `runFromOperation` and settles through the
same operation-aware guard.

## 4. UI

- `AgentThinking` accepts `status="queued"`: waiting label
  `Menunggu proses generasi`, a static clock icon instead of the reasoning
  `Orb`, and **no timer at all**. `startedAt` accepts `null`.
- The workspace renders the queued state and keeps the composer locked while
  `isRunActive(run)`; `workspace-hydration` counts `queued` as local activity so
  the view never falls back to pristine mid-flight.
- No fake processing steps, no inherited clock, no "AI thinking" claim before a
  worker claim exists.

```
INITIAL ─► QUEUED (Menunggu proses generasi, no timer)
             │  worker claims the job (attempt N, started_at = T)
             ▼
           RUNNING (Menyusun pertanyaan klarifikasi..., timer = now − T)
             ├─ SUCCESS ─► timer frozen at T_finish − T
             └─ FAILURE ─► timer frozen, error shown, "Coba lagi" available
                             │ click
                             ▼
                           QUEUED (attempt N+1, new clock, no inherited duration)
```

## 5. Retry, billing, and bounded attempts (unchanged contracts)

- `Coba lagi` re-queues the **same** operation row: return the same `id`, same
  `identity_hash`, same billing key `project:stage:operationId`, same cumulative
  `attempt` counter. `computeJobBillingKey` is stable across attempts.
- A retry while any operation of that project is `queued`/`running` still throws
  `GENERATION_CONFLICT` (409) and performs no insert and no re-queue, so rapid
  clicks and two tabs cannot create parallel jobs.
- `attempt >= maxAttempts` still throws `ATTEMPTS_EXHAUSTED`; claiming an
  exhausted queued row still marks it `MAX_ATTEMPTS_EXCEEDED`. No infinite retry
  loop was added: a rejected generation (e.g. `QUESTION_GENERATION_FAILED`)
  stays an explicit, user-initiated retry.
- Credit rules untouched: `prepareStageCreditGuard` still scopes to the exact
  billing key, still releases a crashed `running` reservation only when no
  artifact exists, and still quarantines on failure. No credit check was
  disabled and no balance is written directly.
- Redemption fences untouched: `completeGenerationOperation` still requires the
  live `job_token`, `status = 'running'` and a non-expired lease, and the
  executor still refuses completion without a matching persisted artifact.
- Diagnostics: the re-queue path logs the previous attempt count and error code
  before clearing the row's error fields, so the actual failure survives a
  retry in the server log.

## 6. Targeted verification

New: `src/features/codebase/tests/durable-attempt-lifecycle.test.ts` (10 tests),
one added test plus a strengthened fencing assertion in
`durable-generation-lifecycle.test.ts`, one added remount test in
`workspace-durable-operations.test.ts`; updated: `chat-flow-run.test.ts`,
`thinking-flow.test.tsx`, `clarification-persistence-retry.test.tsx`.

| # | Required behaviour | Where |
| --- | --- | --- |
| 1 | First attempt timer starts correctly | claim stamps `started_at=now`; `observeOperation` opens the clock at the attempt start |
| 2 | Failed attempt timer freezes | `failGenerationOperation` sets `finished_at`, leaves `started_at`; `settleRun` freezes the run |
| 3 | Retry resets attempt timing | re-queue clears the window; new attempt anchors on its own start (43s attempt never leaks) |
| 4 | Reconnect keeps the real elapsed duration | `runFromOperation` + `operationSettleEpoch` report the attempt window, not the queue wait |
| 5 | Completed attempt does not restart | `observeOperation` on a settled run returns the same object |
| 6 | Rapid retry clicks create no duplicate execution | active operation ⇒ `GENERATION_CONFLICT`, no insert/update; repeated snapshot keeps one clock |
| 7 | Retry after persisted success does not regenerate | `durable-generation-idempotency-regression.test.ts` (unchanged, still green) |
| 8 | Retry after invalid output | `QUESTION_GENERATION_FAILED` re-queues once, failure code preserved in the log |
| 9 | Retry after persistence failure | re-queue allowed; an attempt with no persisted artifact is marked failed, never completed |
| 10 | Stale worker callback cannot overwrite a newer attempt | `settleRunForOperation` refuses older attempts; fencing tests reject a stale token |
| 11 | Remount/recovery preserves operation state | hydration rebuilds from the recorded window; queued remount shows waiting with no clock |
| 12 | Billing/idempotency intact | stable billing key per operation, operation id reused, no direct balance writes |
| 13 | Max attempts enforced | `ATTEMPTS_EXHAUSTED` on retry, `MAX_ATTEMPTS_EXCEEDED` on claim |

Commands run (targeted only, no repo-wide blind suites):

```
pnpm vitest run <the 12 touched-area test files>
# Test Files 12 passed (12) | Tests 218 passed (218)

pnpm biome check src/features/codebase src/db/codebase-generation-schema.ts \
  src/components/ui/agent-thinking.tsx        # 442 files, clean
pnpm exec tsc --noEmit                        # only the pre-existing studio-composer error
```

Baseline note (not caused by this fix): the folder run
`pnpm vitest run src/features/codebase/tests` reports
`4 failed | 177 passed` files and `13 failed | 2003 passed` tests in
`auto-name.test.ts`, `codebases-pages.test.ts`, `plan-codebase-name.test.tsx`
and `workspace-analysis-reconciliation.test.tsx` — the identical pre-existing
baseline already documented in `codebase-fix02-plan-hydration.md`. The
repository-wide `tsc` error in `src/features/studio/tests/studio-composer.test.tsx`
(`Promise.withResolvers`, ES2022 lib) is likewise documented as pre-existing.

No browser/Playwright QA, no live-database manipulation, and no operation was
marked successful by hand.
