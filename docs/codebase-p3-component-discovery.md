# Existing Codebase — P3 Component Discovery Record

Scope: Redesign of the Existing Codebase credit onboarding and re-sync experience
(`docs/prompts-cb-existing/p3.md`). Produced per `.agents/rules/skills-mcp.md` §2
rule 6 ("record the discovery result and the reason a ready-made solution was
insufficient").

Evaluated existing components in this repository as well as candidate libraries
(`ui.shadcn.com`, `heroui.com`, `magicui.design`, `reactbits.dev`, `thinkingorbs.com`,
and `affectui.com`).

---

## 1. Repository baseline (search existing components first)

| Existing asset | Path | Use in P3 Redesign |
| --- | --- | --- |
| `Dialog` / `DialogContent` / `DialogHeader` / `DialogTitle` / `DialogDescription` / `DialogFooter` | `src/components/ui/dialog.tsx` | Base primitive for `CreditConsentDialog` and `CodebaseResyncModal`, providing focus trap, ESC dismissal, and accessibility. |
| `TopUpModal` | `src/features/billing/components/top-up-modal.tsx` | Pre-installed billing modal reused for the "Tambahkan Kredit" action, both from the locked prompt and within the consent dialog. |
| `Button` (CVA) | `src/components/ui/button.tsx` | Primary action buttons (`Siapkan instruksi`, `Setuju dan lanjutkan`, `Coba lagi`). |
| `Icon` (Hugeicons wrapper) | `src/components/ui/icon.tsx` | `LockIcon` for the blocked prompt state, `Tick01Icon` for success, and `AlertCircleIcon` for errors. |
| `Spinner` | `src/components/ui/spinner.tsx` | Standard indeterminate activity indicator during preflight and session creation. |
| `ScreenConnect` | `src/features/codebase/components/workspace/screen-connect.tsx` | Canonical 3-step onboarding and sync layout. |
| `CodebaseResyncModal` | `src/features/codebase/components/planning/codebase-resync-modal.tsx` | Modal re-sync container with single accessible close button and compact inline cost disclosure. |

---

## 2. Third-party libraries evaluated

| Area | Candidates | Verdict |
| --- | --- | --- |
| Modal & Confirmation Dialog | (a) native `window.confirm()`; (b) shadcn `Dialog`/`AlertDialog`; (c) HeroUI `Modal` | **Chosen: repo shadcn/Radix `Dialog`.** Replaced all native `window.confirm()` calls with `CreditConsentDialog` built on top of the established `Dialog` primitive. HeroUI `Modal` is present in the repo dependencies, but the codebase uses shadcn/Radix primitives for workspace modals, ensuring unified theme tokens (`bg-obsidian`, `border-graphite`, `text-snow`). |
| Top-Up and Billing Flow | (a) custom modal from scratch; (b) affectUI Usage Meter; (c) existing `TopUpModal` | **Chosen: existing `TopUpModal`.** Already integrated with `/api/payments/create`, package selection (`TOPUP_PACKAGES`), and the user plan query. Reused directly with zero new code or styling divergence. |
| Locked Prompt Container | (a) blurred token text; (b) CSS overlay; (c) safe locked state inside step 1 | **Chosen: safe locked prompt in step 1.** Strictly obeys the security contract: never generates or renders raw tokens for unauthorized/insufficient-credit users. Renders `LockIcon`, concise Indonesian copy, and a top-up CTA inside the identical step 1 prompt box. |
| Multi-step Stepper | (a) MagicUI stepper; (b) custom CSS stepper; (c) existing `StepIndicator` & `ScreenConnect` numbers | **Chosen: existing 1-2-3 circular indicators.** Matches the VibeEverything developer-grade aesthetic (`border-iron font-mono text-xs text-mist`) without foreign bloated UI dependencies. |

---

## 3. New dependencies required

**None.** Every element of the redesigned credit onboarding, consent dialog, and re-sync experience is composed from primitives already installed in `src/components/ui/` and `src/features/billing/`.

---

## 4. Custom-implementation rationale

No unrequested abstractions were introduced. The newly added modules:
1. `src/features/codebase/components/workspace/credit-consent-dialog.tsx`: App-owned accessible modal replacing `window.confirm()`.
2. `src/features/codebase/components/workspace/codebase-onboarding-shell.tsx`: Unified onboarding layout handling State A (sufficient credits), State B (insufficient credits with locked prompt), and State C (free initial analysis).
3. `src/features/codebase/components/planning/codebase-resync-modal-steps.tsx`: Modular extraction of the 3 re-sync steps keeping all files under the 350-line ceiling.
