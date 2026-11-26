# FIX 07: One Accurate Agent Progress Surface for VibePlan Existing Codebase

Scope: the Thinking/progress surface of the Existing Codebase chat workspace
(`AgentThinking` + the codebase run state). The composer, the artifact stream,
the questions card, the revision workflow, and the Greenfield surfaces (which
use `ThoughtLine`, not `AgentThinking`) were not redesigned.

## 1. Root cause

Three defects compounded into the rejected interface.

| Defect | Evidence in the code before the fix |
| --- | --- |
| Two Thinking animations at once | `agent-thinking.tsx` rendered `<Orb state="reasoning" size={16} />` in the headline **and** `<Orb state="reasoning" size={14} />` for the last row of the activity list (`isCurrent` branch). Opening "Aktivitas" therefore showed a second, independently animated orb belonging to the same operation. |
| Transport milestones shown as reasoning | `CODEBASE_RUN_ACTIVITY_LABEL` mapped `request.accepted` → "Permintaan diterima server", `generation.started` → "Model mulai menghasilkan respons", `result.persisted` → "Hasil tersimpan di server". `codebase-chat-workspace-messages.tsx` passed `run.activities.map(...)` straight into the disclosure, so HTTP/worker/database bookkeeping was presented as AI thinking. |
| A disclosure that never had useful content | The same component also received `activity={run.activity}` (a full-sentence stage description), which alone satisfied `hasExpandableContent`. Every run therefore rendered a permanent "Aktivitas" section whose content was either infrastructure logs or a duplicate of the headline label. |

Two further dead ends were proven while inspecting the producers: `setRunPhase`
and `appendRunThinking`/`resetRunThinking` had **no production caller**, and the
server deliberately refuses to expose model reasoning
(`workspace-generation-stream.server.ts` maps `thinking`/`thinking_reset` to a
bare `phase: "thinking"` event and drops the text). So `phase`, `thinkingText`
and the activity stream could never carry anything the user should read.

## 2. Removed duplicate animation

`AgentThinking` now renders exactly one animated indicator for the active
operation: the `Orb` in the status line
(`data-testid="agent-thinking-indicator"`). The activity list is gone entirely,
so no second orb, spinner or glyph can be printed for the same run. Completed
and failed states use a static `Tick01Icon`/`AlertCircleIcon`, never an
animation. `Orb` gained an inert `data-orb` attribute so tests can assert the
count of live indicators directly instead of guessing from class names.

The composer was the other half of the duplicate: `CodebaseChatWorkspace`
passes `isSending={isSending || isRunWorking}`, and `PromptBar` swapped its
submit glyph for a `Spinner` whenever `isSending` was true — so an in-flight run
showed the Orb and a second spinning control for the same request. `PromptBar`
now takes `showBusyGlyph` (default `true`, so every other surface keeps its
spinner); the codebase composer sets it to `false`. The submit action still
closes (`disabled`, `aria-busy`) while busy — only the redundant animation is
gone.

## 3. Removed generic public activity labels

- `CODEBASE_RUN_ACTIVITY_LABEL`, `CodebaseRunActivityId`, `CodebaseRunActivity`,
  `CODEBASE_STAGE_ACTIVITY`, `recordRunActivity`, `recordOperationActivities`,
  `activitiesFromOperation`, `ObservedOperation`, `setRunPhase`,
  `appendRunThinking`, `resetRunThinking`, `thinkingText`, `phase`, `activity`
  and `activities` were deleted from `chat-flow-run.ts` and every consumer.
- The `AgentThinking` props `activities`, `activity`, `phase` and
  `generatingLabel` were deleted; `thinkingText` remains the only expandable
  detail and only ever renders provider-streamed reasoning.
