# FIX 02: Professional Question Cards and Rich Answer Selection UI

Scope: the Existing-Codebase clarification card only — option display order, the
choice-card anatomy, the recommendation badge, and the main question card's
hierarchy. No new workflow, no new wizard/modal/page, no Greenfield change, no
DB migration, no new dependency.

## 1. Root cause of the old UI

| Defect | Why it looked generic |
| --- | --- |
| Recommendation could render anywhere in the list | `mapAskQuestionsToAdaptive` kept the model's canonical order and nothing re-ordered it for display (`recommendedOptionId` existed but no view used it) |
| Options were heading-only text (or heading + a line under it) | `AdaptiveQuestionOptionRow` was a `<div>` with a border + padding wrapping a native `<input type="radio">`; heading and description were two spans in one flow, so there was no hierarchy to scan |
| The badge was a hand-rolled emerald pill | `border-emerald/30 bg-emerald/10 text-emerald` inside the row's own `<span>` — a green "success" tint for what is only advice |
| Selection state was a border/background swap with `focus-within` | No control-level change, no selected control, no card-level state derived from the control's own props |
| The card was flat | progress, heading, options, and footer shared one border and one type scale; nothing separated metadata from the question |

## 2. Component discovery

Searched and evaluated the mandated libraries plus the repository's own
primitives. Real components, not names:

| Library | Candidate | Verdict |
| --- | --- | --- |
| **HeroUI v3** (`@heroui/react` 3.2.6, already a dependency) | `RadioGroup` + `Radio` (`Radio.Content` / `Radio.Control` / `Radio.Indicator`), `CheckboxGroup` + `Checkbox`, `Description` | **Chosen.** React Aria based: single/multi semantics, roving tab stop, native `<input type="radio">` grouping, and the option's description wired through `aria-describedby` come from the library. Already installed and already used in this repo (`Tabs`, `Tooltip`, `ToggleButtonGroup`) with project Tailwind classes — the same pattern as the existing `workspace-task-subnav` usage. |
| HeroUI `Chip` | `Chip` with `variant`/`color` | **Rejected for the badge.** Its visual layer is a BEM class (`.chip--default`) whose CSS lives in `@heroui/styles`, which this app does not import; using it would either ship an unstyled chip or force a global HeroUI stylesheet into `src/styles.css` and restyle unrelated surfaces. Kept as the documented fallback. |
| HeroUI `Chip` / `Badge` / `Surface` / `Fieldset` for the card shell | — | Not needed: the card shell is layout, and reusing the project `Button`/`Badge` primitives keeps the design-system tokens. |
| **shadcn/ui** | Radio Group "Choice Card" pattern (`RadioGroup` + `RadioGroupItem` + `Field`/`FieldLabel`/`FieldTitle`/`FieldDescription`), `Badge` | **Reference only.** Validates the anatomy this fix implements (whole card = one label, title + description per option), but adopting it would require pulling Radix `@radix-ui/react-radio-group` and the new `Field` set into a repo that already ships HeroUI for exactly this. Not installed. |
| **affectUI** | `Decision Card` (numbered options, one Recommended, card options), `Checkbox` (card row variant) | **Reference only.** Closest interaction reference in the brief, but it is one-file-per-component copy-in code with its own styling conventions; two problems to solve, two sources of design drift. |
| **Magic UI** | animation/background effects | Rejected: no form control or choice card; the brief forbids decorative animation on the question card. |
| **ReactBits** | animation/effect components | Rejected, same reason. |
| **Thinking Orbs** | loading orbs | Rejected: the card has no loader; the real activity surface (`AgentThinking`) is elsewhere and untouched. |
| **TuffUI / CUI / SakaniUI** | component catalogs without a selectable choice card matching the anatomy | Rejected: nothing that beats HeroUI's already-installed `Radio`/`Checkbox` + `Description`. |
| Repository `src/components/ui` | `Badge`, `Button`, `Input`, `Icon` | **Reused.** `Badge` (`variant="default"`: solid platinum on charcoal, `rounded-md`, no border/glow) for the recommendation badge; `Button` for Konfirmasi/Batal; `Input` for the revealed free-text field. |

Decision: reuse what is installed and already used in this codebase (HeroUI for
the control primitives, project primitives for chrome) instead of adding a
second selection component system.

### Finalists against the brief's criteria

