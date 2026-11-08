# Existing Codebase — FIX 03 Recovery Presentation Record

Scope: the recoverable-prompt presentation on `/plan/codebase` (its copy, its
layout inside the existing prompt box) and the sync header's repository eyebrow.
The report is `docs/prompts-cb-existing/p3.md`; FIX 01/FIX 02 own the behavior
underneath this presentation.

## 1. Approved copy, in one place

`src/features/codebase/components/workspace/prompt-recovery-state.tsx` is the
single source of every recoverable-state string, so the onboarding page and the
prompt row cannot drift apart.

| State | Heading | Description | Action | Supporting note |
| --- | --- | --- | --- | --- |
| A — prompt unavailable, sync not started | `Lanjutkan sinkronisasi` | `Prompt sebelumnya tidak tersedia lagi setelah halaman ditutup. Buat prompt baru untuk melanjutkan repository ini.` | `Buat prompt baru` | `Prompt sebelumnya tidak berlaku setelah diganti.` |
| B — session expired before the CLI started | `Sesi sinkronisasi berakhir` | `Buat prompt baru untuk melanjutkan sinkronisasi repository ini.` | `Buat prompt baru` | — |
| C — replacement in progress | `Menyiapkan prompt baru...` (+ `Spinner`) | — | — (no action while a request is pending) | — |
| D — prompt replaced | the real CLI prompt returns; the recovery copy disappears | — | `Salin` (existing) | no success card, no toast |
| E — genuine replacement failure | `Prompt belum berhasil dibuat` | `Permintaan belum berhasil. Coba buat prompt lagi.` | `Coba lagi` | — |
| F — CLI already active | `Agent sedang menyinkronkan repository.` | — | — (no replacement offered) | — |
| G — upload completed | `Source code berhasil diterima.` | — | — (analysis owns the next step) | — |

Rejected wording is gone from the flow: "Token sebelumnya hanya dikirim sekali",
"Buat sesi pengganti", "Token sebelumnya akan dinonaktifkan", "Recovery
required", "Generate credential", "Perbarui otorisasi", "Restore session", and
`Coba lagi` for a normal recovery.

`failed` is set only when the replacement request itself failed
(`useCodebaseOnboarding.retrySession`), so `Coba lagi` can never appear for a
session that merely lost its one-time credential.

## 2. Presentation

- `LockedPromptStateView` (`locked-prompt-state.tsx`) was reworked from a
  centered 190px-min empty state to a left-aligned block: title, description
  (max `62ch`), action, optional note. The same view serves the credit lock,
  prompt recovery, and the pending replacement — one primitive, three variants
  (`insufficient` | `unavailable` | `pending`).
- Nothing is wrapped in a second card: state A/B/C/E renders *inside* the prompt
  box (border + background already owned by step 1). The decorative lock icon
  was removed; the only remaining icon is the existing success tick on the
  transport-done row, where it carries meaning.
- The spinner appears only for `pending`, i.e. while a real `POST
  /api/codebases/:id/session` is in flight; no timer, no minimum display time.
- Buttons keep the prompt row's existing sizing (`variant="secondary"`,
  `min-h-11 px-3.5 text-xs`), and the palette stays on the design tokens
  (`text-snow` / `text-fog` / `text-mist` / `blue-400`). No red background, no
  overlay, no modal, no new gradient or shadow.
- The sync header lost its whole eyebrow row (`Project / {displayName}`,
  including the `Repository belum terdeteksi` fallback). It now shows only the
  heading and the description:
  `Sync codebase dengan everythings-vibe` +
  `Salin instruksi berikut, lalu jalankan melalui AI coding agent di root
  repository kamu.`
  Repository identity belongs to History/Workspace once the CLI has reported the
  real folder name; no placeholder name is presented as identity anywhere on
  this screen.

## 3. Files changed

| File | Change |
| --- | --- |
| `src/features/codebase/components/workspace/prompt-recovery-state.tsx` | **New.** Approved copy for states A/B/C/E + the one replacement button. |
| `src/features/codebase/components/workspace/locked-prompt-state.tsx` | Left-aligned view, optional `note`, `pending` variant with the existing `Spinner`; lock icon dropped. Credit copy untouched. |
| `src/features/codebase/components/workspace/plan-codebase-page.tsx` | Recovery state is chosen per state (`replacing` → `failed` → `expired` → `unavailable`) and built by the shared factory. |
| `src/features/codebase/components/workspace/screen-connect-prompt-step.tsx` | State F/G copy; the terminal row now renders the shared recovery view (states A/B/E) instead of an ad-hoc centered block; `prompt-box` test hook added. |
| `src/features/codebase/components/workspace/screen-connect.tsx` | Eyebrow removed, exact header description, unused display-name resolver import dropped. |
| `src/features/codebase/tests/prompt-recovery-presentation.test.tsx` | **New.** FIX 03 requirements 1-19. |
| `src/features/codebase/tests/plan-codebase-name.test.tsx`, `screen-connect.test.tsx`, `onboarding-idempotency-ui.test.tsx` | Repinned from the removed eyebrow/old copy to the approved contract. |

