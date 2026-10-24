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
- Dispatch holds a session advisory lock for the entire batch. An initial job therefore blocks subsequent jobs until its slowest frame finishes, across worker replicas. This is an intentional aggregate model-concurrency cap, not an accidentally sequential per-frame loop. Removing the lock alone would remove the cap. Cross-project fair scheduling needs measured provider throughput and a separately reviewed aggregate-cap design.
- Frame-ready writes happen independently, before the batch finishes. The durability integration test blocks one provider response and reads another frame as ready through the project-detail service while the job remains generating.
- Planning is shared and persisted with frame definitions. Recovery reuses planned frames and skips ready HTML; it does not intentionally replan completed work. Planning correction remains bounded. Its system guidance is now assembled once per planning invocation, rather than again for correction.
- Correction previously received validation diagnostics but not the generated document. It now receives the document as untrusted repair context, retaining valid work. This increases correction input size; no provider speed or aesthetic improvement is claimed without a controlled provider cohort.
- The gateway model is a configured combo (`selectModels`), not a known fixed underlying model. Adapter retries/fallbacks are observable; gateway-internal fallback and cache hits are not. No model routing or cache flag was changed without support evidence.
- Provider first-chunk retry, whole-frame transient retry, and bounded correction are distinct layers. Their combined latency can be substantial. SDK/provider attempts hidden by the gateway are not counted by adapter counters. Existing stall, total-stream, job timeout, heartbeat, and lease fencing remain active.
- Preview capture is lazy and independent of worker generation. It waits for remote fonts/images and styling, then persists an image. Cache hits avoid capture, and capture failure does not erase ready HTML. Existing resource safety and completeness checks were not removed for speed.
- Status polling is 1,500 ms, so persisted readiness and frontend receipt differ. Stable row reconciliation keeps ready previews intact while siblings change. Offscreen lazy preview delay and image decoding are separate from model duration.

## Measurements

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

`frontend-ready` uses client wall clock against server creation timestamps and is therefore subject to clock skew. `preview-available` measures validated response availability, **not image paint**. `frame-ready` includes queue wait; `job-total` starts after acquisition. Do not compare these as identical denominators. First-ready is the minimum observed frame-ready per job; interrupted/recovered jobs need attempt-aware interpretation. The summarizer's correction rate is over observed distinct frame IDs, and output-token mean is per measured output request, not deduplicated frame. Failed attempts with no terminal usage are missing observations. Browser image-load/paint timing, per-skill latency aggregation, failed-request usage, and truly end-to-end completion aggregation still need coverage before declaring the full P6 measurement contract complete.

## Quality and verification boundary

Shared blueprint, PRD/reference precedence, platform dimensions, HTML validation, navigation consistency, tenant/lease fencing, and bounded correction remain in force. Deterministic tests establish structural correctness, not visual taste or live provider speed. No browser QA, screenshots, or aesthetic equivalence claim is made.

Build completed successfully with existing browser-externalization warnings for Node modules in the wider application bundle. This is not a claim that those warnings are harmless; the Studio client-boundary tests pass, and the wider bundle boundary remains a separate investigation.
