# Existing Codebase — FIX 02 Component Discovery Record

Scope: the `/plan/codebase` entry prompt container, its locked variant, and the
sync progress line. Produced per the FIX 02 §10 "Component Exploration" mandate
(record the discovery result and why a ready-made solution was or was not used).

## 1. Repository baseline (search existing components first)

| Existing asset | Path | Finding |
| --- | --- | --- |
| `Spinner` (wraps HeroUI `Spinner`) | `src/components/ui/spinner.tsx` | The design system's one loading indicator, already `motion-safe:animate-spin` gated. Used for the in-flight prompt box and the connecting progress line. |
| `LockedPromptStateView` + `buildLockedPrompt` | `src/features/codebase/components/workspace/locked-prompt-state.tsx` | Already the single locked-prompt presentation shared by onboarding and re-sync. Reused unchanged; no new lock card authored. |
| Prompt container (numbered step 1) | `src/features/codebase/components/workspace/screen-connect-prompt-step.tsx` | The real CLI instruction box. Kept; only the render precedence was corrected. |
| `SyncStageList` | `src/features/codebase/components/workspace/sync-stage-list.tsx` | The one server-state → stage mapping. Unchanged. |
| `LockedPromptAction` → TopUpModal | `locked-prompt-action.tsx`, `src/features/billing/components/top-up-modal.tsx` | The real billing flow; the only action a blocked account gets. Unchanged. |

## 2. Candidates evaluated

| Need | Candidates | Verdict |
| --- | --- | --- |
| In-flight indicator | (a) existing `Spinner`; (b) Thinking Orb (`src/components/ui/orb.tsx`); (c) new animated card | **Chosen: (a).** Already installed and used by every other status row; (b) is tuned for chat streaming and oversized for a status line; (c) would duplicate an available primitive. |
| Locked prompt | (a) existing `LockedPromptStateView`; (b) a new approval/consent card | **Chosen: (a).** (b) is the exact gate FIX 01 removed and FIX 02 forbids; no approval variant exists anywhere in the flow. |
| Idle progress copy | (a) reuse the stage-list line, chosen by real request state; (b) new idle skeleton | **Chosen: (a).** One line, no fabricated progress; a skeleton would claim a request that is not running. |

## 3. New dependencies required

**None.** HeroUI is already installed; no external component library was added and
no new status card, loader, modal, or animation was authored from scratch.
