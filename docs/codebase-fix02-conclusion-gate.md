# Existing Codebase — FIX 02 Conclusion Gate Without Refresh

Scope: existing-codebase onboarding (`/plan/codebase`), the sync → conclusion
transition for one uploaded snapshot. Report for `docs/prompts-cb-existing/p2.md`.

## 1. Root cause

The screen showed four checkmarks — including `✓ Analisis selesai` — while
`Lanjut ke Kesimpulan` stayed disabled, and a page refresh fixed it. Three
independent defects produced that, all of them in how the *client* reconciled
server truth. The gate predicate itself
(`canContinueToCodebaseConclusion`) was not the cause, and it was not weakened.

**Defect A — a local in-flight flag vetoed server truth.**
`useOnboardingAnalysis`'s read effect began with
`if (state.analysisWorking || lastStatus.analysisAttemptStatus === "pending") return;`.
`analysisWorking` is a *client* flag, cleared only when this browser's own
analysis POST settles. The POST runs the model synchronously for 15–90s+; if it
is slow, dropped by a proxy, or never resolves, the flag stays true. Meanwhile
the server has persisted the ready row and the status frame already reports
`analysisStatus: "ready"` — so the stage list painted the analysis as finished
(`buildAnalysisRow` returns `done` whenever `liveStatus === "ready"`, and ready
deliberately wins over the local flags) while the read effect refused to fetch
the output the gate needs. Result: `analysis` stays `null`, the gate stays
closed, and only a full remount (which starts with no flag) can open it.

**Defect B — a newer pending attempt hid an older ready row.**
The same guard returned early whenever `analysisAttemptStatus === "pending"`.
A refresh attempt (or any newer attempt) left the persisted *ready* output for
the same snapshot unread, even though the read endpoint serves the newest
readable analysis for that snapshot by design. Same symptom.

**Defect C — status could name a row the read endpoint would never serve.**
`readSyncStatusAnalysis` derived `analysisId`/`analysisStatus` from
`selectNewestReadyAnalysis` (newest row with `status = 'ready'`), while the read
endpoint serves `selectWorkspaceAnalysis` (newest *readable* ready row: output
present, parseable against `codebaseAnalysisSchema`, and bound to this
project/snapshot). A row that was ready-but-unreadable made status advertise
`ready` with an id the browser could never fetch, so `status.analysisId` and
`analysis.id` could never match: a permanent disabled button with `✓
Analisis selesai` next to it.

Proven, not assumed: with the read effect temporarily restored to its previous
form, `onboarding-conclusion-gate.test.tsx` fails exactly on the two veto cases
(trigger in flight → `analysis` stays `undefined`; newer pending attempt → gate
false) and passes with the fix. See §5.

**Presentation defect — the closed gate was explained by a guess.**
`buildAnalysisRow` rendered the same row for every blocked case: `done` +
`Analisis selesai` + `Perlu pembaruan rekomendasi task awal untuk melanjutkan`,
regardless of whether the client was still reconciling the output or the row was
genuinely a legacy row without starter suggestions. That is where the screenshot
came from. The `starterSuggestions` branch *is* a real, refresh-resistant block
(a legacy row), and it keeps its gate and its repair action; the transient
reconciliation case had no business wearing that copy.

## 2. Exact state transition

```
snapshot uploaded (status: uploaded, snapshotId = S)
        │  trigger effect: ensure feature project → POST analysis (single-flight per S)
        ▼
server persists analysis row A (ready, validated output)
        │
        ├─ client still waiting on its own POST ────────────────┐
        │                                                       │ (Defect A)
        ▼                                                       │
status frame: analysisProjectId=P, analysisId=A, analysisStatus=ready
        │                                                       │
        ▼                                                       │
reconcile: GET /api/v1/projects/P/codebase/analysis?snapshotId=S   ← runs regardless
        │
        ▼
client holds { id: A, snapshotId: S, projectId: P, output } (schema-validated)
        │
        ▼
gate: canOpenSummary ∧ status.analysisId = A ∧ project/snapshot/id match ∧
      output parses ∧ starterSuggestions valid
        │
        ▼
Lanjut ke Kesimpulan ENABLED  (no refresh, no timer, no forced state)
```

