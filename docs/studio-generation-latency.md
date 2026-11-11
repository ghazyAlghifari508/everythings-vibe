# Studio generation latency

## Reproduce without provider calls or browser QA

```sh
pnpm vitest run src/features/studio/tests/studio-latency.test.ts --disableConsoleIntercept --silent=false
pnpm vitest run src/features/studio/tests/studio-timing-report.test.ts
pnpm studio:worker:smoke
pnpm studio:assets:check
pnpm exec tsx src/features/studio/services/studio-timing-report-cli.ts <studio-jsonl-log>
```

The worker smoke holds the dispatch advisory lock so its child cannot claim live jobs or spend provider credits. Do not run `studio-visual.test.ts` for browser-free verification: it launches Chromium. Production capture dependencies remain installed.

## Findings and decisions

- Initial frame requests already overlap with concurrency **3**. Keep this ceiling: deterministic tests demonstrate overlap and stable result ordering, but do not establish the gateway's rate-limit capacity. Increasing it without provider measurements risks retries rather than improving latency.
- The worker previously slept 2,000 ms after every batch, even with queued work remaining. It now immediately attempts the next dispatch after a nonempty batch and sleeps only after an empty/lock-contended dispatch. This removes one configured inter-batch delay, not provider execution time; idle polling and aggregate concurrency limits are unchanged.
- Dispatch holds a session advisory lock for the entire batch. An initial job therefore blocks subsequent jobs until its slowest frame finishes, across worker replicas. This is an intentional aggregate model-concurrency cap, not an accidentally sequential per-frame loop. Removing the lock alone would remove the cap. Cross-project fair scheduling needs measured provider throughput and a separately reviewed aggregate-cap design.
- Frame-ready writes happen independently, before the batch finishes. The durability integration test blocks one provider response and reads another frame as ready through the project-detail service while the job remains generating.
- Planning is shared and persisted with frame definitions. Recovery reuses planned frames and skips ready HTML; it does not intentionally replan completed work. Planning correction remains bounded. Its system guidance is now assembled once per planning invocation, rather than again for correction.
- Frame correction sends specific contract failures and the entire previous HTML as untrusted data, not the original full prompt. Full HTML is necessary because the output remains a standalone document, not a patch. Documents above 60,000 characters or correction user prompts above 64,000 characters fail explicitly; they are never silently sliced. Advisory aesthetics no longer trigger regeneration.
- The gateway model is a configured combo (`selectModels`), not a known fixed underlying model. Adapter retries/fallbacks are observable; gateway-internal fallback and cache hits are not. No model routing or cache flag was changed without support evidence.
- Completion and accounting are independent: `finishReason`, `rawFinishReason`, `requestedMaxTokens`, `effectiveMaxTokens: null`, input/output/text/reasoning tokens, `accountingAboveRequested`, `ceilingReached`, and the completion category travel together. A normal `stop` with usage above the requested cap is not truncation. Only incomplete output gets bounded correction; filtering, cancellation and other terminal failures are rejected.
- Studio owns attempts: SDK and first-byte adapter retries are disabled only for Studio's controlled calls; other surfaces keep their defaults. A frame permits one transient retry and one correction, at most three requests total. Planning permits one JSON correction within three total requests. Transient retries back off from 500 ms. Each planning/frame invocation shares a 600,000 ms deadline across its requests, preserving the existing per-stream ceiling rather than resetting it per correction. Worker lease fencing and the job deadline remain active.
- Canonical mobile chrome repair changes positioning only in `studio-canonical-style` exact header/navigation selectors or direct canonical chrome inline styles, then runs the unchanged validator. Arbitrary dialogs, descendants and grouped selectors are untouched. Queue age alone yields a neutral waiting message, never a diagnosis that no worker exists. Adding a screen updates its blueprint and new frame only; approved sibling HTML, timestamps and preview hashes stay unchanged.
- The Studio HTTP error line logs the taxonomy code, HTTP status and failure category. It never logs the raw provider/validator/capture message, so a rejected retry or capture can no longer carry upstream payload text into logs. The same taxonomy supplies the public copy and recovery action the client sees.
- Preview capture is lazy and independent of worker generation. It waits for remote fonts/images and styling, then persists an image. Cache hits avoid capture, and capture failure does not erase ready HTML. Existing resource safety and completeness checks were not removed for speed.
- Status polling is 1,500 ms, so persisted readiness and frontend receipt differ. Stable row reconciliation keeps ready previews intact while siblings change. Offscreen lazy preview delay and image decoding are separate from model duration.

## Measurements

Worker-loop comparison uses a mocked 100 ms nonempty dispatch followed by an empty dispatch. The actual optimized worker module starts dispatch two at **100 ms**, asserted with virtual time in `studio-worker-loop.test.ts`. The baseline loop in `9c632eae` unconditionally waits the configured 2,000 ms after dispatch, giving **2,100 ms by code-derived calculation** under the same fixture (not a separately executed baseline benchmark). The difference is one removed poll interval, not faster HTML generation or a visual-quality claim.