## 4. Component discovery (FIX 03 §8)

Repository first: the prompt container, `Button`, `Spinner` (HeroUI spinner
wrapper), `Icon`, `LockedPromptStateView`, `buildLockedPrompt`, and
`LockedPromptAction` → `TopUpModal` already cover every need. Nothing new was
authored beyond one copy/state factory.

| Source | Candidate | Verdict |
| --- | --- | --- |
| `ui.shadcn.com` | [Alert](https://ui.shadcn.com/docs/components/base/alert) | Rejected: a bordered callout grid would nest a second card inside the prompt box and add an icon column the state does not need. |
| `heroui.com` | [Alert](https://www.heroui.com/en/docs/components/alert) (`status="danger"/"warning"`) | Rejected: status-coloured alert chrome is exactly the "recovery shown as an error" treatment the report rejects. HeroUI is still used where it fits — through `src/components/ui/spinner.tsx`. |
| `magicui.design` | animated/AI components | Rejected: recovery is not AI streaming; animation would add motion without information. |
| `reactbits.dev` | creative animation components | Rejected: no affordance matches a credential-recovery row. |
| `thinkingorbs.com` | Thinking Orbs | Rejected: not a model-reasoning surface. |
| `affectui.com` | agent components | Rejected: would add another state surface for a two-line message. |

**No new dependency, card, modal, or animation was added.** `docs/codebase-fix02-component-discovery.md`
came to the same conclusion for the same container.

## 5. Business logic untouched (FIX 03 §7)

No change to one-time token generation, session schema, automatic rotation,
repository creation, credit eligibility, the analysis pipeline, pending
sessions, or History navigation semantics. The recovery state still never mints
or rotates: the only transition to a new credential is the user's click, which
sends `{ action: "retry", sessionId }` for the SAME session. `SYNC_SESSION_ACTIVE`,
`SYNC_SNAPSHOT_UPLOADED`, and `SYNC_SESSION_STALE` still re-read authoritative
status instead of offering a replacement.

## 6. Deliberate choices worth knowing

- **Brand spelling.** The brief writes the heading as `Sync codebase dengan
  everything-vibe`; the shipped heading stays `Sync codebase dengan
  everythings-vibe`, which is the product, the repository, and the string the
  whole suite already asserts. Only that one word differs from the brief.
- **State G overlap.** `Source code berhasil diterima.` is also the
  count-less fallback for the third sync-stage row (`sync-stage-rows.ts`).
  A real upload reports `<n> file berhasil diterima.`, so the two sentences
  coincide only when the server has no count. The prompt-row wording is
  mandated verbatim by the brief and the stage row belongs to the sync log, so
  neither was rewritten.
- **Near-expiry warning** (`Sesi segera berakhir. Salin dan jalankan prompt
  sekarang, atau perbarui sesi.`) is a valid-prompt state, not a recovery state,
  and was left untouched.

## 7. Verification

`src/features/codebase/tests/prompt-recovery-presentation.test.tsx` covers
requirements 1-19: exact heading/description/action for A and B, the supporting
note only for A, no `role="alert"` for expected recovery, state C's spinner only
while the deferred request is open, state D replacing the message with the real
credential, state E's title/description/single `Coba lagi`, state F hiding any
replacement while the CLI is live, state G requiring no further prompt, the
header having no eyebrow/placeholder/extra subtitle, the copy action still
writing the live credential to the clipboard, focusability and single-action
structure of the recovery row, one reused region inside `prompt-box` (no second
card or dialog), no credit-approval control, and exactly one repository created
across a replacement.

Browser QA, Playwright, Puppeteer, and screenshot tests were not used.

Executed results (this branch, after the change):

- `pnpm vitest run src/features/codebase/tests` → 166/167 files pass,
  1862/1872 tests pass. The single failing file is `auto-name.test.ts`
  (10 tests, handshake auto-naming, mocked-drizzle write-predicate assertions).
  It fails identically at HEAD in a clean `git worktree`, i.e. it predates this
  change and lives in the server naming contract FIX 03 §7 forbids rewriting.
- `pnpm exec tsc --noEmit` → clean (exit 0).
- `pnpm biome check <touched files>` → clean.
- `pnpm build` → success.
