# Existing Codebase — FIX 04 Onboarding Lifecycle Record

Scope: `/plan/codebase` (new repository, resume sync, retry analysis) and the
planning readiness guard that consumes the result. Produced per FIX 04 §11
("Report state model, route intent handling, files changed, and regression test
results").

## 1. Identity model (the source of truth)

```
CODEBASE
 ├── SYNC SESSION            one credential, one transport attempt
 │    └── SNAPSHOT           verified upload, owned by exactly that session
 │         ├── ANALYSIS ATTEMPT 1   own credit operation + idempotency key
 │         └── ANALYSIS ATTEMPT 2   retry: same snapshot, new attempt
 └── SYNC SESSION 2
      └── SNAPSHOT 2
```

Every projection is scoped by that tree:

| Projection | Scoping |
| --- | --- |
| `GET /api/codebases/:id/status` | `codebase.userId = session.userId`, snapshot `syncSessionId = session.id` |
| SSE `/sync-stream` | same snapshot read; frames carry `projectId` + `sessionId`, mismatches dropped |
| `POST /api/codebases/:id/session` | codebase ownership, then `prepareSyncSession` under an advisory lock |
| `GET/POST /api/v1/projects/:id/codebase/analysis` | project ownership → session ownership → snapshot ∈ those sessions |

Status fields now carry `analysisProjectId` (the codebase anchor), so a refresh no
longer depends on a browser pointer to find the analysis record.

## 2. Navigation intents

| Intent | URL | Behaviour |
| --- | --- | --- |
| NEW | `/plan/codebase?intent=new` | forget browser pointers + all visible state, check eligibility, create a repository, prompt ready. History rows untouched. |
| RESUME | `/plan/codebase?intent=resume` (History cards) | read persisted status, resume the same session/snapshot/analysis. |
| (bare) | `/plan/codebase` | refresh: resolve the stored pointer against server truth. |

The route keys the page on the intent (`key={intent ?? "recover"}`), so switching
NEW → RESUME remounts the machine instead of migrating old state into it.

## 3. Display states (mutually exclusive)

| State | Shown | Never shown |
| --- | --- | --- |
| A waiting for CLI | `Menunggu agent` with three idle rows (no spinner, no timer) | any running indicator, analysis rows, new-session offer |
| A′ CLI announced, handshake pending | `Menghubungkan agent...` from the persisted `cli_connecting` event | any spinner without that event |
| B CLI syncing | `Agent terhubung` → `Mengunggah repository...` | analysis progress, new-session offer |
| C uploaded, analysis pending | `Sinkronisasi selesai` + `Menganalisis repository...` | new-session offer |
| D uploaded, analysis failed | `Sinkronisasi selesai` + `Analisis belum berhasil` + `Coba Analisis Lagi` | new-session offer |
| E token expiring/expired before upload | `Buat prompt baru` (see `codebase-fix02-prompt-recovery.md`) | analysis progress |
| F ready | `Analisis selesai` + enabled workspace CTA | retry panels |

The prompt row keeps the prompt it was handed: a live credential stays visible
with its copy action through connecting, upload, and completion (FIX 01 removed
the "transport done" / "CLI active" replacements). Only a credential the server
would reject — expired, or a terminal session — leaves the prompt, and it is
replaced by the renewal state above, never by success copy.

### 3.1 Progress honesty (waiting is not activity)

Every stage row comes from persisted server status through one mapping
(`resolveSyncStageView` in `services/sync-stages.ts`):

- `waiting_for_cli` → three idle rows. Waiting for the user is not system
  activity: no spinner, no elapsed timer, and copying the prompt changes nothing
  (the clipboard is browser-local feedback, not evidence the CLI ran).
- `waiting_for_cli` + a persisted `cli_connecting` event → the agent row turns
  into `Menghubungkan agent...` with a measured elapsed timer. That event is
  written only by the CLI's announcement (`POST
  /api/v1/codebases/:id/codebase/connect`), so polling, a repaint, or a copy
  click can never produce it.
- `connected` / `scanning` / `filtering` → the handshake checkmark plus the
  source-preparation row running, because the CLI handshakes before it walks the
  repository.
- `uploading` → running upload row with a count only from persisted rows.
- `uploaded` / `ready` → completed rows.
- `failed` / `expired` → the stage list is withheld (the status does not record
  which step broke) and one recovery card is shown instead.

There is still no `connecting` status enum value. The connecting phase is an
event, not a status: the handshake commits `waiting_for_cli → connected` in one
transaction, so a persistent intermediate status would be a state a failed
handshake could strand the session in. A fast handshake is rendered as already
connected instead of a fabricated spinner, and a CLI that never announces simply
has no connecting phase.

## 4. Token lifecycle

- Valid token: prompt shown, copyable.
- Expired before upload: renewal is an explicit user action (`action: "retry"`
  with the current session id).
- Recovery is `action: "recover"`: it re-derives the same credential and never
  rotates one an agent may already hold.
- Uploaded snapshot: recovery returns `409 SYNC_SNAPSHOT_UPLOADED` with the
  session id instead of minting; a browser that still holds the credential keeps
  showing that prompt, and a browser that does not states that the prompt was
  only available once instead of showing a success message (FIX 01). The
  analysis lifecycle continues either way.
- Expiry no longer rewrites a session that already persisted a snapshot; its own
  snapshot keeps serving status.
- No raw token is written to `localStorage`; the only browser token copy is the
  one-time Home handoff in `sessionStorage`, removed on read.

## 5. Attempt & retry rules

- Retry targets `lastStatus.snapshotId` (the current uploaded snapshot): no new
  session, no repository, no re-upload.
- The client is single-flight per snapshot (`analysisWorkingRef` set before the
  first `await`), so a double click resolves to one request.
- A concurrent server attempt (`409 ANALYSIS_IN_PROGRESS`) is treated as pending,
  never as a failure, and the status loop owns the outcome.
- A delivery failure (network/abort) clears the working paint without inventing a
  failed attempt; the persisted attempt remains the truth.
- A retry request paints running, and a stale failed row is suppressed while it
  runs (`showAnalysisFailure` excludes retrying/working/pending).
- Credit idempotency key is derived from `(project, snapshot, refreshAnalysisId)`,
  so retries reuse or replace a reservation instead of charging twice.

## 6. Backend readiness guard

`requireProjectGenerationContext` fails closed (`409 CODEBASE_CONTEXT_UNAVAILABLE`)
for an existing-codebase project when the codebase's newest snapshot is not
uploaded/ready, or when the resolved context belongs to an older snapshot. Reading
saved Feature/PRD/AC/Task is untouched: `canReadExistingPlans` still allows
`existing_plan_readonly`, and no artifact is deleted on a failed re-sync.

## 7. Files changed

Production:

- `src/features/codebase/hooks/use-onboarding-recovery.ts` — pointer ownership,
  transient failure kept, no auto-rotation, persisted anchor project, stale
  response guard.
- `src/features/codebase/hooks/use-codebase-onboarding.ts` — identity-filtered
  status, atomic fresh-start reset, explicit renewal, upload guard.
- `src/features/codebase/hooks/use-onboarding-analysis.ts` — identity generation
  guard, no implicit retry of a failed attempt, single-flight retry, pending
  reconciliation.
- `src/features/codebase/hooks/use-onboarding-analysis-state.ts` — read
  generation guard, clear retry paint on reset.
- `src/features/codebase/hooks/use-codebase-sync-status.ts`,
  `use-codebase-sync-stream.ts` — project/session frame validation.
- `src/features/codebase/services/onboarding-requests.ts` — 404 = stale, other
  failures = transient; explicit session id; `ANALYSIS_IN_PROGRESS` = pending.
- `src/features/codebase/services/sync-session-route.server.ts`,
  `sync-session-prepare.server.ts` — uploaded context is not expired or replaced.
- `src/features/codebase/services/sync-status-snapshot.server.ts` — own snapshot
  only, expired-after-upload keeps its snapshot, anchor project projection.
- `src/features/codebase/services/generation-context-requirement.ts` — newest
  snapshot must own the context.
- `src/features/codebase/services/workspace-readiness.ts` — completion statuses
  instead of snapshot-context statuses.
- `src/features/codebase/types/sync-schemas.ts` — `analysisProjectId`.
- `src/features/codebase/components/workspace/screen-connect-prompt-step.tsx`,
  `plan-codebase-page.tsx`, `components/planning/codebase-library-item-card.tsx`,
  `src/routes/plan/codebase.tsx` — display precedence, recovery retry, resume
  intent, intent-keyed remount.

Regression tests added:

- `tests/onboarding-recovery-lifecycle.test.tsx`
- `tests/onboarding-analysis-lifecycle.test.tsx`
- `tests/onboarding-display-states.test.tsx`
- `tests/onboarding-transport-controls.test.tsx`
- `tests/onboarding-session.integration.test.ts` (real PostgreSQL)
- `tests/onboarding-planning.integration.test.ts` (real PostgreSQL)

Updated because the superseded behaviour changed:

- `tests/plan-codebase-conclusion.test.tsx` — a mid-flight attempt no longer
  offers a replacement credential; a persisted failure is retried explicitly
  (one POST) instead of automatically on mount.
- `tests/plan-codebase-analysis.test.tsx` — the mock now resolves the failure to
  pending on the retry attempt instead of replaying the old status.
- `tests/library-view.test.tsx` — History cards navigate to `?intent=resume`.

FIX 01 (`docs/codebase-fix01-sync-handshake-progress.md`) supersedes the
prompt-row precedence listed above: the transport-done and CLI-active states were
removed, and the CLI announcement boundary was added. Its file list is there.

## 8. Verification

| Check | Result |
| --- | --- |
| `pnpm exec tsc --noEmit` | pass |
| `pnpm biome check` on every touched path | pass |
| `pnpm vitest run src/features/codebase packages/cli` | pass |
| `pnpm build` (`studio:assets:check` + `vite build`) | pass |

Pre-existing failures outside this scope (unrelated modules, unchanged by FIX 04):
`components/faq/faq.test.tsx` (heading size copy), `components/ui/agent-thinking.test.tsx`
(fake-timer timeout), `features/billing/tests/plans.test.ts` (pricing copy string),
`features/studio/tests/*` (design theme/reference matrix, worker lock integration).

## 9. Component reuse

No new onboarding UI. Reused `ScreenConnect`, `ScreenConnectPromptStep`,
`ScreenConnectSyncStep`, `SyncStageList`, `LockedPromptStateView`, `Button`,
`Spinner`, `Icon`. Reviewed shadcn, HeroUI, Magic UI, React Bits, Thinking Orbs,
and affectUI: every candidate (alert cards, animated lists, orb status
indicators) duplicated a primitive this flow already ships, so none was added.