Blocked states stay blocked, honestly: a mismatched id/snapshot/project, an
unparseable output, or a legacy row without starter suggestions all keep the
button disabled — the last one with its repair action instead of a checkmark
that claims completion.

## 3. Server/client sync changes

| Layer | Change |
| --- | --- |
| `services/sync-status-analysis.server.ts` | `analysisId`/`analysisStatus` now come from the **same** `selectWorkspaceAnalysis` selection the read endpoint serves (output selected and validated), so status can never advertise a ready identity the browser cannot fetch. `analysisAttempt*` fields (newest attempt, including failed/pending) are unchanged. |
| `hooks/use-onboarding-analysis.ts` | The read effect is now identity-keyed by the server: it fires when `analysisStatus === "ready"` and the client does not already hold that exact `analysisId` for this project/snapshot; it is never vetoed by a local in-flight flag or by a newer pending attempt. One read per `project:snapshot:analysisId` (a miss re-opens on the next real frame, so no polling loop); the key resets at every attempt boundary. |
| `components/workspace/sync-stage-list.tsx` | The analysis row no longer claims success the conclusion cannot act on: `done` only when the gate is open, `done` + the repair hint for a legacy row, and `waiting` + `Menyiapkan kesimpulan...` while the output is still being reconciled. |
| `components/workspace/screen-connect-sync-step.tsx` | Passes the legacy-row fact down to the stage list (it already owned it for the repair card). |

No status value, API shape, credit path, retry path, or gating predicate
changed. No `window.location.reload()`, no added timeout, no extra poll loop, no
refresh button, no fabricated output, no forced-enabled button.

Cache revalidation: this flow owns no TanStack Router loader/query cache for the
status or analysis read — both are plain `fetch` calls reconciled by the one
status loop (`useCodebaseSyncStatus` polling plus `useCodebaseSyncStream`), so
there is nothing to invalidate. The revalidation is the read effect itself: it
re-reads the named analysis id on the next real frame, and the id in the status
payload is what makes that revalidation possible.

## 4. Files changed

| File | Change |
| --- | --- |
| `src/features/codebase/hooks/use-onboarding-analysis.ts` | Identity-keyed reconciliation of the persisted analysis; attempt-boundary reset. |
| `src/features/codebase/services/sync-status-analysis.server.ts` | Ready identity projected from the readable selection (shared with the read route). |
| `src/features/codebase/components/workspace/sync-stage-list.tsx` | Honest analysis-row presentation (reconciling vs. legacy repair vs. done). |
| `src/features/codebase/components/workspace/screen-connect-sync-step.tsx` | Wires the legacy-row fact into the stage list. |
| `src/features/codebase/tests/onboarding-conclusion-gate.test.tsx` | New: the 14 required gate scenarios (hook reconciliation, presentation, stream re-subscription). |
| `src/features/codebase/tests/screen-connect.gating.test.tsx` | Analysis row repinned: reconciling vs. legacy repair. |
| `src/features/codebase/tests/sync-stage-list.observability.test.tsx` | Ready row requires the open gate; the reconciling row is added. |

## 5. Tests

`src/features/codebase/tests/onboarding-conclusion-gate.test.tsx` (16 tests) maps
to the required list:

| # | Requirement | Test |
| --- | --- | --- |
| 1 | Output becomes ready after the event → button enables without refresh | `enables without refresh once the server reports the analysis ready` |
| 2 | Status ready before output arrives → waits correctly, then enables | `waits while status is ready but no output has arrived, then enables` |
| 3 | Valid persisted output fetched after a delay → enables | `reads a persisted output that becomes servable later` |
| 4 | Starter suggestions valid → gate passes | `passes the gate with valid starter suggestions` |
| 5 | Starter suggestions invalid → repair, never a bypass | `keeps the repair action and the closed gate for a legacy analysis` |
| 6 | Wrong analysis id → no unlock | `does not unlock when the status names another analysis id` |
| 7 | Wrong snapshot id → no unlock | `does not unlock when the served output belongs to another snapshot` |
| 8 | Wrong project id → no unlock | `does not unlock when the served output belongs to another project` |
| 9 | Stale event from an older attempt → ignored | `keeps the reconciled row when a stale frame names an older analysis` |
| 10 | Refresh returns the same correct final state | `reaches the same final state on a fresh mount (refresh)` |
| 11 | Polling/SSE reconnect reconciles | `reconciles again after a transient read failure on the next frame` + `re-subscribes with the analysis project so frames carry the ready identity` |
| 12 | No duplicate analysis generation | `never triggers a duplicate analysis and never charges again on re-fetch` |
| 13 | No extra credit charge from re-fetching | same test (1 POST, no preflight, repeated GETs are free) |
| 14 | No accidental navigation | `never navigates away while reconciling` |

