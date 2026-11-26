# FIX 04: Existing Codebase Re-sync Modal Presentation

Scope: the workspace `Perbarui repository` modal. Backend session semantics are
FIX 03's and unchanged.

## Reused components

The modal is composed from the onboarding sync screen's own blocks; no second
step or prompt design exists.

| Concern | Reused component / primitive |
| --- | --- |
| Prompt row, one-time credential states, internal prompt scroll | `ScreenConnectPromptStep` (new `heading`, `promptMode`, `copyAriaLabel`, `contentTestId`, `recoveryState` props; defaults unchanged for onboarding) |
| Step 2 | `ScreenConnectAgentStep` (new `title`, `description`, `showHarnesses` props; defaults unchanged) |
| Step 3 | `ScreenConnectSyncStep` (new `heading`, `description`, `idleLabel` props; defaults unchanged) |
| Stage rows and approved stage names | `SyncStageList` → `StageRow` → `resolveSyncStageView` |
| Recovery block | `LockedPromptStateView` (left-aligned, inside the prompt box) |
| Dialog, close control | `src/components/ui/dialog.tsx` (Radix `Dialog`) |
| Buttons | `src/components/ui/button.tsx` |
| Loading indicator | `src/components/ui/spinner.tsx` (HeroUI `Spinner`) |
| Icons | `src/components/ui/icon.tsx` (Hugeicons) |
| Copy feedback | `useCopyFeedback` |

Deleted instead of kept: the bespoke `codebase-resync-modal-steps.tsx` stepper
and the `codebase-resync-drawer.tsx` backwards-compatibility alias.

### Library exploration

| Source | Candidate | Verdict |
| --- | --- | --- |
| ui.shadcn.com | Dialog, Button | Already installed and reused through the local primitives. ScrollArea is not installed; the existing prompt `overflow-y-auto` container already scrolls long credentials. |
| heroui.com | Spinner | Reused through `src/components/ui/spinner.tsx`. Other components would add new chrome. |
| magicui.design, reactbits.dev | animated/AI components | Rejected: progress must reflect server events, not decorative motion. |
| thinkingorbs.com | Thinking Orbs | Rejected: this is not a model-reasoning surface. |
| affectui.com, tuffui.com, CUI, sakaniui.com | agent/stepper components | Rejected: would replace the onboarding stepper the brief requires us to reuse. |

No dependency was added.

## Corrected flow

1. `openResync` opens the modal. A live attempt (prompt in memory, or a status
   that is not finished) is restored without a request.
2. A finished attempt (`ready`, `failed`, `expired`, or ready analysis) gets a
   fresh request identity before `POST /session { action: "resync", requestId }`,
   so the replay guard cannot hand back the finished attempt without a prompt.
3. `isStarting` renders the real spinner only while the server prepares the
   session; old payload and old progress are cleared, and any stale poll frame is
   ignored until the new session exists.
4. Prompt returned → copied with `Salin` / `Tersalin`, then the agent step and the
   live stage list.
5. `Selesai` unlocks only for `isResyncSessionVerified` (active session's uploaded
   snapshot + ready analysis ID). Closing never revokes anything; reopening
   restores the attempt.

## Error placement

- Session-creation failure: one block inside step 1 —
  `Sinkronisasi belum bisa dimulai.` + `Coba lagi`, which repeats the exact
  request that failed.
- Status-read failure: one block inside step 3.
- Failed/expired sync: the existing `Sinkronisasi belum berhasil` block in step 3
  with its explicit retry request.
- Session-creation failures no longer write the shared workspace error, and the
  full-width workspace banner is hidden while the modal is open, so the same
  failure cannot appear twice.
- Removed: `Token sync sudah kedaluwarsa atau belum tersedia`,
  `Dapatkan token baru`, the success banner, credit/approval copy, the lock and
  ticket icons, and the real-time status subtitle.

## Files

| File | Change |
| --- | --- |
| `components/planning/codebase-resync-modal.tsx` | Rewritten as a compact composition of the onboarding blocks. |
| `components/planning/codebase-resync-modal-steps.tsx` | Deleted. |
| `components/planning/codebase-resync-drawer.tsx` | Deleted (unused alias). |
| `components/workspace/screen-connect-prompt-step.tsx` | Optional heading/mode/copy/recovery props; defaults unchanged. |
| `components/workspace/screen-connect-agent-step.tsx` | Optional title/description/harness props; defaults unchanged. |
| `components/workspace/screen-connect-sync-step.tsx` | Optional heading/description/idle label; defaults unchanged. |
| `components/workspace/codebase-workspace-resync.tsx` | Rewired to the new modal contract. |
| `components/workspace/codebase-detail-page.tsx` | Workspace banner hidden while the modal owns the operation. |
| `hooks/use-workspace-sync-session.ts` | Live-vs-finished open decision, request identity rotation, modal-owned session errors, exact retry. |
| `hooks/use-codebase-sync.ts` | Dedicated `statusError` for the modal progress step. |
| `tests/resync-modal-lifecycle.test.tsx` | Presentation, lifecycle, error and completion contract. |
| `tests/resync-lifecycle.test.tsx` | Stage mapping plus modal non-interference and failure-once assertions. |
| `tests/resync-modal-verification.test.tsx` | Completion gate repinned to the shared stage list. |
| `tests/use-codebase-resync.test.tsx` | Credit bypass, modal error ownership/clearing, duplicate-session, close, retry. |
| `tests/resync-drawer.test.tsx` | Deleted (legacy alias coverage folded into the files above). |

## Verification

- Targeted Vitest suites: resync modal lifecycle, resync lifecycle, completion
  gate, session hook, screen connect, prompt recovery, onboarding display and
  transport controls, and prompt/session expiry all pass.
- `pnpm biome check` on every touched file: clean.
- `pnpm exec tsc --noEmit`: only the pre-existing
  `src/features/studio/tests/studio-composer.test.tsx:241` lib mismatch remains.
- `pnpm build`: success (Vite server bundle + Nitro).

Four files fail in the full codebase suite and are outside this modal's
surface: `plan-codebase-name.test.tsx`, `codebases-pages.test.ts`, and
`workspace-analysis-reconciliation.test.tsx` fail identically with this change
stashed at HEAD (verified in this session); `auto-name.test.ts` is the
pre-existing failure recorded by FIX 03. No new failure was introduced.

No commit, push, merge, or publish was performed.