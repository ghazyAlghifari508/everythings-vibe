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
- `codebase_analyses.output` is JSONB and consumers validate it with `codebaseAnalysisSchema`. A durable nullable `codebases.onboardingProjectId` column anchors the original onboarding project identity across multi-feature codebases.

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

Explicit manual refresh for legacy analysis absent suggestions (`POST /api/v1/projects/:id/codebase/analysis` with `refreshStarterSuggestionsForAnalysisId`) creates a fresh append-only analysis record using the same uploaded snapshot and adaptive credits. Ordinary GET requests and client render loops never invoke AI analysis or create database records.

### Route and workspace

The sync screen (`/plan/codebase`) waits for persisted analysis ready status and valid output containing exactly four suggestions before enabling Next (`Lanjut ke Kesimpulan`). There is no normal second loading screen; the conclusion screen continues to support direct navigation and refresh recovery when preconditions are met. Exact readiness requires a real CLI handshake, a current usable/upload-complete snapshot (`uploaded`, or legacy `ready` status grounded in `SNAPSHOT_CONTEXT_STATUSES` and `CODEBASE_SYNC_COMPLETE_STATUSES`), owned matching codebase ID, analysis project ID, snapshot ID, and analysis ID, along with validated output containing exactly four unique category suggestions (`feature`, `bugfix`, `refactor`, `ui`). The durable nullable `codebases.onboardingProjectId` column identifies the original onboarding project to prevent project drift.

In the workspace (`/codebases/$id`), analysis is loaded for the current usable snapshot. Zero-file uploaded snapshots are usable and the workspace survives expired sync sessions. The detail route passes `analysisOutput?.starterSuggestions` directly to the workspace. The pristine workspace renders one canonical `Mulai dari` section only when the four validated suggestions are available. Legacy analyses without the field hide the entire section until an analysis containing suggestions exists. There are no generic fallback cards, duplicate pill buttons, or implicit analysis requests from rendering.

Each card presents its repository-specific `title` and concise `description`. Clicking it uses the existing `handlePrefillDraft` behavior to fill the complete `prompt`, focus the composer, and position the caret at the end. It never sends the prompt automatically. The existing PromptBar and surrounding workspace layout remain unchanged.

### Theme and accessibility

Remove the explicit white hover text override. Card foreground, surface, border, and focus treatment use existing semantic theme tokens so text remains readable in light and dark mode across default, hover, focus-visible, and active states. Preserve a visible keyboard focus indicator and native button keyboard behavior. Verify computed colors and WCAG AA contrast for title and description in each theme and relevant states.

## Behavior Matrix

| Condition | Expected behavior |
| --- | --- |
| New valid analysis | Show exactly four repository-grounded cards, one per category; gate opens on sync screen |
| Analysis output with missing, duplicate, or invalid category | Reject generated output through existing analysis validation; gate remains closed |
| `relevantPaths` contains a path outside the snapshot manifest | Reject generated output |
| Legacy analysis without suggestions | Parse successfully and hide complete starter section; sync screen shows manual refresh action instead of advancing |
| Manual legacy refresh requested | Creates fresh append-only analysis using same uploaded snapshot and adaptive credits; GET/render never calls AI |
| Zero-file uploaded snapshot | Marked usable; workspace loads successfully and survives expired sync session |
| Precondition check for conclusion | Requires CLI handshake, current usable/upload-complete snapshot (`uploaded`, or legacy `ready` status grounded in `SNAPSHOT_CONTEXT_STATUSES`/`CODEBASE_SYNC_COMPLETE_STATUSES`), matching owned project/snapshot/analysis IDs, ready analysis, and 4 validated suggestions |
| Refresh on conclusion step with unmet preconditions | Safely falls back to sync screen; direct recovery succeeds when preconditions hold |
| Suggestion click | Fill full prompt, focus composer, caret at end, do not call send handler |
| Default / hover / focus-visible / active, light or dark theme | Title and description remain readable; focus is visible |
| Non-pristine workspace | Do not render starter section; no generic fallback cards |
| Analysis unavailable or pending | Do not fabricate starter content or call AI during render; sync screen waits before Next |

## Alternatives Considered

1. **Generate and persist in the existing snapshot analysis call (selected):** grounded in the same bounded source context, avoids repeated calls, and reuses the persisted validated analysis.
2. **Derive prompts on each render:** would require domain/entity heuristics, cannot reliably produce specific repository-grounded tasks, and would make UI logic the source of analysis.
3. **Add a separate starter-generation call:** duplicates model work and violates the one-analysis-call requirement.

## Impact and Boundaries

Expected production changes include `src/lib/codebase-analysis.ts`, `src/lib/codebase-analysis.server.ts`, `src/lib/codebase-analysis-refresh.ts`, `src/lib/codebase-anchor.ts`, `src/routes/plan/codebase.tsx`, `src/components/codebase/screen-connect.tsx`, `src/components/codebase/sync-stage-list.tsx`, `src/routes/codebases/$id.tsx`, and `src/components/codebase/codebase-chat-workspace.tsx`, along with the durable nullable `codebases.onboardingProjectId` schema column and migration to anchor onboarding project identity. No unrelated chat, question, PRD, AC, or greenfield task generation behavior changes.

The model remains responsible for semantic relevance. Deterministic enforcement covers the four unique categories, structured field bounds, snapshot-bound paths, and persisted-output validation; prompt constraints and real multi-repository browser QA assess whether the content is actually grounded and non-duplicative.

## Verification and Delivery

- Automated tests cover schema compatibility, category uniqueness, manifest path allowlists, prompt contracts, workspace prefill/rendering, onboarding gating, legacy refresh lifecycle, and zero-file snapshot recovery.
- Live authenticated full browser flow E2E is currently unavailable in automated runs due to port 3001 being unauthenticated while Playwright configuration is tied to port 3000.
- Test semantic state styles and computed contrast in light/dark themes for default, hover, focus-visible, and active.
- Keep changes on `feature/vibeplan-existing-codebase`; commit each verified logical milestone atomically, push to its resolved upstream, and verify clean tree and zero outgoing commits.

## Amendment: product-oriented starter copy

The first implementation produced technically correct but unusable starter text: suggestions read like instructions to a coding agent ("open this file, use this hook") rather than product improvements a repository owner could evaluate.

The contract now splits the two channels:

| Channel | Content | Enforced by |
| --- | --- | --- |
| `title`, `description`, `prompt` (user-facing) | Goal, expected behavior, user value. No file names, paths, hooks, type names, or algorithms. | System prompt rules 8–9 plus `findStarterTechnicalLeaks`, a token-shape guard |
| `relevantPaths`, `findings`, `moduleMap` (internal) | Proven repository locations, validated against the snapshot manifest | `parseAnalysisOutput` trusted-path allowlist |

`findStarterTechnicalLeaks` matches token shapes (a source-file extension, a `useXxx` hook identifier), never a fixed word list, so it holds for any repository domain. A leak raises the new `technical_leak` validation reason, which the existing bounded single-repair attempt converts into one rewritten analysis — no extra model call on render, and no client-side generation.

Backward compatibility: the guard runs only on freshly generated output. Persisted analyses are still parsed with the plain schema, so history the user already sees is never invalidated. Suggestions produced before this amendment keep their stored wording until the user explicitly triggers the persisted refresh action; no analysis record is rewritten and no background model call is issued.
