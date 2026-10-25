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
- Correction previously received validation diagnostics but not the generated document. It now receives the document as untrusted repair context, retaining valid work. This increases correction input size; no provider speed or aesthetic improvement is claimed without a controlled provider cohort.
- The gateway model is a configured combo (`selectModels`), not a known fixed underlying model. Adapter retries/fallbacks are observable; gateway-internal fallback and cache hits are not. No model routing or cache flag was changed without support evidence.
- Provider first-chunk retry, whole-frame transient retry, and bounded correction are distinct layers. Their combined latency can be substantial. SDK/provider attempts hidden by the gateway are not counted by adapter counters. Existing stall, total-stream, job timeout, heartbeat, and lease fencing remain active.
- Preview capture is lazy and independent of worker generation. It waits for remote fonts/images and styling, then persists an image. Cache hits avoid capture, and capture failure does not erase ready HTML. Existing resource safety and completeness checks were not removed for speed.
- Status polling is 1,500 ms, so persisted readiness and frontend receipt differ. Stable row reconciliation keeps ready previews intact while siblings change. Offscreen lazy preview delay and image decoding are separate from model duration.

## Measurements

Worker-loop comparison uses a mocked 100 ms nonempty dispatch followed by an empty dispatch. The actual optimized worker module starts dispatch two at **100 ms**, asserted with virtual time in `studio-worker-loop.test.ts`. The baseline loop in `9c632eae` unconditionally waits the configured 2,000 ms after dispatch, giving **2,100 ms by code-derived calculation** under the same fixture (not a separately executed baseline benchmark). The difference is one removed poll interval, not faster HTML generation or a visual-quality claim.

One fixed synthetic scheduler scenario uses four task durations `[100, 300, 200, 300]` ms, concurrency 3, and virtual time. Result: starts `[0, 0, 0, 100]`, first completion **100 ms**, total **400 ms**, peak in-flight **3**. This is scheduling evidence, not a before/after AI speedup. A mocked production generation stream has TTFT **10 ms**, output duration **20 ms**, generation **30 ms**. These are configured mock delays, not provider observations.

Actual fixture prompt sizes (characters, not token estimates; frame fixtures exclude a generated blueprint):

| Scenario | Skill guidance | Planning input including system | Frame input including system |
| --- | ---: | ---: | ---: |
| Web, 3, none | 0 | 3,617 | 2,422 |
| Mobile, 4, none | 0 | 3,606 | 4,143 |
| Mobile, 4, Impeccable | 23,457 | 27,063 | 27,600 |
| Mobile, 4, UI UX Pro Max | 52,898 | 57,205 | 57,041 |
| Web with DESIGN reference | 0 | 3,925 | 3,123 |
| Web with PRD | 0 | 4,706 | 2,762 |

Full selected upstream guidance remains intact. UI UX Pro Max dataset recommendations are planning-only; unrelated raw datasets are not injected per frame. No source document, provenance, checksum, or manifest was changed. Larger prompt size is a confirmed input overhead, not proof of worse latency. Stage-specific reduction is deferred until fidelity can be evaluated with representative outputs.

No controlled live provider run was authorized or performed. Consequently real before/after latency, first-visible latency, mean output tokens per frame, correction percentage, retry frequency, per-skill provider latency, and queue-wait distribution remain **unmeasured**, not zero. No p50/p95 claim is made for the small synthetic cohort. The log summarizer emits descriptive nearest-rank p50/p95 only for stages with at least 20 observations; this is not a confidence interval.

## Measurement surface and limitations

Existing `studioJobTiming` JSONL now covers acquisition, queue wait, worker startup, planning context/TTFT/output, frame context/TTFT/output, validation, frame retries, persistence, frame-ready, job-total, frontend-ready receipt, preview capture/storage, and client preview-response availability. Token counts are retained only when exposed by SDK finish events. Character counts never masquerade as tokens.

`frontend-ready` uses client wall clock against server creation timestamps and is therefore subject to clock skew. `preview-available` measures validated response availability, **not image paint**. `frame-ready` includes queue wait; `job-total` starts after acquisition. `project-completion` measures initial-job terminal persistence from job creation and labels completed, partial, or failed; it does not imply successful image paint. Do not compare these as identical denominators. First-ready is the minimum observed frame-ready per job; interrupted/recovered jobs need attempt-aware interpretation. The summarizer's correction rate is over observed distinct job/frame pairs so revisions do not merge into the initial generation. It reports both output-token mean per measured request and summed measured frame-output tokens per distinct job/frame pair (including correction requests, excluding planning). Per-skill output latency is joined through frame-context events; missing context is not guessed. Failed attempts with no terminal usage are missing observations. `frame-visible` records the image load event once per preview URL using initial-job creation and job identity when supplied by the canvas, falling back to frame creation/project identity on standalone consumers. It is an image-load proxy, not proof of viewport intersection or compositor paint; reloads and revisions must not be interpreted as new initial-job samples. Interrupted frame streams emit FAILED output timing, but usage unavailable from the provider remains absent.

## Loading indicator

The canvas retains its existing layout, frame-sized shimmer, queued dot, and failure state. The hourglass-shaped Loading01 glyph is replaced with the installed Hugeicons Loading03 radial circular spinner, still 13px and `motion-safe:animate-spin`. The actual SVG geometry was inspected: eight radial strokes, not an hourglass. HeroUI's installed Spinner was also inspected; its extra wrapper, gradient SVG and styling dependency are unnecessary for this one-icon replacement. Discovery also checked shadcn's component catalog (https://ui.shadcn.com/docs/components, which lists Spinner), Magic UI (https://magicui.design), React Bits (https://reactbits.dev), and Thinking Orbs (https://github.com/Jakubantalik/thinking-orbs). The first is a viable primitive alternative; Magic UI/React Bits emphasize animated source components, while Thinking Orbs uses client canvas and particle states. Those add implementation or visual machinery for a 13px status already covered by the installed icon primitive. No new dependency or loading dashboard is added. The purpose is immediate recognition of actual generating state, with static queued state and reduced-motion support preserved.

## Quality and verification boundary

Shared blueprint, PRD/reference precedence, platform dimensions, HTML validation, navigation consistency, tenant/lease fencing, and bounded correction remain in force. A baseline-to-HEAD diff against `77b41831` is empty for `studio-generated-html-validation.ts`, `studio-design-system-html.ts`, `studio-design-blueprint.ts`, `studio-screen-prompts.ts`, `studio-prompt-contracts.ts`, and `studio-skill-manifest.ts`. The same structural output checker therefore remains unchanged; blueprint, PRD, design-reference matrix and output-contract suites pass 39 tests on HEAD. This establishes preservation of deterministic gates, not equivalence of stochastic aesthetic results. Deterministic tests establish structural correctness, not visual taste or live provider speed. No browser QA, screenshots, or aesthetic equivalence claim is made.

Build completed successfully with existing browser-externalization warnings for Node modules in the wider application bundle. This is not a claim that those warnings are harmless; the Studio client-boundary tests pass, and the wider bundle boundary remains a separate investigation.
