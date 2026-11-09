# FIX 01: Rich Answer Options, Recommendation Identity, and High-Quality AI Copy

Scope: how an Existing-Codebase clarification question is generated, validated,
mapped, persisted, and restored. The option **display order** (recommendation
first) is FIX 02; this fix only guarantees the data contract that makes it safe.
No visual card redesign, no new recommendation card, no DB migration, no
Greenfield workflow change.

## 1. Root cause

| Defect | Evidence in the code before the fix |
| --- | --- |
| Options were short text only | `AskQuestion.options?: string[]` (`ask-service.ts`); `askHandoffQuestionSchema.options: z.array(z.string().max(100))` |
| The recommendation panel duplicated the option it recommended | `codebase-adaptive-question-recommendation.tsx` rendered "Rekomendasi: <label>" + "Alasan berdasarkan codebase: …" in a block *under the whole option list* |
| No option could explain its own consequence | `AdaptiveQuestionOption` had `{ id, label, recommended }` only, and the prompt asked for "3-5 opsi singkat" |
| Recommendation identity was index-only and could silently drift | `serializeAskQuestions` wrote `recommended: findIndex(...)` with no `>= 0` guard (a `-1` would fail schema `min(0)` and 400 the whole handoff), and the reason lived outside the option |
| The persisted state budget fit short text only | `CODEBASE_ASK_HANDOFF_MAX_STATE_CHARS = 20_000`; the over-budget fallback drops `questions` entirely, which makes the handoff unrestorable and the `questions` artifact unreadable |

The reported symptom (the recommendation sometimes appearing second/third) is a
*display-order* problem with a *data* cause: only a label reached the UI, so the
UI had nothing meaningful to show first and no per-option explanation to show at
all.

## 2. Contract after the fix

Canonical option (UI model, assigned identity):

```ts
interface AskQuestionOption { id: string; label: string; description?: string }
```

Wire/persisted option (model output, handoff JSON) — one shape, both real:

```ts
type AskOptionInput = string | { label: string; description?: string };
```

- `label` is the heading **and** the only thing a saved answer ever contains.
  Descriptions are never concatenated into answers.
- `description` is supporting information attached to the option itself, so the
  recommended option can justify itself without a second panel.
- Identity is `buildAskOptionId(questionId, index)` over the **canonical** array.
  Display code sorts a copy (FIX 02); the canonical array is never reordered, so
  the id, `recommendedOptionId`, and the saved label keep pointing at the same
  option.
- `recommended` stays a 0-based index into the canonical array and is validated
  against the surviving options. It is never defaulted to `0`, and it is never
  applied to a `multiselect` question. An out-of-range or reason-less
  recommendation is dropped by the shared validator exactly as before — the
  honest fallback is "no recommendation shown", never "pin option 0".

## 3. Generation and validation

