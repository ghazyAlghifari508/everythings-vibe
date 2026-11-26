# Existing Codebase — FIX 01 Real Sync Handshake Progress & Immutable Prompt

Scope: the initial sync of an existing codebase (`/plan/codebase`, sync step 1
and 3, plus the CLI transport that feeds them). Report for
`docs/prompts-cb-existing/p1.md`.

## 1. Root cause

**Problem A — the checkmark was instant because the connecting phase did not
exist.** The one status→stage mapping (`resolveSyncStageView`) rendered
`waiting_for_cli` as three idle rows and everything from `connected` onward as
already-finished or active work. The CLI's first contact with the server was its
handshake, and the handshake committed `waiting_for_cli → connected` in a single
transaction. Between "the user ran the prompt" and "connected" the server
observed nothing at all: the CLI resolved the repository root and read the Git
identity locally, then announced itself only by connecting. So the browser had
exactly two honest options — show the checkmark the moment it landed, or invent a
connecting state. It showed the checkmark (correct, but it left the user unable
to see the transition they asked for).

**Problem B — the prompt box was also a status surface.**
`ScreenConnectPromptStep` rendered a five-state precedence chain
(`promptUsable` → `transportComplete` → `cliActive` → `isStarting` →
recovery). `transportComplete` was handed `stageView.syncComplete`, so as soon as
the upload finished, the box replaced the credential with `Source code berhasil
diterima.`; while the CLI was uploading it replaced it with `Agent sedang
menyinkronkan repository.`. Both replacements were keyed on server progress, not
on the prompt's own lifecycle.

## 2. Event source (Problem A)

The connecting phase now comes from one real, CLI-emitted event through the
existing transport:

```
CLI `codebase sync` starts
        │  POST /api/v1/codebases/$id/codebase/connect   { cliVersion }
        ▼
server: append `cli_connecting` to session metadata.lifecycle   (status stays waiting_for_cli)
        │  (concurrently with local root resolution + Git identity read)
        ▼
POST /api/v1/codebases/$id/codebase/sync   (handshake)
        │
        ▼
server: waiting_for_cli → connected + `agent_connected`         (one transaction)
        ▼
upload_started → snapshot_persisted
```

Why an event and not a status: the status column records what the transport has
committed. A persistent `connecting` status could not be left honestly — a
handshake that failed afterwards would strand the session in it, and only the
handshake may commit a connection because only it carries the repository
identity the upload is bound to. The event is append-only, bounded, idempotent by
kind, and read through the same projection polling already returns.

Guarantees that keep it from becoming a false claim:

| Concern | How it is excluded |
| --- | --- |
| Browser polling looks like connecting | The row state is derived from `metadata.lifecycle`, never from a read, a timer, or a repaint. |
| Copying the prompt starts motion | Clipboard feedback is browser-local and writes nothing. |
| Duplicate announcement moves the timestamp | `appendSyncLifecycleEvent` is idempotent by kind: the first event wins. |
| A late announcement repaints a connected attempt | The announce transaction writes the event only while the status is still `waiting_for_cli`. |
| Out-of-order frames rewind the view | The `agent_connected` event supersedes `cli_connecting`, and a frame older than the last accepted event id is dropped by the stream hook. |
| A CLI dies between announce and handshake | The announcement binds the attempt's snapshot, so the CLI can report the failure through `/codebase/failure`; a terminal status stops the spinner and offers the retry. |
| Snapshot/attempt timelines mix | Session id pins both the event log and every frame; a frame from another session is dropped. |
| A fast handshake is held open | Nothing waits: the row becomes a checkmark the moment `agent_connected` is persisted. |

Source of truth: `codebaseId` + `sessionId` (attempt) + lifecycle `kind`/order +
`at` timestamp; the status enum stays the stage vocabulary.

## 3. Mapping change

`services/sync-stages.ts` + `services/sync-stage-rows.ts` — one mapping, four
observable shapes:

| Persisted server fact | Row 1 (agent) | Row 2 (source) | Row 3 (upload) |
| --- | --- | --- | --- |
| `waiting_for_cli`, no announcement | `Menunggu agent` (idle, no spinner, no timer) | `Menyiapkan source code` (idle) | `Mengunggah repository` (idle) |
| `waiting_for_cli` + `cli_connecting` | `Menghubungkan agent...` (spinner, elapsed timer from the event) | idle | idle |
| `connected`/`scanning`/`filtering` | `Agent terhubung` (checkmark) | `Menyiapkan source code...` (spinner) | idle |
| `uploading` | done | done | `Mengunggah repository...` (spinner, real count) |
| `uploaded`/`ready` | done | done | `Sinkronisasi selesai` |
| `failed`/`expired` | list withheld, one recovery card | — | — |

Analysis keeps its own row (unchanged): an upload can finish while the model is
still pending, and an analysis failure must never read as a failed upload.
Exactly one stage can be active at a time, and `hasStarted` is now true for the
announced connecting phase as well (real CLI activity, not a user wait).