- Copy that survives is limited to the approved set:
  `Menyusun pertanyaan klarifikasi...`, `Menyusun spesifikasi fitur...`,
  `Menyusun PRD...`, `Menyusun acceptance criteria...`, `Menyusun task...`,
  and after completion `Pertanyaan siap`, `Spesifikasi fitur siap`, `PRD siap`,
  `Acceptance criteria siap`, `Task siap` (settled labels corrected from
  "PRD selesai"/"Acceptance Criteria selesai"/"Task dan Kanban siap").
- Transport events are no longer projected anywhere. They are not re-exported as
  copy and they are not replaced with equivalent chatbot filler.

## 4. Actual event sources

| Source | What it actually reports | How the UI uses it |
| --- | --- | --- |
| `POST /api/codebase/generation` submit ack (`DurableGenerationOperation.createdAt`) | server acceptance | anchors `startedAt` (`operationStartEpoch`, `anchorRunStart`) so the timer excludes client submit latency |
| Poller `pollOperationUntilSettled` (`status`) | `queued` / `running` / `completed` / `failed` / `cancelled` | keeps the run `running`; settles to `done`/`failed` from the real terminal status |
| `finishedAt` | server settle time | freezes the duration (`operationSettleEpoch`) |
| `error` | server failure text | shown once, with the existing retry affordance |
| SSE `thinking`/`thinking_reset` | phase hint only, text dropped server-side | nothing user-visible is fabricated from it |

No phase, stage or reasoning text is derived from elapsed time. A run the client
never observed is rebuilt from the operation's own timestamps on remount, so a
refresh shows the recorded duration rather than a fresh clock.

## 5. Timer lifecycle

```
submit accepted ──► run.startedAt = operation.createdAt   (re-anchor, no pre-acceptance time)
running          ──► interval repaints only while status === "running"
completed        ──► settleRun(..., finishedAt = op.finishedAt)  → timer freezes
failed           ──► settleRun(..., finishedAt = op.finishedAt)  → timer freezes
cancelled        ──► settleRun(..., "Dibatalkan.")               → timer freezes
```

- `AgentThinking` ticks on a 200ms interval that is created **only** while
  `isWorking`, and the settled duration is recomputed from `finishedAt` so no
  post-settle drift is possible.
- An ordinary rerender (same `startedAt`) never resets `elapsed`.
- `anchorRunStart` ignores settled runs, foreign request ids and unparseable
  timestamps, so a missing server field degrades to the client clock instead of
  moving a finished operation's clock.

## 6. Components reused

| Source | Candidate | Verdict |
| --- | --- | --- |
| thinkingorbs.com | `Orb` (already vendored in `components/ui/orb` + `orb-core.ts`) | **Chosen.** One Orb, `currentColor`, reduced-motion aware, already the repo's indicator. |
| ui.shadcn.com | `Collapsible` | Rejected. It is not installed; the existing inline disclosure (`button[aria-expanded]` + `aria-controls` region) already satisfies the accessible pattern and the repo has no `collapsible.tsx` to reuse. Adding a primitive for two states would be scaffolding. |
| heroui.com | Popover/Dialog based surfaces | Rejected: modal dialog semantics for a non-modal status row, and HeroUI's stylesheet is not imported by the app. |
| magicui.design, reactbits.dev | animated text/thinking components | Rejected: decorative motion and fake streamed thought sentences are explicitly forbidden here. |
| affectui.com, tuffui.com, sakaniui.com, yappologistic.github.io/CUI | agent/chat shells and activity shells | Rejected: they ship whole chat surfaces and their own activity models, which would replace the workspace instead of fixing it. |

No new dependency, no particle engine, no second spinner. The composer keeps
reusing `PromptBar` (its one legitimate busy control) via the `showBusyGlyph`
switch instead of a bespoke send button.

## 7. Modified files