| Criterion | HeroUI `RadioGroup`/`Radio`/`Checkbox`/`Description` | shadcn/ui Radio Group + Choice Card |
| --- | --- | --- |
| Function fit | Radio group and checkbox group, exactly the two shapes the question needs | Same shapes, but a different primitive family from the one already in use |
| Heading + description support | `Description` is a field slot wired into `aria-describedby`; heading is the label | `FieldTitle` + `FieldDescription`, equally capable |
| Controlled selection | `value` / `onChange` (single) and `value` / `onChange` (array, multi) | Same (Radix `onValueChange`) |
| Single + multi select | Both, from one family | Both, from two components |
| Keyboard accessibility | React Aria: roving tab stop, native radio grouping, arrow keys | Radix: roving focus and arrow keys |
| Hover / selected / disabled / focus states | Render props (`isSelected`, `isDisabled`, `isHovered`, `isFocusVisible`) + `data-*` selectors | Same idea, via `data-state` |
| React 19 + Tailwind 4 | Installed and already working in this repo (`Tabs`, `Tooltip`, `ToggleButtonGroup`) | Would add `@radix-ui/react-radio-group` plus the new `Field` set |
| Design-system consistency | Styled with this repo's own tokens (`graphite`/`charcoal`/`snow`/`indigo`), like `workspace-task-subnav` | Needs its own `shadcn` token layer |
| Dependency cost | Zero — already a dependency | New packages, second component system |
| Reuse in existing architecture | One component in the existing `chat/` folder, no new tree | Same, but with new local primitives |

## 3. What was used in the end

- `RadioGroup` + `Radio` / `Radio.Content` / `Radio.Control` / `Radio.Indicator`
  — single-select answer cards.