One fixed synthetic scheduler scenario uses four task durations `[100, 300, 200, 300]` ms, concurrency 3, and virtual time. Result: starts `[0, 0, 0, 100]`, first completion **100 ms**, total **400 ms**, peak in-flight **3**. This is scheduling evidence, not a before/after AI speedup. A mocked production generation stream has TTFT **10 ms**, output duration **20 ms**, generation **30 ms**. These are configured mock delays, not provider observations.

Historical prompt measurements below were superseded by the P1 fixture run; they are not a same-checkout latency baseline. Current reproducible input sizes (characters, not tokens; frame fixtures exclude a generated blueprint):

| Scenario | Planning input including system | Frame input including system |
| --- | ---: | ---: |
| Web, 3, none | 6,654 | 12,711 |
| Mobile, 4, none | 6,640 | 12,460 |
| Mobile, 4, Impeccable | 22,715 | 28,532 |
| Mobile, 4, UI UX Pro Max | 27,217 | 32,020 |

P1's failing-before regression measured a 45,501-character correction input for a 45,000-character original prompt and 169-character invalid document. The equivalent bounded repair fixture is 530 characters after removing the duplicated original prompt. This proves reduced input amplification, not live-provider latency. The six new initial regressions all failed before implementation; they cover accounting, terminal provider errors, duplicated correction context, oversize documents, advisory regeneration and diagnostic redaction.

Selected skill sections remain stage-bounded with original asset provenance intact; this task does not modify skill sources, manifests or selection semantics. DESIGN.md and PRD contents remain in planning once, with duplicated token summaries and HTML-only quality instructions removed. The system JSON schema, identity, screen count, tokens and navigation contract remain required.

No controlled live provider run was authorized or performed. Consequently real before/after latency, first-visible latency, mean output tokens per frame, correction percentage, retry frequency, per-skill provider latency, and queue-wait distribution remain **unmeasured**, not zero. No p50/p95 claim is made for the small synthetic cohort. The log summarizer emits descriptive nearest-rank p50/p95 only for stages with at least 20 observations; this is not a confidence interval.

P1 transport smoke exercised the real AI SDK over local HTTP SSE and the actual PostgreSQL pipeline, with an isolated temporary owner and synthetic provider responses. Initial states were `ready, ready, failed`; concurrent retry submissions produced exactly one queued job; retry produced three ready frames, byte-identical sibling rows, and unchanged `creditsUsed = 2`. Six HTTP requests covered one plan, three initial frames, one correction and one frame retry. The invalid frame's initial user prompt was 14,555 characters; its correction was 9,881 characters including the complete 9,544-character assembled document. Requested caps on the wire were 4,000/12,000; synthetic usage of 18,000 tokens with `stop` remained `COMPLETED`, while `content_filter` was rejected. This verifies transport/accounting and durable recovery, not live-model performance or visual quality. The script, local server and temporary owner were removed after assertions passed.

## Measurement surface and limitations

Existing `studioJobTiming` JSONL now covers acquisition, queue wait, worker startup, planning context/TTFT/output, frame context/TTFT/output, validation, frame retries, persistence, frame-ready, job-total, frontend-ready receipt, preview capture/storage, and client preview-response availability. Token counts are retained only when exposed by SDK finish events. Character counts never masquerade as tokens.

`frontend-ready` uses client wall clock against server creation timestamps and is therefore subject to clock skew. `preview-available` measures validated response availability, **not image paint**. `frame-ready` includes queue wait; `job-total` starts after acquisition. `project-completion` measures initial-job terminal persistence from job creation and labels completed, partial, or failed; it does not imply successful image paint. Do not compare these as identical denominators. First-ready is the minimum observed frame-ready per job; interrupted/recovered jobs need attempt-aware interpretation. The summarizer's correction rate is over observed distinct job/frame pairs so revisions do not merge into the initial generation. It reports both output-token mean per measured request and summed measured frame-output tokens per distinct job/frame pair (including correction requests, excluding planning). Per-skill output latency is joined through frame-context events; missing context is not guessed. Failed attempts with no terminal usage are missing observations. `frame-visible` records the image load event once per preview URL using initial-job creation and job identity when supplied by the canvas, falling back to frame creation/project identity on standalone consumers. It is an image-load proxy, not proof of viewport intersection or compositor paint; reloads and revisions must not be interpreted as new initial-job samples. Interrupted frame streams emit a terminal `CANCELLED` or `FAILED` output timing, but usage unavailable from the provider remains absent.

## Loading indicator

