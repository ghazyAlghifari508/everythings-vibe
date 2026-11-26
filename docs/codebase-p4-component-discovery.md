# Existing Codebase — P4 Component Discovery Record

Scope: the Existing Codebase adaptive clarification wizard
(`docs/prompts-cb-existing/p4.md`): one navigable question card, its option
anatomy, its progress indicator, and its final specification action. Produced
per the project rule to record the discovery result and the reason a ready-made
solution was or was not used.

## 1. Repository baseline (search existing components first)

| Existing asset | Path | Use in P4 |
| --- | --- | --- |
| HeroUI `Radio` / `RadioGroup` (`Radio.Content`, `Radio.Control`, `Radio.Indicator`) | `@heroui/react` (v3.2.6, installed and already used by this feature) | Single-select options. React Aria gives roving tab stop, native `<input type="radio">` grouping, `data-selected` render props, and `aria-describedby` wiring. |
| HeroUI `Checkbox` / `CheckboxGroup` (`Checkbox.Content`, `Checkbox.Control`, `Checkbox.Indicator`) | `@heroui/react` | Multi-select options, same family and same keyboard contract. |
| HeroUI `Description` | `@heroui/react` | The option's supporting line, announced as the control's description through the field's own text slot. |
| HeroUI `ProgressBar` + `Label` + `ProgressBar.Output` / `Track` / `Fill` | `@heroui/react` | The wizard's "Pertanyaan 2 · 2 dari 4" indicator: `role="progressbar"` with a real `aria-valuenow` / `aria-valuetext` and the fill width computed by the component. |
| Project `Button` (CVA) | `src/components/ui/button.tsx` | `Sebelumnya` (ghost) and the forward control (`Berikutnya` / `Buat Spesifikasi Fitur`). |
| Project `Badge` | `src/components/ui/badge.tsx` | The neutral `Rekomendasi` badge. |
| Project `Icon` + Hugeicons | `src/components/ui/icon.tsx` | `ArrowLeft01Icon` / `ArrowRight01Icon` in the wizard footer. |
| Project `Alert` + `CodebaseChatWorkspace*Error` rows | `src/components/ui/alert.tsx`, `src/features/codebase/components/chat/codebase-chat-workspace-error-rows.tsx` | The answers-save failure row with its own retry action. |

The app does **not** import `@heroui/styles`; HeroUI components are styled with
this project's Tailwind tokens, exactly as the existing `Radio`/`Checkbox`
usage in this feature already does. Every layout class is therefore explicit in
the component.

## 2. Candidates evaluated

| Need | Candidates | Verdict |
| --- | --- | --- |
| Step-based question flow | (a) Magic UI / React Bits Pro / affectUI / TuffUI / CUI / SakaniUI wizard blocks; (b) HeroUI primitives + local wizard state; (c) a stepper dependency | **(b) chosen.** The surveyed libraries ship animation-first copy-in blocks (Magic UI is text/background effects; React Bits' wizard is a paid Pro block; affectUI is AI-product screens) and none of them model "one answer card at a time, answers persisted to a handoff". Pulling one in would add a styling system and an animation layer for a step index. |
| Option control | (a) hand-rolled radio/checkbox markup; (b) HeroUI `Radio`/`Checkbox`; (c) shadcn/ui `RadioGroup` + `Field` set | **(b) chosen.** Already installed, already used in this file, and it owns selection semantics, keyboard handling and description wiring. (c) would add Radix radio-group + the `Field` set to a repo that already ships the React Aria equivalent. |
| Progress indicator | (a) plain text counter; (b) HeroUI `ProgressBar`; (c) a custom SVG bar | **(b) chosen.** It is the installed, accessible determinate indicator (`aria-valuenow` + `aria-valuetext`), and its layout is four short utility classes in this app's token layer. (a) lost the "how far am I" signal the redesign calls for; (c) would re-implement a primitive that exists. |
| Option-card alignment ("heading and description on one column") | (a) `padding-inline-start` on the description; (b) HeroUI's field-level `ps-7` indent; (c) the card's own two-column grid | **(c) chosen.** (a) is the defect being fixed and (b) is a hand-tuned offset that breaks on long headings; (c) makes the control width and the text column one declared track that the heading, the description, and the revealed field all occupy. |
| Card-to-card transition motion | (a) a motion/animation library; (b) none | **(b) chosen.** The brief forbids installing a heavy animation library to move one card; the step change is a state swap. |

## 3. New dependencies required

**None.** Every control, indicator, button, and alert row already exists in
`@heroui/react` or in `src/components/ui/`.

## 4. Custom-implementation rationale

The only new logic written by hand is the wizard's step state and the answer
persistence gate (`src/features/codebase/components/chat/codebase-chat-workspace-questions.tsx`).
No control, keyboard model, progress fill, alert chrome, or animation was
re-implemented: those come from the installed primitives listed above. The
description was deliberately kept **outside** the clickable label so the
option's accessible name stays the heading — placing it inside HeroUI's
`Radio.Content` would fold the description into the accessible name, which is
why the text column is declared by the card instead.