- `CheckboxGroup` + `Checkbox` (+ the same sub-parts) — multi-select answer cards.
- `Description` — each option's lower-emphasis explanation, announced via
  `aria-describedby` (it sits *beside* the label, so it never becomes part of the
  option's accessible name).
- Project `Badge variant="default"` — solid, neutral, small radius, no blur,
  gradient, or glow, and never louder than the option heading.
- Project `Button` and `Input` — footer actions and the revealed custom answer.

## 4. Files changed

| File | Change |
| --- | --- |
| `src/features/codebase/services/chat-flow-questions.ts` | New pure `orderOptionsForDisplay(options, recommendedOptionId)`: recommended option first, everything else in canonical relative order, same option objects, input untouched, no-op when there is no valid recommendation. |
| `src/features/codebase/components/chat/codebase-adaptive-question-option-row.tsx` | Rewritten as a HeroUI choice card: control + heading + badge + `Description`, card/control/indicator state from the field's own render props, `group/option` scoped selection styling, optional `children` so a revealed field stays inside its own card. |
| `src/features/codebase/components/chat/codebase-adaptive-question-options.tsx` | Renders the display-ordered list inside HeroUI `RadioGroup` / `CheckboxGroup`; the custom "Lainnya" option is a normal card with heading + description; separate `selectedId` / `selectedMultiIds` props (no casts). |
| `src/features/codebase/hooks/use-adaptive-question-selection.ts` | `handleOptionChange` (single, set) + `handleMultiChange` (multi, set the group's array) replace the hand-rolled toggle; shared `rebaseDraft` for the re-seed rule. |
| `src/features/codebase/components/chat/codebase-adaptive-question-active.tsx` | Card hierarchy: metadata row → question as the focal text → answer area → separated footer with the reused `Button`. |
| `src/features/codebase/components/chat/codebase-adaptive-question-progress.tsx` | Small uppercase marker + `tabular-nums` counter, one hairline under it. |
| `src/features/codebase/tests/adaptive-question.test.tsx` | Description assertions moved to the real `aria-describedby` wiring; new tests for order/identity/no pre-selection/tab stop + group label/revealed field/cross-question independence. |
| `src/features/codebase/tests/chat-flow.test.ts` | `orderOptionsForDisplay` unit tests, including proof that the transform never touches the canonical model or the persisted handoff. |

## 5. How the recommendation always becomes the first option

`orderOptionsForDisplay` is a presentation-only transform, called by the options
component with `question.recommendedOptionId` (the FIX 01 data):

- valid recommendation → `[recommended, ...rest in canonical order]`;
- missing/invalid/absent id → the array is returned as-is and **no badge or
  label is invented**;
- already first → unchanged, so nothing shifts needlessly;
- the array holds the *same* option objects, so option ids, the saved label, the
  persisted `recommended` index, and `recommendedOptionId` all keep pointing at
  the same option;
- the canonical model is never mutated, so `serializeAskQuestions` keeps writing
  canonical order and the same index;
- the custom "Lainnya" option is not part of the ordering and always stays last.

## 6. Card, badge, and panel changes

- **Choice card**: `Radio`/`Checkbox` field root is the card surface (border,
  radius, background, hover); the label is the clickable row (control + heading +
  badge); the description is the field's `Description`; selected = border +
  surface + control colour + indicator dot, plus the control's dot, never text
  colour alone. Alignment is `items-start` so headings stay level even when one
  description wraps — the control never floats to the vertical middle of a long
  card. No nested interactive elements, no double-click behaviour, no animated
  gradient, no permanent glow, no hover transform, no large shadow.
- **Badge**: solid neutral project `Badge` (`variant="default"`), `rounded`,
  `text-[10px]`, rendered once, only on the recommended option, inside the
  heading row (so it wraps under a long heading instead of overlapping it).
  The emerald/border/glow treatment is gone and was not replaced with a
  transparent blue/purple/neon variant.
- **Recommendation panel**: `CodebaseAdaptiveQuestionRecommendation` does not
  exist in the tree and no longer has a consumer (removed under FIX 01); its
  reasoning lives in the recommended option's own description. Nothing replaced
  it — no tooltip, accordion, popover, or expandable explanation.
- **Main question card**: small uppercase marker + `tabular-nums` counter above a
  hairline, question as the largest text on the surface, consistent `gap`
  between options, and a footer separated by a hairline with Konfirmasi
  right-aligned and quiet. No decorative progress bar, second stepper, repeated
  header, robot icon, model/technical info, fake stats, or loading animation.
  The backend exposes no per-question supporting sentence
  (`AskQuestion` = id/question/type/options/recommended/reason), so none is
  shown — nothing static was invented.
- **Custom answer**: the "Lainnya" card carries its own heading and description;
  choosing it reveals the free-text input *inside that card*, focused, still
  owned by the same draft (so a parent re-render cannot wipe it), leaving
  Konfirmasi disabled until it has content.
- **Multi-select**: checkboxes with the same heading + description anatomy; the
  group reports the whole array, so re-renders never drop a ticked option.

## 7. Behaviour preserved

AI question generation, single-select, multi-select, custom answers,
confirmation, edit-submitted-answer (pre-filled, with Batal), answer
persistence, history restoration, handoff serialization/restore, feature
generation handoff, question progress, loading/error handling, and keyboard
selection. The compact answered-question line (with its Ubah trigger) is
untouched, and the answer contract is unchanged: only the option **label** is
ever saved, so descriptions and the display order can never move a saved answer.

## 8. Verification

Targeted automated tests only (no browser QA):

- `pnpm vitest run src/features/codebase/tests/adaptive-question.test.tsx` —
  18 passed: recommended-first order with stable ids, single badge and no
  pre-selection, saved answer staying on its own option, labelled group with one
  tab stop and a shared radio name, revealed custom field inside its own card,
  heading/description association via `aria-describedby`, selection + confirm,
  edit + cancel, multi-select join, custom answer, IME-safe Enter, answered
  compact line, cross-question independence.
- `pnpm vitest run src/features/codebase/tests/chat-flow.test.ts` — 29 passed:
  the pure ordering transform (order, identity, no mutation, no-op without a
  recommendation) and the proof that the presentation order never reaches the
  canonical model or the persisted handoff (recommendation index and label
  survive a save → restore round-trip).
- `pnpm vitest run src/features/codebase/tests/chat-workspace.test.tsx` — 78
  passed (the integration card, including the reason-on-the-option assertion).
- `pnpm vitest run src/features/codebase/tests/adaptive-question-selection-persistence.test.tsx`
  plus the two clarification-persistence suites — 24 passed (re-render does not
  wipe a draft, custom input survives, answers persist).
- `pnpm vitest run src/features/codebase/tests` — whole Existing-Codebase suite:
  1967 passed, 14 failed. Those 14 are **pre-existing and unrelated** (they fail
  at HEAD without this change, and none of the modules they exercise import a
  file touched here): `auto-name.test.ts` (10, the sync handshake answers 401),
  `plan-codebase-name.test.tsx`, `codebases-pages.test.ts` (a source-text
  assertion on `loadCodebase`), and the timing-sensitive
  `use-codebase-sync-status.test.tsx` / `workspace-analysis-reconciliation.test.tsx`
  (these two vary between runs on a shared machine).
- `pnpm biome check` on every touched file, and `pnpm exec tsc --noEmit`
  (the only error reported is the pre-existing
  `Promise.withResolvers` lib-setting error in
  `src/features/studio/tests/studio-composer.test.tsx`, untouched by this fix).
- Tailwind compile check for the selected-state styling: the candidate
  `group-data-[selected]/option:block` compiles to
  `.group-data-\[selected\]\/option\:block:is(:where(.group\/option)[data-selected] *)`,
  so the control/indicator selection rules are real utilities rather than dead
  class names. `border-indigo` is not a default Tailwind colour; it resolves
  because the project defines `--color-indigo`, so it is safe here.

## 9. Not verified (deliberately)

No browser, Playwright, Puppeteer, or screenshot QA was run, so the following
are reasoned from the component contracts, not observed on screen: real
rendering of the HeroUI-based cards in the browser, the exact wrap behaviour of
a long heading against the badge at narrow container widths, the visible focus
ring, dark/light contrast ratios, and native arrow-key navigation (jsdom has no
native radio-group keyboard behaviour, so the test asserts the structural
guarantees it depends on — one tab stop, shared `name`, labelled group — and not
the arrow key itself).