The canvas retains its existing layout, frame-sized shimmer, queued dot, and failure state. The hourglass-shaped Loading01 glyph is replaced with the installed Hugeicons Loading03 radial circular spinner, still 13px and `motion-safe:animate-spin`. The actual SVG geometry was inspected: eight radial strokes, not an hourglass. HeroUI's installed Spinner was also inspected; its extra wrapper, gradient SVG and styling dependency are unnecessary for this one-icon replacement. Discovery also checked shadcn's component catalog (https://ui.shadcn.com/docs/components, which lists Spinner), Magic UI (https://magicui.design), React Bits (https://reactbits.dev), and Thinking Orbs (https://github.com/Jakubantalik/thinking-orbs). The first is a viable primitive alternative; Magic UI/React Bits emphasize animated source components, while Thinking Orbs uses client canvas and particle states. Those add implementation or visual machinery for a 13px status already covered by the installed icon primitive. No new dependency or loading dashboard is added. The purpose is immediate recognition of actual generating state, with static queued state and reduced-motion support preserved.

## 60-second target evaluation

The 60-second target is **not met and not claimed**. Frame generation is the only stage that dominates wall clock, and it is provider-bound: the same rejected 90–200 s frame requests are what the correction loop re-issues, so removing one correction round only removes one provider round trip, it does not make a single round faster. The deterministic work around the provider is already bounded:

- Overlap: four frames start at concurrency 3; the fourth starts when a slot frees. This is retained, not raised, because no measurement of the gateway's rate/token limits is available.
- Perceived latency: a frame is persisted and exposed as soon as it is ready, independently of its siblings, so the first frame becomes usable before the project completes.
- Correction cost: one contract-driven round, without the original full prompt, within a shared request/deadline budget. Oversize documents fail explicitly rather than being truncated.
- Deterministic repairs run before any model correction: design-system token enforcement and canonical shell assembly are applied, so only genuine contract violations reach the provider.
- Planning is shared once per project and reused for every frame and for recovery; ready frames are skipped.

Reaching 60 s requires either a faster provider route or a documented reduction in the number of provider round trips. Neither can be established without a controlled live-provider cohort, which was not authorized. The honest status is: latency instrumentation and the provider-independent overhead reductions are in place; the provider-bound remainder is unmeasured.

## Verification

```sh
pnpm vitest run src/features/studio --exclude '**/studio-visual.test.ts' --maxWorkers=1
pnpm vitest run src/features/studio/tests/studio-output-diagnostics.test.ts src/features/studio/tests/studio-timing-report.test.ts src/features/studio/tests/studio-latency.test.ts
```

P1 verified at this checkout: the full Studio suite excluding the Chromium test is **115 files / 1053 tests, all passed** (serial, 901 s). `pnpm exec tsc --noEmit`, `biome check` over every touched file, `pnpm studio:smoke`, `pnpm studio:assets:check` (22 pinned assets), `pnpm studio:worker:smoke` (readiness plus graceful SIGINT/SIGTERM) and `pnpm build` all pass.

Covered by deterministic tests: finish-reason classification (including cancellation, provider-error, and unknown reasons), token-ceiling observability and counting, bounded correction context, bounded concurrency with stable ordering, independent frame readiness, targeted work that leaves unaffected frames untouched, and the recovery path that skips ready frames. All are provider-free and require no browser. `studio-visual.test.ts` still launches Chromium and is deliberately excluded from the browser-free gate.

## Quality and verification boundary

TASK 06 audit found no hardcoded green fallback in planning, presets, token extraction or canonical assembly. Confirmed gaps: canonical assembly used fixed ink and secondary accent as muted text; the blueprint could not retain separate ink/muted/action foreground decisions; planning requested a concise direction without a brief-grounded decision procedure. These gaps are not proof of the upstream model's reason for repeatedly choosing green. UI UX Pro Max also supplies dataset palette suggestions and static fallback values; its recommendations are now explicitly advisory, not industry mandates.

Automatic planning now requests audience/task/mood reasoning in the existing visualDirection field and shared ink, muted and onPrimary tokens. New no-reference worker planning requires these tokens and validates opaque hex and WCAG AA text contrast through the existing corrective path. Canonical assembly consumes them. Legacy persisted blueprints remain readable without recoloring completed frames. Reference tokens retain precedence; action foreground adapts for readability without changing the brand accent. No industry palette map, random selection, UI control or sampling change was added. The inspected ai-client stream request has no temperature/top-p override; gateway sampling and live aesthetic diversity remain unverified. Blueprints are persisted per project, reused on resume and extended for added screens, not fetched from another project's cache.

The visual-direction suite uses mocked finance, portfolio, travel, healthcare, same-industry and explicit-color decisions; validates color/contrast and legacy compatibility; and checks shared-token preservation during screen extension and canonical assembly. Existing reference-matrix and add-screen integration suites exercise persisted workflows. This proves mechanical preservation, not live-model aesthetic diversity.

Shared blueprint, PRD/reference precedence, platform dimensions, HTML validation, navigation consistency, tenant/lease fencing, and bounded correction remain in force. At the TASK 03 checkpoint, a baseline diff against `77b41831` was empty for `studio-generated-html-validation.ts`, `studio-design-system-html.ts`, `studio-design-blueprint.ts`, `studio-screen-prompts.ts`, `studio-prompt-contracts.ts`, and `studio-skill-manifest.ts`. The same structural output checker therefore remains unchanged; blueprint, PRD, design-reference matrix and output-contract suites passed 39 tests at that checkpoint. This establishes preservation of deterministic gates, not equivalence of stochastic aesthetic results. Deterministic tests establish structural correctness, not visual taste or live provider speed. No browser QA, screenshots, or aesthetic equivalence claim is made.

Build completed successfully with existing browser-externalization warnings for Node modules in the wider application bundle. This is not a claim that those warnings are harmless; the Studio client-boundary tests pass, and the wider bundle boundary remains a separate investigation.

## Commits

- `8163670e` … `aa940268` (2026-10-24): latency measurement surface, stream-usage capture, correction document retention, worker batch drain, and the circular generation indicator.
- `234d4787` (TASK 03): provider finish-reason taxonomy, per-request token-ceiling observability, and a bounded correction context, with tests.
- The report commit that adds this section.

TASK 01/02 work already on this branch (`1b735eda`, `e548c286`, `2c1ee248`, `3da44c9e`) added the structured validation diagnostics and stage-aware skill context this report builds on and does not undo.

---

## P2: Studio generation concurrency, job dependencies, and race conditions (2026-11-11)

Backend job guarantees only. No chat panel, no canvas redesign, no browser QA.

### Confirmed root causes (reproduced before the fix)

1. **Provisional-slot race in `persistStudioPlannedFrames`.** Planning read every
   frame of the project and classified the set with `existing.some((frame) =>
   !isTemporarySlot(frame))`. An `add_screen` committed while planning was still
   running therefore added one real frame, and planning then concluded the
   initial slots were already planned: the provisional `Layar 1..N` rows were
   never named, and the initial job generated frames it owned no longer
   described.
   `src/features/studio/tests/studio-planning-race.integration.test.ts`
   reproduced it (slot ids kept the provisional names; the added frame was
   generated twice).
2. **Ordering without ownership.** Frame writes were scoped by
   `(frame.id, projectId)` only. A recovery worker and a live worker, or two
   operations on the same frame, could both write the same row, and a stale
   writer could overwrite a newer revision with no version check.
3. **No dependency model.** An accepted `add`/`revise` job depended implicitly on
   the shared blueprint, but nothing recorded that dependency, so a job could be
   claimed before planning committed anything, and a revision of a `generating`
   frame was rejected outright (`STUDIO_INVALID_INPUT`) instead of being queued
   against the version that would be produced.
4. **Batch-per-poll throughput.** Dispatch selected three jobs, awaited all of
   them (each initial job serialises its frames internally), and only then looked
   for more work. Work queued mid-batch waited for the whole batch to drain.

Suspected, not confirmed: nothing in this task remains "suspected" beyond the
items listed under Unknowns.

### Final queue and dependency policy

Deterministic order: `status = queued AND claimed_by IS NULL` ordered by
`created_at, id`. A queued job is dispatched only when its dependency state is
`ready`; a non-ready job that cannot progress is failed with an explicit code
instead of hanging.

| Case | Dependency recorded | Claim requires |
| --- | --- | --- |
| initial | none | — |
| `add` | `blueprint_job_id` (the project's single initial job) | blueprint job reached `planning_completed_at` |
| `revise` on a `ready` frame | none, `base_revision = frame.revision` | frame revision unchanged |
| `revise` on a `queued`/`generating` frame | `depends_on_job_id` = current tail job, `base_revision` = tail output revision | tail job completed and its version persisted |
| `revise` after a failed operation on the same frame | tail job | failed tail is terminal → `STUDIO_DEPENDENCY_FAILED` |

Batch selection (`selectStudioWorkerBatch`) is unchanged for the initial case: a
first queued initial job takes the batch alone, an initial job that is already
running reserves capacity by holding slots (not the whole batch), and non-initial
jobs share the remaining slots up to `STUDIO_FRAME_CONCURRENCY` (3). Jobs queued
before an initial job are admitted first; a *running* initial job does not block
dependent work from filling spare slots.

A job is offered to the dispatcher only when it is claimable right now:
`status = queued`, `claimed_by IS NULL`, and its lease is null or already
expired. A job whose previous worker still holds a live lease waits for that
lease instead of being re-dispatched into a claim that must fail, and a job that
exhausted `STUDIO_JOB_MAX_ATTEMPTS` becomes terminal at that point.

Aggregate model concurrency is capped by **one dispatcher process holding the
session advisory lock for its lifetime** plus a shared 3-slot semaphore
(`studio-worker-scheduler.ts`) that every planning, naming, initial-frame and
revision model call enters. The advisory lock was kept; it now guards a drain
loop instead of one batch. Only one dispatcher runs per cluster, which also
removes the per-frame race between two workers rather than relying on leases to
resolve it.

### Schema and migration

Additive migration `drizzle/0046_studio_operation_dependencies.sql`
(no destructive statement; all columns nullable except `studio_frames.revision`,
which defaults to `0`):

- `studio_jobs`: `request_id`, `request_hash`, `operation_intent`,
  `operation_index`, `blueprint_job_id`, `depends_on_job_id`, `base_revision`,
  `planning_completed_at`, `error_code`; unique
  `(project_id, user_id, request_id, operation_index)`; index on
  `depends_on_job_id`.
- `studio_frames`: `origin_job_id`, `initial_slot`, `revision`, `last_job_id`;
  index on `origin_job_id`; unique `(origin_job_id, initial_slot)`.
- `studio_revisions`: `frame_id`, `frame_revision`, `job_id`, so history is
  attributable to a frame version instead of a project-wide counter.
- Backfill derives origin from persisted relationships only: `add` jobs' own
  `target_frame_id`, then remaining frames ordered by `order, id` attached to the
  project's single initial job. Frames with saved HTML start at `revision = 1`.
  Legacy non-initial jobs still active are failed with
  `STUDIO_DEPENDENCY_FAILED` and a resend instruction, because their target
  version was never recorded and guessing it would be the overwrite this task
  removes.
- Safety: the migration must run before new workers start; old writers do not
  check `revision`. Rollback is a plain `DROP COLUMN`/`DROP INDEX` set; no row is
  deleted or rewritten except the version/ownership backfill above.

### API and state

`GET /api/studio/project` and the detail loader now return `jobs` (live jobs
first, then terminal history, capped at 100) in addition to `activeJob`. An
accepted operation answers `202` with its jobs; `clarify` stays `200`.
`POST /api/studio/frame` accepts an optional `baseRevisions` map and rejects a
stale base with `STUDIO_STALE_REVISION` (409) before writing anything.
New public codes: `STUDIO_STALE_REVISION`, `STUDIO_DEPENDENCY_FAILED`
(category `planning-required`), `STUDIO_IDEMPOTENCY_CONFLICT`. Frame status never
lies: an accepted add is a `queued` frame row, so the canvas shows the queue
state from the same poll it already uses.

A rejected request leaves the draft in the composer: the existing composer only
clears its text on `accepted`, so a `409` (duplicate, stale base, dependency)
keeps the user's words on screen. This task does not add the chat panel that a
future draft banner would live in.

### Before / after job sequences

```mermaid
sequenceDiagram
  participant U as User
  participant A as API
  participant W as Worker
  Before: U->>A: generate 4 screens
  A->>W: initial job (3 frames in flight)
  U->>A: "Add Profile"
  A->>A: insert real frame
  W->>W: planning sees a non-provisional frame
  W->>W: keeps "Layar 1..4", skips the plan
  Note over W: initial frames unnamed, Profile generated twice
```

```mermaid
sequenceDiagram
  participant U as User
  participant A as API
  participant D as Dispatcher
  participant M as Model slots (3)
  After: U->>A: generate 4 screens
  A->>D: initial job owns slots 0..3 via origin_job_id
  U->>A: "Add Profile"
  A->>A: add job + blueprint_job_id, frame is queued
  D->>D: dependency state = waiting (no planning_completed_at)
  D->>M: initial frames keep running
  D->>M: Profile starts as soon as a slot frees and planning is committed
  Note over M: never more than 3 concurrent model calls; siblings untouched
```

### Impacted files

- Schema/migration: `src/db/schema/studio.ts`, `drizzle/0046_*.sql`,
  `src/features/studio/types/studio-status.ts`.
- Shared constant: `STUDIO_JOB_MAX_ATTEMPTS` moved to
  `types/studio-constants.ts` (re-exported from `services/studio-job-lease.ts`)
  so the dependency module can use it without importing the lease module back.
- Queue and ownership: `studio-job-dependencies.ts` (new),
  `studio-job-lease.ts`, `studio-worker-dispatch.ts`,
  `studio-worker-scheduler.ts` (new), `studio-job-pipeline.ts`,
  `studio-planning.ts`, `studio-project-enqueue.ts`.
- Operations and writes: `studio-operation-enqueue.ts`,
  `studio-operation-request.ts` (new), `studio-frame-write.ts` (new),
  `studio-frame-operation.ts`, `studio-initial-frame.ts`,
  `studio-retry-service.ts`, `studio-frame-errors.ts`.
- API/state: `studio-project-detail.ts`, `studio-project-http.ts`,
  `studio-frame-http.ts`, `studio-detail-loader.functions.ts`,
  `types/studio-service.ts`, `types/studio.ts`, `utils/studio-lifecycle.ts`,
  `hooks/use-studio-status.ts`.
- Tests: `studio-planning-race.integration.test.ts` and
  `studio-operation-dependencies.integration.test.ts` (new),
  `studio-worker-dependencies.integration.test.ts` (new),
  `studio-worker-dispatch-runtime.test.ts` (fixture follows the new queue),
  plus shared row fixtures in `studio-canvas*`, `studio-frame*`,
  `studio-export`, `studio-frame-route`, `studio-p9-polish`,
  `studio-planning-lifecycle`, `studio-status` widened with the new columns.
- Helper: `scripts/studio-p2-check.ts` runs any command against a throwaway
  schema created from the current database, applies the new migration there and
  drops it afterwards, so verification never writes to the workspace database.

### Test results

Deterministic Vitest/integration tests, provider mocked, no browser:

- `add_screen` during pending planning, add during three generating frames,
  duplicate submissions with one identity, distinct similar requests, two queued
  add-screen operations, credits unchanged for rejected duplicates.
- Revision of a pending target (queued, claimed only after the writer persists),
  revision of a ready frame while siblings generate, two revisions of one target
  serialised, stale base rejected at enqueue and at claim, partial multi-target
  failure isolated, retry of a failed frame while another request is queued.
- Lease loss and recovery (single reclaim, stale writer fenced, attempts
  bounded), partial failure followed by retry, reload after the operations,
  cross-project capacity, and cross-tenant isolation with a shared request id.
- The queue only ever offers claimable work: a job whose previous worker still
  holds a live lease is not offered until the lease expires, and a job that
  exhausted its attempts becomes terminal instead of spinning. Both cases are
  asserted directly, because a drain loop that re-dispatches an unclaimable job
  would livelock the worker.
- The shared slot semaphore is asserted in `studio-worker-scheduler.test.ts`:
  aggregate model concurrency never exceeds 3, and a call still waiting for a
  slot leaves the queue when the worker aborts, so shutdown cannot hang on a
  slot that no one will release.
- No lost, replaced, or duplicated initial frames: slot ids and names after the
  race equal the planned blueprint, and approved sibling rows stay byte-identical.

Observed results at this checkout (2026-11-10/11, isolated schema):

- Full Studio suite (Chromium test excluded, serial): **131 files / 1225 tests,
  127 files passed, 4 failed, 1220 tests passed, 5 failed**, 1092 s. The five
  failures are the pre-existing ones listed below; every test this task added or
  touched passes.
- P2 focus set (`planning-race`, `operation-dependencies`,
  `worker-dependencies`, `worker-scheduler`, `add-screen`, `operations`,
  `blueprint-navigation`, `p3-pipeline`, `planning-lifecycle`, `status`):
  **10 files / 98 tests, all passed**.
- `pnpm exec tsc --noEmit`: 0 errors.
- `pnpm biome check` over touched files: clean. One pre-existing unformatted file
  (`studio-css-ownership-p2.test.ts`) is untouched and left alone.
- `pnpm studio:worker:smoke`: readiness plus graceful SIGINT and SIGTERM.
- `pnpm studio:assets:check`: 22 pinned assets verified.

`studio-visual.test.ts` still launches Chromium and stays excluded. Live-provider
latency is not part of this verification; nothing here measures it.

The five remaining failures are pre-existing and unrelated to this task.
Baseline evidence: with every change of this task stashed, these four files fail
with the same assertions (5 failed / 38 passed):
`studio-design-skill-fidelity` (asserts a frame system prompt without the base
quality-rules block), `studio-frame-capture` twice (pins the logged `elapsedMs`
to a value the mocked clock does not produce), `studio-index` (asserts landing
copy), and `studio-p3-defects` (asserts an inspector warning string). They are
not touched here and are not claimed as fixed.

### Unknowns

- Live-provider latency, rate limits and gateway fallback behaviour remain
  unmeasured: no controlled live run was authorized, so "faster" is not claimed.
- The dispatcher drain loop assumes one worker process per cluster (the advisory
  lock). Multi-replica throughput fair *scheduling* is still first-come by
  `created_at`; weighted fairness across tenants is not implemented.
- `revision` is a monotonic per-frame counter, not a hash of the HTML bytes, so
  two writers cannot be distinguished by content alone. A content digest would
  strengthen comparison but nothing in this task requires it.
- If a heartbeat is starved for a whole lease window while a provider call is
  still in flight, recovery requeues that job. In-process dispatch skips jobs
  that are still active and every write is fenced by `claimed_by` + `revision`,
  so no duplicate row can be written; the cost is one repeated provider request,
  not a corrupt frame. Measured heartbeat starvation has not been observed in
  this environment.
- The add/revise prompt still sends the whole sibling screen-name list; scoping
  that prompt is a UI/quality concern outside this task.

---

## P4: Time to first usable frame — baseline re-measurement (2026-11-11)

Scope: measurement and option evaluation only. No production code changed in
this phase, because source inspection confirmed every previously implemented
optimization is still present and no live-provider evidence justifies raising
concurrency or adding progressive preview. No browser QA and no live provider
run were authorized, so all numbers below are mock-based or code-derived.

### Existing optimizations re-confirmed in source (not regressed)

Each item in the P4 prompt's "already implemented" list was checked against the
current modules rather than trusted from the report:

| Claim | Source evidence | Status |
| --- | --- | --- |
| Initial-frame concurrency is 3 | `runWithConcurrency(..., STUDIO_FRAME_CONCURRENCY)` in `studio-job-pipeline.ts`; shared slot semaphore `createStudioWorkerExecution` caps aggregate model calls at `STUDIO_FRAME_CONCURRENCY` | retained |
| Frame-ready results persist independently | `frame-persistence` emitted inside `generateInitialFrame` (`studio-initial-frame.ts`) per frame; `frame-ready` emitted in the per-frame callback before the batch `frames` stage | retained |
| 2-second inter-batch worker delay removed | `studio-worker.ts` loop re-dispatches immediately after a nonempty batch and sleeps only when `processed === 0` (`STUDIO_WORKER_POLL_MS`) | retained |
| Shared planning persisted and reusable | planning runs once, `planningCompletedAt` set, frames persisted via `persistStudioPlannedFrames`; recovery skips ready HTML | retained |
| Correction does not repeat the full original prompt | `correction-context` stage sends contract failures + previous HTML as untrusted data | retained |
| Bounded retry/correction | one transient retry + one correction (≤3 requests) per frame; one JSON correction (≤3 requests) for planning; shared 600,000 ms deadline | retained |
| Status polling ~1,500 ms | frontend polling interval unchanged | retained |
| Preview capture lazy and separate | `getStudioFrameVisual` is triggered from `studio-frame-http.ts` / `studio-frame.tsx` on preview request, never awaited in the job pipeline; `preview-capture` stage lives in `studio-frame-visual.ts` | retained |
| Timing events incl. planning/first-token/output/frame-ready/frame-visible | 33 distinct `studioJobTiming` stages present, incl. `planning-context`, `planning-first-token`, `planning-output`, `frame-context`, `first-token`, `frame-output`, `frame-ready`, `preview-capture`, `preview-persistence`, `project-completion` | retained |

### Evidence-based latency breakdown (mock + code-derived)

Provider-free measurements captured this phase
(`pnpm vitest run src/features/studio/tests/studio-latency.test.ts
src/features/studio/tests/studio-timing-report.test.ts
src/features/studio/tests/studio-worker-loop.test.ts
src/features/studio/tests/studio-worker-scheduler.test.ts` — 4 files / 13
tests, all passed):

- Synthetic scheduler fixture (durations `[100, 300, 200, 300]` ms,
  concurrency 3, virtual time): starts `[0, 0, 0, 100]`, first completion
  **100 ms**, total **400 ms**, peak in-flight **3**. This proves frame 1 does
  not wait for slower siblings and that aggregate concurrency never exceeds 3.
- Mocked production generation stream: TTFT **10 ms**, output **20 ms**,
  generation **30 ms**. These are configured mock delays, not provider
  observations.
- Current fixture prompt sizes (characters, not tokens; frame figures include
  the system prompt and exclude a generated blueprint):

| Scenario | Planning input incl. system | Frame input incl. system |
| --- | ---: | ---: |
| Web, 3, none | 7,745 | 17,996 |
| Mobile, 4, none | 7,731 | 18,029 |
| Mobile, 4, Impeccable | 23,806 | 34,101 |
| Mobile, 4, UI UX Pro Max | 28,308 | 37,589 |
| Web, 3, DESIGN.md reference | 6,906 | 18,697 |
| Web, 3, PRD | 8,226 | 18,336 |

Observed drift vs the superseded table earlier in this document (e.g. Web/3/none
frame input 17,996 vs 12,711 characters): current fixtures produce larger
assembled prompts. This is an `OBSERVED` size difference at this checkout, not a
measured latency regression — the prompt assembly is CPU work measured in
milliseconds (`promptAssemblyMs`), and the dominant cost is provider output
time, which these fixtures do not exercise. Cause of the drift is not attributed
here.

### Actual bottleneck ranking

1. **Provider frame generation (dominant, provider-bound).** Wall clock is
   governed by per-frame model output time. Historically rejected frame requests
   ran 90–200 s; the same route is what a correction round re-issues. Every
   deterministic stage around it is orders of magnitude smaller.
2. **Correction round (provider round trip).** One contract-driven round re-enters
   the provider; removing a correction removes one round trip, not the duration
   of a single round.
3. **Queue wait (scheduler-bound, not model-bound).** The fourth frame waits for
   a slot; the fixture shows it starts as soon as one frees (100 ms mark).
4. **Deterministic overhead (small).** Prompt assembly, validation,
   deterministic repair, canonical assembly and persistence are all measured in
   milliseconds and are already off the provider path.
5. **Preview visibility (separate denominator).** `frame-ready` is server-side;
   `preview-available` measures validated response availability, not image
   paint. First-visible is client wall clock and subject to clock skew.

Not measurable this phase: live TTFT, output-token throughput, correction
percentage, per-skill provider latency, queue-wait distribution, and true
first-paint. These remain **unmeasured**, not zero.

### Comparable implementations (via P1 findings)

- Stitch renders each screen in an independent iframe as soon as it is
  available (`OBSERVED`, P1); EvVibe already persists and exposes frames
  independently, so the structural prerequisite for early first-frame
  availability exists.
- Doop/Onlook render live HTML client-side rather than waiting on a server
  capture; EvVibe still gates the canvas image on a lazy Playwright capture. That
  is a preview-latency concern, not a generation-latency one, and is out of scope
  for the 60-second generation target.
- No reference product was measured under a comparable scenario, so no
  "reference X is faster" claim is made.

### Options A–J evaluated

| Option | Decision | Rationale |
| --- | --- | --- |
| A. Reuse shared blueprint efficiently | Keep (already done) | Planning runs once per project and is reused for every frame and recovery; re-planning ready frames would add provider calls. |
| B. Reduce redundant prompt context | Keep (already done) | Duplicated token summaries and HTML-only quality instructions removed; DESIGN.md/PRD stay once in planning. Further shrinking risks shallow output. |
| C. Bounded provider/model configuration | Keep (already done) | Gateway is a configured combo; no routing/cache change without support evidence. |
| D. Frame 1 independent of siblings | Keep (verified) | Scheduler fixture proves first completion at 100 ms with concurrency 3. |
| E. Improve first-frame scheduling | Reject (no change) | First frame already contends fairly; raising priority would delay siblings without reducing provider time. |
| F. Reduce validation/correction overhead | Keep (already done) | Deterministic repair runs before any model correction; advisory warnings no longer trigger regeneration. |
| G. Avoid recapturing identical previews | Keep (already done) | Preview cache hits avoid capture. |
| H. Progressive draft preview | **Reject** | No measured speed improvement without a live cohort; would add a draft/final distinction, risk counting unfinished UI as success, and must not save drafts as revisions. Complexity not justified by evidence. |
| I. Reduce asset/font waits | Keep (already done) | Capture waits for remote fonts/images, but this is lazy and off the frame-ready path; incomplete assets are never shown as complete. |
| J. Prepare first screen while others queue | Reject (no change) | Already the effective behavior — frames start under concurrency 3 as slots free; shared design-system consistency is guaranteed by the shared blueprint, so no extra pre-work is needed. |

Not done, deliberately: raising concurrency above 3 or removing the advisory
lock. Neither has throughput or gateway rate-limit evidence, and both would
remove the aggregate cap without an alternate policy.

### Before/after and environment

There is no same-checkout live before/after, because no live provider run was
authorized. The only before/after comparisons that hold at this checkout are
mock/code-derived: the worker-loop comparison (optimized module dispatches two at
**100 ms** vs the `9c632eae` baseline **2,100 ms** by code-derived calculation
under the same fixture) and the synthetic scheduler fixture above. Environment:
Windows x64, provider mocked, virtual timers, no network, no Chromium.

### Quality and cost tradeoff

Content was not shortened to hit the clock. DESIGN.md, PRD and the system JSON
schema/identity/screen-count/token/navigation contract remain required. Retry
and correction stay bounded (≤3 requests per stage), so credits per attempt are
unchanged, and rejected duplicate submissions burn no credits. Advisory
aesthetics still do not trigger regeneration.

### Was &lt;60 seconds achieved?

**Not achieved and not yet measurable.** The only stage that dominates wall
clock is provider-bound frame generation, and no controlled live-provider cohort
was run. Server-side `frame-ready` is not a substitute for a verified compositor
paint, so even a fast `frame-ready` would not prove the target. The honest
status: provider-independent overhead is already bounded and instrumented; the
provider-bound remainder is unmeasured.

### Remaining blockers and next actions

1. Authorize a controlled live-provider cohort (web portfolio, web dashboard,
   mobile commerce, mobile travel; with/without theme; with/without DESIGN.md)
   to record model config, token budget, usage, corrections, latency and
   credits per attempt. Only then can p50/p95 be reported with meaningful
   sample counts.
2. Measure the gateway's rate/token limits before any change to the
   concurrency-3 cap or the advisory-lock aggregate policy.
3. Add a verified client paint signal (distinct from `img.onload`) if
   first-visible latency is to be claimed; keep clock-skew caveats explicit.
4. Re-evaluate progressive preview (option H) only if a live cohort shows a
   meaningful first-usable improvement and a safe draft/final boundary can be
   guaranteed.

### Verification this phase

```sh
pnpm vitest run src/features/studio/tests/studio-latency.test.ts \
  src/features/studio/tests/studio-timing-report.test.ts \
  src/features/studio/tests/studio-worker-loop.test.ts \
  src/features/studio/tests/studio-worker-scheduler.test.ts
```

4 files / 13 tests passed. No Chromium test was run, per the phase boundary. No
production files were modified; this section is the deliverable.