| File | Change |
| --- | --- |
| `src/components/ui/agent-thinking.tsx` | one indicator; dropped `activities`/`activity`/`phase`/`generatingLabel`; disclosure only for real `thinkingText` |
| `src/components/ui/orb.tsx` | inert `data-orb` marker for indicator counting |
| `src/features/codebase/services/chat-flow-run.ts` | run state reduced to real facts; added `anchorRunStart`, `operationStartEpoch`; approved settled labels |
| `src/features/codebase/components/chat/codebase-chat-workspace-messages.tsx` | stops passing transport logs/phase/activity; labels use approved copy |
| `src/features/codebase/components/chat/codebase-chat-workspace-composer.tsx` | opts out of the duplicate submit spinner |
| `src/components/ui/prompt-bar.tsx` | `showBusyGlyph` (default `true`) so a progress-owning surface can keep the submit closed without a second animation |
| `src/features/codebase/hooks/use-workspace-operations.ts` | dropped activity ticks; hydration anchored on acceptance time |
| `src/features/codebase/hooks/use-workspace-pipeline.ts` | anchors the run on the submit ack; dropped activity ticks |
| `src/features/codebase/hooks/use-workspace-questions.ts` | anchors on the submit ack; dropped activity ticks |
| `src/features/codebase/hooks/use-workspace-feature-generation.ts` | anchors on the submit ack; dropped activity ticks |
| `src/features/codebase/hooks/use-workspace-revision.ts` | dropped activity writes |
| `src/components/ui/agent-thinking.test.tsx` | rewritten around the 20 required checks |
| `src/features/codebase/tests/thinking-flow.test.tsx` | activity-ordering suite replaced by P7 status/timer/stale-run checks |
| `src/features/codebase/tests/chat-flow-run.test.ts` | run-state/fact assertions, anchoring, approved copy |
| `src/features/codebase/tests/chat-workspace.test.tsx` | single-indicator and transport-copy assertions, updated settled label |
| `src/components/ui/prompt-bar.test.tsx` | busy submit stays closed and `aria-busy` without a duplicate spinner |
| `src/features/codebase/tests/composer-redesign-modes.test.tsx` | duplicate-block assertion re-pinned to the single-animation contract |
| `docs/codebase-fix07-thinking-orb-activity.md` | this record |

## 8. Automated test results

| Check | Result |
| --- | --- |
| `pnpm vitest run` on the six affected files (`agent-thinking`, `prompt-bar`, `chat-flow-run`, `thinking-flow`, `chat-workspace`, `composer-redesign-modes`) | 6 files, 175 tests passed |
| `pnpm vitest run src/components/ui src/features/codebase` | 190 files, 2038 passed / 12 failed |
| `pnpm biome check <touched files>` | clean |
| `pnpm exec tsc --noEmit` | clean except the pre-existing `studio-composer.test.tsx` `Promise.withResolvers` lib error (untouched file) |

The 12 remaining failures are pre-existing and were reproduced on an unmodified
checkout (`git stash` of this work, same three files, same 12 tests):
`auto-name.test.ts` (10 tests, 401 vs 200 handshake fixtures),
`codebases-pages.test.ts` → "selects the latest usable snapshot…" (asserts
snapshot `inArray(...)` source text that moved to
`services/workspace-snapshot.server.ts` in earlier resync refactors), and
`workspace-analysis-reconciliation.test.tsx` → "keeps current snapshot cards
when an older snapshot GET resolves late" (5s timeout flake). Two further
files (`plan-codebase-name`, `use-codebase-sync-status`) flake only under the
full parallel run and pass in isolation; neither touches this surface.

Required-check coverage: one primary Orb (1, 2), no transport copy (3), no empty
disclosure (4), real detail rendering (5, 19 — only provider-streamed text can
appear; nothing is injected from elapsed time), collapse/expand (6), collapse
keeps the run alive (7), timer starts at real start (8), freezes on
completed/failed/cancelled (9, 10, 11), survives rerender (12), refresh rebuilds
real state (13), queued runs invent nothing (14, 20), settled status (15),
failure stays actionable (16), stale request isolation (17), legacy
`working`/`failed` consumer props still work (18), and the composer no longer
animates the same request twice (8).

No Playwright, browser automation, screenshot, or manual browser QA was used.