## 4. Prompt lifecycle change (Problem B)

Chain before: `live prompt → transport done → CLI active → starting → renewal`.
Chain now: page-owned lock → live prompt → no-credential statement → starting →
renewal.

- A live credential (schema-validated payload, not expired, session not
  terminal) renders the prompt **and** its copy action in every sync state —
  waiting, connecting, uploading, uploaded. Sync progress never participates.
- The prompt container is not remounted on status change (`key` is the session
  id, not the status), so scroll position, size, and the `max-h-56` viewport are
  preserved, and no credential is re-fetched to keep the view alive.
- `Source code berhasil diterima.` / `Agent sedang menyinkronkan repository.`
  are gone from the box: sync progress is reported only by step 3 (`Pantau
  progres`).
- A credential the server would now reject (expired, `failed`, `expired`) routes
  through the existing renewal state (`Buat prompt baru`) instead of any success
  copy, so an unusable credential is never offered.
- With no credential in this browser (full reload, or the token already in the
  CLI's hands) the box states one fact — `Prompt ini hanya tersedia sekali di
  browser tempat ia dibuat.` — and offers no action. The one-time token boundary
  is untouched: it is never re-read from a server, and the browser vault stays
  in-memory (`sync-prompt-vault.ts`: no localStorage, no sessionStorage).
- A replacement action is never offered while the CLI is mid-sync
  (`connected`/`scanning`/`filtering`/`uploading`): minting a credential there
  would rotate the token a live upload is using.

## 5. CLI compatibility & release

| Direction | Behaviour |
| --- | --- |
| Old CLI → new server | No announcement is sent, so no connecting phase exists; every other state is identical to before. |
| New CLI → old server | The announcement endpoint answers 404, the client resolves `null`, and the sync proceeds unchanged. |
| New CLI → new server | Connecting phase is observable, and pre-handshake failures terminate the attempt. |

- Additive protocol: the announcement is a new suffix on the existing
  `/api/v1/codebases/$id/codebase/*` boundary, uses the same Bearer credential,
  version gate and rate-limit budget, and shares its credential resolution with
  the handshake (`sync-cli-auth.server.ts`) so both answer identically.
- `CODEBASE_CLI_MIN_VERSION` stays `2.0.0`: the minimum is unchanged, because
  the announcement is optional. Nothing is released by the web deploy alone.
- The announcement costs one request per sync and no latency: it is fired before
  local preparation and awaited only immediately before the handshake, so it
  costs nothing when it is slow and still lands first in the normal case.
- **Release required for the user-visible half of Problem A:**
  `packages/cli` must be bumped and published
  (`@ghazynabiel/everythings-vibe`) so `npm i -g`
  / `npx` delivers the announcement. Until then, the server and UI ship the
  full Problem B fix plus the mapping that renders a connecting phase the moment
  a CLI reports one.
- Failure path: when the announcement landed, any later handshake failure
  (including the fail-closed 426 version gate) is reported by the CLI, so the
  session moves to `failed` and the browser shows the retry instead of waiting on
  a connecting row until expiry.

## 6. Files changed

| File | Change |
| --- | --- |
| `src/features/codebase/types/sync-schemas.ts` | `cli_connecting` lifecycle kind; `cliConnectResponseSchema`. |
| `src/features/codebase/services/sync-lifecycle.ts` | Rationale for the connecting event vs. status; no new status value. |
| `src/features/codebase/services/sync-handshake.ts` | `buildCliVersionMetadata` (announcement is not handshake evidence). |
| `src/features/codebase/services/sync-handshake-transaction.server.ts` | `announceOnly` mode: binds the snapshot, records `cli_connecting`, never advances the status. |
| `src/features/codebase/services/sync-cli-auth.server.ts` | New: shared Bearer/credential/ownership resolution, version gate, transport budget. |
| `src/features/codebase/services/sync-connect-route.server.ts` | New: announcement handler. |
| `src/routes/api/v1/codebases/$id/codebase/connect.ts` | New: route declaration (plus regenerated `src/routeTree.gen.ts`). |
| `src/features/codebase/services/sync-handshake-route.server.ts` | Reuses the shared auth/version/budget helpers. |
| `src/features/codebase/services/sync-stages.ts`, `sync-stage-rows.ts` | `connecting` progress derived from the event; connecting row copy + real `startedAt`. |
| `src/features/codebase/components/workspace/screen-connect-prompt-step.tsx` | Prompt replacement states removed; availability statement; mid-sync replacement guard. |
| `src/features/codebase/components/workspace/screen-connect.tsx` | `transportComplete` prop removed. |
| `packages/cli/src/lib/sync-client.ts` | `announceConnect` (never throws) + `ConnectResponse`. |
| `packages/cli/src/commands/codebase.ts` | Announces before local preparation; reports pre-handshake failures against the announced attempt. |
| `docs/codebase-fix03-recovery-presentation.md`, `docs/codebase-fix04-lifecycle.md` | Superseded presentation rows and the "no connecting state" rationale updated. |

Tests added:

- `src/features/codebase/tests/sync-connect.integration.test.ts` — real
  PostgreSQL: connecting phase without connection, snapshot binding, idempotent
  duplicate announcement, late announcement ignored, handshake hand-over,
  failure-report termination, credential/ownership/version gates, expiry.
- `src/features/codebase/tests/sync-stage.test.ts` — connecting mapping, hand-over,
  out-of-order announcement, terminal withholding, copy/repaint inertness, copy
  leak check.
- `src/features/codebase/tests/sync-stage-list.indicators.test.tsx` — exactly one
  spinner while connecting; copying the prompt starts no stage.
- `src/features/codebase/tests/onboarding-transport-controls.test.tsx` — prompt
  preserved through `uploaded`; no status copy in the box; billing lock never
  replaces a live prompt; stored upload with no credential offers nothing.
- `src/features/codebase/tests/prompt-recovery-presentation.test.tsx` — live CLI
  and stored-upload states repinned to prompt availability.
- `packages/cli/src/lib/sync-client.test.ts`,
  `packages/cli/src/commands/codebase.test.ts` — announcement request identity,
  best-effort `null`, ordering before the handshake, failure reporting (and its
  absence when the announcement never landed).

## 7. Component reuse

No new UI primitive, no new dependency. Reused `SyncStageList`, `StageRow` /
`StageIcon`, `Spinner`, `Icon`, `Button`, `LockedPromptStateView`, and the
existing prompt box. Reviewed shadcn/ui and HeroUI spinners (Magic UI's spinner
page 404s) plus the design-system primitives already in
`src/components/ui/`: both library spinners are the same
`animate-spin` + `motion-reduce:animate-none` indicator this flow already ships,
so importing one would duplicate an existing primitive for no gain. No
decorative progress card, no percentage, no second spinner, no hourglass, no
layout change to the onboarding screen.

## 8. Verification

See §9 of `docs/codebase-fix04-lifecycle.md` for the repository's standing
command set. This fix was verified with targeted runs only (no browser QA, no
Playwright, no screenshots, per the task):

| Check | Command | Result |
| --- | --- | --- |
| Unit + component + integration | `vitest run src/features/codebase packages/cli` | see §9 |
| Typecheck | `tsc --noEmit` | see §9 |
| Lint/format on touched files | `biome check <paths>` | see §9 |
| Production build | `pnpm build` | see §9 |

## 9. Results

Run on the finished tree (targeted verification, no browser QA — the task
forbids Playwright/screenshot QA):

| Check | Command | Result |
| --- | --- | --- |
| Typecheck | `tsc --noEmit` | PASS for every touched path. The single remaining error is pre-existing and unrelated: `src/features/studio/tests/studio-composer.test.tsx(241,55)` `Promise.withResolvers` lib-target error (already recorded in `docs/codebase-fix04-lifecycle.md` §8). |
| Lint/format | `biome check` on all 24 touched files | PASS (0 errors after `--write`). |
| Unit + component + integration (14 files, 224 tests) | `vitest run` on: `sync-connect.integration`, `sync-stage`, `sync-stage-list.indicators`, `onboarding-transport-controls`, `prompt-recovery-presentation`, `screen-connect.gating`, `onboarding-idempotency-ui`, `analysis-credit-onboarding`, `library-view`, `onboarding-idempotency.integration`, `onboarding-replacement.integration`, `onboarding-session.integration`, `packages/cli/src/lib/sync-client`, `packages/cli/src/commands/codebase` | PASS — 224/224. |
| Credit policy untouched | `vitest run src/features/billing` | 293 passed, 1 pre-existing failure (`tests/plans.test.ts` pricing-copy string, recorded in `docs/codebase-fix04-lifecycle.md` §8). |
| Production build | `pnpm build` (`studio:assets:check` + `vite build`) | PASS (`✓ built in 24.64s`). |

Known pre-existing, unrelated failures in `src/features/codebase` (unchanged by
this fix, reproduced on a clean checkout of HEAD with every change stashed):

- `tests/auto-name.test.ts` — 10 failures: its fake `@/db` filters the
  transaction row by `codebaseId`, which the transaction's own row fixture does
  not carry, so the handler fails closed with 401. Fails identically without
  this fix.
- A batch of jsdom component tests (`library-view`, `codebase-library-*`,
  `analysis-credit-onboarding`, `onboarding-idempotency-ui`,
  `plan-codebase-analysis`, `prompt-recovery-presentation`) fails only when the
  whole directory runs at once and passes when run per file; the same files fail
  the same way on a clean HEAD. Their 1 s `findBy*` windows are starved by the
  suite's import/parallelism load (the full-dir run reports ~4000 s of
  accumulated import time). Every file this fix touches passes both alone and in
  the 14-file affected-set run above.
