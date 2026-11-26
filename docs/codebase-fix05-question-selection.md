# FIX 05: Existing Codebase Adaptive Clarification Selection Reset

Scope: the clarification question cards in the codebase chat workspace
(single-select, multi-select, custom answer, text, and the edit-an-answer flow).
No other surface was touched.

## Root cause (proven, not assumed)

`src/features/codebase/hooks/use-adaptive-question-selection.ts` owned its
selection state through a derived value plus a reset effect:

```ts
const initialSelections = useMemo(() => { /* derive from `submitted` */ }, [
  submitted, question.type, question.options, customId,
]);

const [selectedOptionId, setSelectedOptionId] = useState(initialSelections.selectedId);
// ...two more useState...

useEffect(() => {
  setSelectedOptionId(initialSelections.selectedId);
  setMultiOptionIds(initialSelections.multiIds);
  setCustomText(initialSelections.custom);
}, [initialSelections]);
```

`question.options` is an array, so the memo keyed on **reference identity**.
Any parent render that hands down an equivalent-but-newly-allocated options
array (a re-derived question graph, a restored/persisted question list, a fresh
`mapAskQuestionsToAdaptive` result) produced a new `initialSelections` object,
which re-ran the effect and overwrote the user's in-progress choice with the
seed value — `null` for an unanswered question. The reset therefore happened
*after paint* (effect), which is exactly the observed
"selected → momentarily unselected → `Konfirmasi` disabled" flicker.

Evidence (`tests/adaptive-question-selection-persistence.test.tsx` against the
pre-fix hook): selecting option B and rerendering with
`question={selectQuestion()}` (equal contents, new array) left
`radio("Judul dan deskripsi").checked === false`; the text-question draft
(`customText`) was likewise wiped to `""`. Rerendering with the *identical*
object kept the selection — confirming the trigger is reallocated option
identity, not the click path, not the control contract, not remounting
(`key={question.id}` is stable, `onChange`/`checked` wiring is correct).

## Corrected state ownership

- One draft object per card: `{ key, selectedOptionId, multiOptionIds, customText }`.
- The draft is seeded from `submitted` (server answer) and re-seeded **only**
  when its reset key changes:
  `${question.id}\u0000${question.type}\u0000${submitted}`.
  Array identity of `question.options` is deliberately excluded.
- Re-seeding happens during render (`stored.key !== resetKey`), so there is no
  post-paint overwrite and no flicker; no `useEffect` reset remains.
- Handlers write into the draft; `submitted` stays the persistence source of
  truth for confirmed answers, and confirmation still flows through the
  existing `onSubmit(questionId, answer)` pipeline (one call per click).

Reinitialization still happens for: a genuinely different `question.id` or
`question.type`, a changed persisted answer (external revision / hydration), and
intentional edit-cancel (the parent drops `isEditing`, the card falls back to
the persisted `submitted` line). No `JSON.stringify(question.options)` guard and
no frozen question object.

## Reused components

No UI was redesigned; every control is the existing primitive.

| Concern | Reused component / primitive |
| --- | --- |
| Option row | `CodebaseAdaptiveQuestionOptionRow` (native `<input type="radio">` / `"checkbox"`, controlled `checked` + `onChange`) |
| Option group | `CodebaseAdaptiveQuestionOptions` (`fieldset` for multi-select, `aria-labelledby` → question title for single-select) |
| Free text ("Lainnya") | `CodebaseAdaptiveQuestionAnswerInput` |
| Submit / cancel | `src/components/ui/button.tsx` |
| Selection state | `useAdaptiveQuestionSelection` (logic fix only) |

The pre-fix primitive was not broken: `checked` was already driven by state and
`onChange` already committed to that state. The reset came from the hook, so
replacing the primitive would have hidden the lifecycle bug rather than fixed
it.

### Library exploration

| Source | Candidate | Verdict |
| --- | --- | --- |
| ui.shadcn.com | `RadioGroup` / `RadioGroupItem` | Rejected: needs `@radix-ui/react-radio-group`, which is not installed. The existing native radios already give one tab stop, arrow-key navigation, and a single `name` group, so a new dependency would buy nothing. |
| heroui.com | `RadioGroup` | Rejected: `@heroui/react` is installed but unused for radio groups here; swapping the primitive would change the card's visuals for no behavioral gain. |
| magicui.design, reactbits.dev | animated option components | Rejected: decorative motion on a form control; the brief forbids new animations. |
| thinkingorbs.com | Thinking Orbs | Rejected: not a reasoning surface. |
| affectui.com, tuffui.com, CUI, sakaniui.com | agent/stepper components | Rejected: would replace the clarification card the brief requires us to keep. |

No dependency was added.

## Behavior contract now enforced

1. Select an option → it stays selected across parent rerenders, operation
   status changes, composer/popover updates, and reallocated option arrays.
2. `Konfirmasi` enables only for a valid answer (a choice, and non-empty text
   when "Lainnya" is chosen) and submits exactly once.
3. Switching to another question id seeds that question's own answer.
4. Single-select keeps one choice; multi-select keeps several; custom text and
   the "Lainnya" state survive unrelated rerenders.
5. Text-question drafts survive unrelated rerenders.
6. Editing starts from the persisted answer, edits are not rolled back, and
   cancel restores the original confirmed answer.

Keyboard scope: jsdom cannot exercise a browser's native radio arrow-key
traversal, so the tests pin the accessible contract that enables it — a
`radiogroup` (single-select) or `fieldset` (multi-select) named after the
question, one shared radio `name` per group, and focusable native inputs — and
leave arrow-key behaviour to the platform primitive rather than reimplementing
it in JS.

## Files

| File | Change |
| --- | --- |
| `hooks/use-adaptive-question-selection.ts` | Removed the options-identity `useMemo` + reset `useEffect`; added keyed draft state (`deriveDraft`, `resetKey`) and draft-writing handlers. Public hook contract unchanged. |
| `tests/adaptive-question-selection-persistence.test.tsx` | New regression suite (11 cases) reproducing the original flicker and pinning all question types, editing, and workspace-level rerenders. |

## Verification

- New suite: `adaptive-question-selection-persistence.test.tsx` — 11/11 pass on
  the fixed hook. Before the fix, 7 of these 11 fail (reallocated options,
  custom text, multi-select, text draft, repeated hydration, editing, and
  workspace-level rerender), which is the recorded reproduction.
- Question surface batch (`adaptive-question-selection-persistence`,
  `adaptive-question`, `clarification-persistence-retry`,
  `clarification-persistence-save`, `chat-workspace`, `thinking-flow`):
  6 files / 138 tests pass.
- `pnpm biome check` on the two touched files: clean.
- `pnpm exec tsc --noEmit`: only the pre-existing
  `src/features/studio/tests/studio-composer.test.tsx:241` lib mismatch remains.
- `pnpm build`: success (`✓ built in 32.84s`, Nitro output generated).
- Full `src/features/codebase` suite: 160/176 files pass. The failures are not
  this change's surface — `auto-name.test.ts` fails standalone (pre-existing,
  recorded by FIX 03), and the rest reproduce as 5s jsdom timeouts only while
  vitest, `tsc`, and the production build run concurrently on this machine;
  sampling them standalone (`workspace-task-subnav`,
  `prompt-recovery-presentation`, `composer-redesign-modes`) passes.

No browser, Playwright, screenshot, or manual QA was used.