Plus the regression witness `reconciles while a trigger request is still in
flight` (defect A) and the identity test for defect B.

Root-cause proof: reverting only the read-effect change to its previous form
makes that file fail with `expected undefined to be "analysis-1"` (trigger in
flight) and `expected false to be true` (newer pending attempt); all other
scenarios pass both ways because they never depended on the removed vetoes.

## 6. Component reuse

No new UI primitive and no new dependency. The only visual change is one more
state on the existing analysis row, rendered by the existing `StageRow` /
`StageIcon` / `Spinner` set — the same primitives the other three rows use. The
existing `ScreenConnectSummaryFooter`, its `Button`, the repair card
(`legacy-analysis-warning` + `refresh-legacy-suggestions-button`) and the
conclusion surface are untouched. Checked the local design system
(`src/components/ui/`: `spinner`, `orb`, `agent-thinking`, `thought-line`,
`alert`, `button`, `icon`, `page-heading`) and the existing row primitives for a
ready-made "preparing" indicator; the row already has the one needed (`waiting`),
so pulling in an external loading/shimmer component (shadcn/MagicUI/HeroUI/
ReactBits/AffectUI/ThinkingOrbs-class) would add a dependency to restyle a state
that already exists. No new loading card, banner, tracker, refresh button, fake
label, or manual confirmation step was added.

## 7. Verification

Targeted runs only — no browser QA, no Playwright/Puppeteer (the task forbids
it):

| Check | Command | Result |
| --- | --- | --- |
| New gate suite | `vitest run src/features/codebase/tests/onboarding-conclusion-gate.test.tsx` | PASS — 16/16 |
| Gate + presentation | `vitest run` on `onboarding-conclusion-gate`, `screen-connect.gating`, `sync-stage-list.observability` | PASS — 62/62 |
| Onboarding/analysis set | `vitest run` on `plan-codebase-analysis`, `plan-codebase-conclusion`, `sync-stage-list.observability`, `screen-connect.gating`, `onboarding-conclusion-gate` | PASS — 75/75 |
| Onboarding/analysis set 2 | `vitest run` on `plan-codebase-live`, `onboarding-display-states`, `sync-session-reset-lifecycle`, `analysis`, `onboarding-analysis-lifecycle`, `onboarding-recovery-lifecycle`, `analysis-selection`, `use-codebase-sync-stream`, `workspace-readiness`, `analysis-recovery-requirements` | PASS — 168/168 |
| Whole feature dir | `vitest run src/features/codebase` | 1895 passed, 13 failed — all pre-existing (§8) |
| Typecheck | `tsc --noEmit` | PASS for every touched path; only the pre-existing `studio-composer.test.tsx` `Promise.withResolvers` lib error remains |
| Lint/format | `biome check --write` on the 7 touched files | PASS, 0 errors (1 file reformatted) |
| Production build | `pnpm build` | PASS — `✓ built in 13.66s` |

## 8. Known pre-existing, unrelated failures

Unchanged by this fix and reproducible on the current HEAD without it:

- `tests/auto-name.test.ts` — 10 failures (`expected 401 to be 200`): its fake
  `@/db` filters the transaction row by `codebaseId`, which its own row fixture
  does not carry, so the handler fails closed with 401. Fails identically alone
  and in the whole-dir run.
- `tests/plan-codebase-name.test.tsx` and `tests/use-codebase-sync-status.test.tsx`
  fail only inside the whole-directory run (1s `findBy*`/wait windows starved by
  the suite's import load) and pass when run per file — the same batch flakiness
  recorded in `docs/codebase-fix01-sync-handshake-progress.md` §9.
