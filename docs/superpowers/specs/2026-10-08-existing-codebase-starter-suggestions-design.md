# Existing Codebase Repository-Aware Starter Suggestions

**Status:** Draft for review
**Scope:** Repository-aware starter prompts and accessible interaction in the Existing Codebase 3-pane workspace

## Goal

Replace generic shortcut fragments with four useful, editable prompts grounded in the synchronized repository, and keep their title/description readable in both themes and all interaction states.

## Current Evidence

- `src/lib/codebase-analysis.server.ts` already reads the trusted snapshot manifest and bounded source excerpts for one analysis model call, then persists validated output in `codebase_analyses.output`.
- `src/lib/codebase-analysis.ts` owns the Zod analysis contract, model prompt, and model-output parser.
- `src/routes/codebases/$id.tsx` loads and validates the latest stored analysis, but does not pass starters into `CodebaseChatWorkspace`.
- `src/components/codebase/codebase-chat-workspace.tsx` renders hardcoded generic intent cards plus a separate optional starter-suggestion list.
- In `src/app/globals.css`, light mode maps `--color-charcoal` to `#fafafa`; the title's `group-hover:text-white` override produces white text on a near-white card surface. The same semantic tokens resolve to dark surfaces in dark mode.
- `codebase_analyses.output` is JSONB and consumers validate it with `codebaseAnalysisSchema`, so this change needs no database column or migration.

## Design

### Analysis and persistence

The existing analysis call will also generate the four starter suggestions while processing the uploaded snapshot. It will use the analysis summary, module map, relevant files, impact areas, findings, and actual snapshot source excerpts. Framework, dependencies, and repository name may inform implementation constraints, but must not determine product domain.

The stored analysis contract adds optional `starterSuggestions` for backward compatibility. Each suggestion contains:

```ts
type CodebaseStarterId = "feature" | "bugfix" | "refactor" | "ui";

type CodebaseStarterSuggestion = {
  id: CodebaseStarterId;
  title: string;
  description: string;
  prompt: string;
  relevantPaths?: string[];
};
```

When suggestions are present, validation requires exactly four entries and exactly one occurrence of each ID: `feature`, `bugfix`, `refactor`, and `ui`. Newly generated analysis output requires this complete set; legacy stored analysis may omit it. Any supplied `relevantPaths` must be exact members of the trusted manifest for that snapshot. The model prompt must require concrete, editable prompts, evidence-based titles/descriptions, no duplicate existing capability, no unsupported behavior claims, no invented paths, and conservative in-stack refactors. A malformed new suggestion set fails through the existing analysis validation and retry lifecycle. No separate model request is introduced.

### Route and workspace

The detail route passes `analysisOutput?.starterSuggestions` directly to the workspace. The pristine workspace renders one canonical `Mulai dari` section only when the four validated suggestions are available. Legacy analyses without the field hide the entire section until an analysis containing suggestions exists. There are no generic fallback fragments, duplicate pill buttons, or implicit analysis requests from rendering.

Each card presents its repository-specific `title` and concise `description`. Clicking it uses the existing `handlePrefillDraft` behavior to fill the complete `prompt`, focus the composer, and position the caret at the end. It never sends the prompt automatically. The existing PromptBar and surrounding workspace layout remain unchanged.

### Theme and accessibility

Remove the explicit white hover text override. Card foreground, surface, border, and focus treatment use existing semantic theme tokens so text remains readable in light and dark mode across default, hover, focus-visible, and active states. Preserve a visible keyboard focus indicator and native button keyboard behavior. Verify computed colors and WCAG AA contrast for title and description in each theme and relevant states.

## Behavior Matrix

| Condition | Expected behavior |
| --- | --- |
| New valid analysis | Show exactly four repository-grounded cards, one per category |
| Analysis output with missing, duplicate, or invalid category | Reject generated output through existing analysis validation |
| `relevantPaths` contains a path outside the snapshot manifest | Reject generated output |
| Legacy analysis without suggestions | Parse successfully and hide the complete starter section |
| Suggestion click | Fill full prompt, focus composer, caret at end, do not call send handler |
| Default / hover / focus-visible / active, light or dark theme | Title and description remain readable; focus is visible |
| Non-pristine workspace | Do not render starter section |
| Analysis unavailable or pending | Do not fabricate starter content or call AI during render |

## Alternatives Considered

1. **Generate and persist in the existing snapshot analysis call (selected):** grounded in the same bounded source context, avoids repeated calls, and reuses the persisted validated analysis.
2. **Derive prompts on each render:** would require domain/entity heuristics, cannot reliably produce specific repository-grounded tasks, and would make UI logic the source of analysis.
3. **Add a separate starter-generation call:** duplicates model work and violates the one-analysis-call requirement.

## Impact and Boundaries

Expected production changes are limited to `src/lib/codebase-analysis.ts`, `src/lib/codebase-analysis.server.ts`, `src/routes/codebases/$id.tsx`, and `src/components/codebase/codebase-chat-workspace.tsx`, plus focused tests for analysis validation, route wiring, and workspace behavior. No unrelated chat, question, PRD, AC, or task generation behavior changes. No new dependency, database column, or migration is needed.

The model remains responsible for semantic relevance. Deterministic enforcement covers the four unique categories, structured field bounds, snapshot-bound paths, and persisted-output validation; prompt constraints and real multi-repository browser QA assess whether the content is actually grounded and non-duplicative.

## Verification and Delivery

- Add analysis tests for a valid exact category set, optional legacy field, invalid/missing/duplicate categories, invalid path, and prompt grounding requirements.
- Add workspace tests for exactly the supplied cards, absence of generic fragments and duplicate starter UI, full prompt prefill, no auto-send, focus/caret, and legacy omission.
- Test semantic state styles and computed contrast in light/dark themes for default, hover, focus-visible, and active.
- Run targeted tests, repository `pnpm test`, `pnpm exec tsc --noEmit`, `pnpm check`, `pnpm build`, and the no-type-bypass scan using actual package scripts and repository roots.
- Run browser QA against two meaningfully different synced repositories if available; record real suggestion titles and confirm domain separation. Do not alter database state to create test coverage.
- Keep changes on `feature/vibeplan-existing-codebase`; commit each verified logical milestone atomically, push to its resolved upstream, and verify clean tree and zero outgoing commits.