`ASK_CODEBASE_OPTIONS_GENERATION_PROMPT` now emits option objects and carries
the copy rules: heading = what is being chosen, description = what changes,
which also states the five evaluation questions from the brief and an explicit
anti-slop list ("Solusi terbaik untuk kebutuhan Anda", "Memberikan pengalaman
yang optimal", "Lebih fleksibel dan efisien", …). The recommendation rules now
require the justification to be readable from the recommended option's own
description, forbid marking the first option by position, and forbid faking
confidence.

Validation policy is split by question, not duplicated:

| Layer | Policy |
| --- | --- |
| `validateAskQuestions` (shared shape) | Accepts string **or** object options; rejects blank/oversized labels (≤100, the persisted bound), duplicate labels, blank/oversized descriptions (≤400), and a description that only repeats the heading |
| `describeOptionContractMiss` | Existing-Codebase only: an option without a description is a contract miss |
| `generateValidatedAskQuestions({ requireOptionDescriptions })` | A miss consumes the existing **one** bounded repair pass, whose prompt then restates the description rule; a second miss fails visibly with `QUESTION_FORMAT_INVALID` instead of shipping a half-explained list |
| `parseRestoredQuestions` / `restoreAskState` | Legacy-tolerant: strings become headings, descriptions kept only when genuinely stored, nothing invented, malformed entries dropped |

Greenfield keeps its contract: its prompt still emits strings, its repair prompt
is unchanged in shape (`buildAskOptionsRepairPrompt` without the flag), and its
Ask UI projects options to headings through `toAskViewQuestions`.

## 4. Persistence and compatibility

- `askHandoffOptionSchema` is a union (`string | { label, description? }`), so
  handoffs written before FIX 01 still parse through
  `getAskHandoff → askHandoffSchema → parseRestoredQuestions`.
- `sanitizeAskHandoffState` truncates label ≤100 and description ≤400, keeps
  strings as strings (no destructive migration), and validates `recommended`
  against the options that actually survive.
- `CODEBASE_ASK_HANDOFF_MAX_STATE_CHARS` raised 20 000 → 48 000 (jsonb) so rich
  options cannot trigger the fallback that deletes `questions`.
- `serializeAskQuestions` guards the recommended index with `>= 0` — a missing
  option can no longer poison the handoff with `recommended: -1`.
- Opening History still restores; it never re-runs generation and never spends a
  credit (unchanged path, covered by the existing persistence tests).

## 5. UI consequence (not a redesign)

`CodebaseAdaptiveQuestionOptionRow` renders the description under its heading
(outside the `<label>`, wired via `aria-describedby`, so the input's accessible
name stays the heading). `codebase-adaptive-question-recommendation.tsx` was
deleted: the reason is now the recommended option's own supporting line, and is
used as a fallback **only** when a stored option predates descriptions. The
recommended option is still not auto-selected.

## 6. Files

| File | Change |
| --- | --- |
| `src/features/greenfield/services/ask-service.ts` | Option types, `buildAskOptionId`, `toCanonicalOptions`, `normalizeAskOptionInput`, `describeOptionContractMiss`, mode-aware repair prompt, description contract in orchestration |
| `src/features/greenfield/prompts/ask.ts` | Rich option contract + copy-quality/anti-slop rules + recommendation rules |
| `src/features/greenfield/services/ask-options-route.server.ts` | `requireOptionDescriptions` for `existing_codebase` |
| `src/features/greenfield/services/ask-options-helpers.server.ts` | Maps `{ label, description }` into the handoff |
| `src/features/codebase/services/chat-flow-questions.ts` | Adaptive mapping, serialize/restore/parse with descriptions, legacy tolerance |
| `src/features/codebase/services/generation-context-handoff.ts` | Option union schema + sanitizer |
| `src/features/codebase/types/codebase-constants.ts` | State char budget |
| `src/features/codebase/components/chat/codebase-adaptive-question-{option-row,options,active}.tsx` | Heading + description per option; separate reason panel removed |
| `src/features/codebase/hooks/use-adaptive-question-selection.ts` | Drop the now-unused `reasonId` |
| `src/features/greenfield/hooks/use-ask-session.ts` | Tolerant handoff question type + `toAskViewQuestions` projection |

## 7. Copy examples

Rejected (generic, no consequence):

```
Judul: Judul dan teknologi
Deskripsi: Pilihan terbaik untuk pengalaman pencarian yang optimal dan efisien.
```

Accepted (behaviour + comparison):

```
Judul: Judul, deskripsi, dan teknologi
Deskripsi: Pengunjung bisa menemukan proyek lewat nama, ringkasan, atau
teknologi yang dipakai, meskipun belum mengetahui judul proyeknya.

Judul: Judul proyek saja
Deskripsi: Pencarian hanya mencocokkan nama proyek. Cocok bila pengunjung
biasanya sudah tahu proyek yang ingin dibuka.
```

## 8. Verification

| Check | Result |
| --- | --- |
| `pnpm vitest run` — ask-service (bounds/payload/orchestration), prompts-ask, chat-flow, adaptive-question, chat-workspace, clarification-persistence-{save,retry}, generation-context, ask-restore | pass |
| `pnpm biome check` on every touched file | pass |
| `pnpm exec tsc --noEmit` | pass except the pre-existing `src/features/studio/tests/studio-composer.test.tsx` `Promise.withResolvers` lib error (untouched by this fix) |
| Pipeline smoke (model JSON → parse → contract check → map → handoff zod → sanitize → restore → answers) | pass (throwaway, removed) |

FIX 02 (see `docs/codebase-fix02-question-card-ui.md`) built on this contract:
the options view now renders the recommended option first and the choice cards
were rebuilt on HeroUI's React Aria fields.