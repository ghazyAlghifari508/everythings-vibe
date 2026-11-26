# Existing Codebase — P4 Adaptive Question Wizard

Scope: the Existing Codebase clarification questions only
(`docs/prompts-cb-existing/p4.md`): option anatomy, one navigable question card,
the final specification action, and the answer-persistence gate. No new
workflow, no DB migration, no new dependency, no Greenfield change.

## 1. Defect → cause → fix

| Reported defect | Cause in the old implementation | Fix |
| --- | --- | --- |
| Option heading and description visually misaligned; wrapped description lines not sharing one left edge | The description was a field-level sibling positioned with `[padding-inline-start:2.625rem]` (card padding + control + gap), so it could never line up with its own heading and any heading that wrapped broke the stack | The option card is now a two-column grid (`1rem` control track + `minmax(0,1fr)` text column); the clickable row, the description, and the revealed free-text field each declare that same track. No element carries a hand-set indent |
| Description lines disconnected from their heading | Same cause: the description was offset by a constant, not attached to the heading's column | Description sits as the card's own row on the option's text column, directly under the heading it belongs to |
| Answered questions became separate success/check cards with `Q1… Jawaban… Ubah` | `CodebaseAdaptiveQuestion` rendered `CodebaseAdaptiveQuestionAnswered` for every answered question, plus the active card | The answered card component is deleted; the wizard renders exactly one card |
| Completed question list became excessively long | The list rendered `visibleQuestions = questions.slice(0, currentIndex + 1)`, i.e. every answered question as a card plus the active one | The wizard renders a single question; earlier answers are reached through `Sebelumnya` |
| `Buat Spesifikasi Fitur` appeared as a disconnected action below the questions | `CodebaseChatWorkspaceQuestionsComplete` was a separate block rendered after the whole question list | The final action is the last question's own forward control inside the card footer; the separate block is deleted |
| Previous-answer editing depended on summary cards | Editing was an `editingQuestionId` mode with its own `Batal`/`Konfirmasi` pair, only reachable through the `Ubah` link | Editing is wizard navigation: `Sebelumnya` reopens the earlier question with its stored answer selected and editable |

## 2. State behaviour

| State | Owner | Behaviour |
| --- | --- | --- |
| Current step | `CodebaseChatWorkspaceQuestions` (`WizardState.step`, keyed by the round's question ids) | Opens on the first unanswered question, or the last question when every answer is stored (that is where the final action lives). `Sebelumnya`/`Berikutnya` move the step; a new round of questions re-derives the step from the answers instead of inheriting the previous position |
| Answer draft of the open question | `useAdaptiveQuestionSelection` (unchanged contract) | The card owns the in-progress choice and is seeded from the stored answer; a parent that re-derives an equivalent question graph never wipes the draft |
| Stored answer | workspace state (`answers`), persisted by `useWorkspaceHandoffPersistence` | `Berikutnya` stores the open question's answer before it moves on, so navigating back and forward again keeps the edited answer |
| Final action | `WizardState.awaitingFinal` + the effect in the wizard | The last question's forward control submits its own answer, then generates only once that answer is part of the answers the confirm reads — generation never runs on a stale answer set |
| Generation in flight | workspace `isConfirming` | The final control shows the real operation label (`Menyusun spesifikasi...`) and stays disabled |
| Save failure | `AnswersPersistenceState` (status/error/onRetry) | A failed save blocks every forward control and shows the answers-save error row with its own `Coba simpan ulang` action, so an answer is never carried forward unsaved |
| Read-only review | `answersReadOnly` (stage past `questions`, or a running feature generation) | The same wizard walks the stored answers with the controls disabled and no final action: reviewing old questions cannot silently rewrite an existing plan or start a new one |

## 3. Components used

New/rewritten:

- `codebase-chat-workspace-questions.tsx` — the wizard (step state, gating, final action, save-error row).
- `codebase-adaptive-question.tsx` — one card: draft owner plus wizard footer.
- `codebase-adaptive-question-active.tsx` — card surface, footer, `Sebelumnya`/forward controls.
- `codebase-adaptive-question-option-row.tsx` — the shared two-column option card.
- `codebase-adaptive-question-progress.tsx` — HeroUI `ProgressBar` + `Label`.
- `codebase-chat-workspace-error-rows.tsx` — one shared row implementation behind the spec, stage, and answers-save rows.

Deleted: `codebase-adaptive-question-answered.tsx` (the `Q1… Ubah` summary card).

Rewired: `codebase-chat-workspace-timeline.tsx` (one card per questions entry, no separate CTA block, `answersPersistence` passed through), `codebase-chat-workspace-props.ts`, `codebase-detail-page.tsx`, `use-workspace-chat-controls.ts` (the `editingQuestionId` mode is gone), `use-adaptive-question-selection.ts` (`isEditing` is gone), `use-workspace-handoff-persistence.ts` (`AnswersPersistenceState`).

## 4. Tests

| Suite | Covers |
| --- | --- |
| `tests/adaptive-question-wizard.test.tsx` | One card at a time, initial step, `Berikutnya` stores before moving, `Sebelumnya` restores the stored answer, edited answers survive the round trip, invalid-answer gating, final-action enablement, busy label, save failure + retry, read-only review, reopen, group label/tab stop/progress |
| `tests/adaptive-question-option-layout.test.tsx` | Shared text column for heading/description/revealed field, description outside the accessible name, no hand-set indent, native keyboard-reachable control |
| `tests/adaptive-question.test.tsx` | Card behaviour: recommended-first mapping, stored answer on its own option, single/multi/custom selection, forward gating, review mode, IME and Enter submit |
| `tests/adaptive-question-selection-persistence.test.tsx` | Draft ownership across rerenders, reallocated option arrays, question changes, and unrelated workspace updates |
| `tests/chat-workspace.test.tsx` | Workspace-level wizard rendering, `Sebelumnya` reaching an earlier editable answer, the final CTA inside the card, busy state, spec-error suppression |
| `tests/planning-lifecycle.test.tsx` | Editable while clarifying, read-only review once the feature artifact exists, no generation while reviewing |

Result: **165 tests passed, 10 files, 0 failures** (`pnpm vitest run` over the
suites listed above, 2026-11-11). `pnpm biome check` on every touched path and
`pnpm exec tsc --noEmit` for the whole project are clean for this change; the
only `tsc` error in the repository is pre-existing and unrelated
(`src/features/studio/tests/studio-composer.test.tsx`: `Promise.withResolvers`
needs a newer `lib` target).

## 5. Risks that a jsdom run cannot settle

- **Pixel alignment.** jsdom performs no layout, so "the description shares the
  heading's column" is asserted structurally (same card row / same declared
  track / no inline indent). The actual x-position of wrapped description lines
  needs a browser pass, which P4 defers to P12.
- **HeroUI slot CSS.** The app does not import `@heroui/styles`, so `Radio`,
  `Checkbox`, and `ProgressBar` are styled entirely by this project's Tailwind
  tokens; the `ProgressBar` track/fill geometry in particular is this app's own
  utility sizing on top of the component's computed fill width.
- **Long copy and narrow viewports.** A very long heading next to a long
  description is only verified by the `min-w-0`/`minmax(0,1fr)` contract, not by
  an actual narrow-width render.
