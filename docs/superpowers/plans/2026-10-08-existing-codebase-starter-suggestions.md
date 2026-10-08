# Existing Codebase Starter Suggestions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to execute this plan inline with review checkpoints. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate and persist four repository-aware Existing Codebase starter prompts in the existing analysis call, present them as one accessible card section, and remove the light-mode hover contrast failure.

**Architecture:** Extend the isomorphic Zod analysis contract with an optional legacy-compatible suggestions field and a generated-output contract requiring four unique category IDs. Validate generated paths against the uploaded snapshot manifest in the existing analysis parser, persist suggestions with the current analysis JSONB result, and pass them from the detail route into one canonical pristine-state card section. If a legacy result omits suggestions, render no starter section.

**Tech Stack:** TypeScript 6, Zod 4, TanStack Start/Router, React 19, Tailwind CSS 4, Vitest/jsdom, Chrome DevTools.

**Spec:** `docs/superpowers/specs/2026-10-08-existing-codebase-starter-suggestions-design.md`

## Global Constraints

- Work only on `feature/vibeplan-existing-codebase`.
- Generate suggestions inside the existing snapshot analysis call; do not add a per-card or per-render AI request.
- Stored analysis `starterSuggestions` stays optional for legacy compatibility.
- Present exactly four suggestions, with `feature`, `bugfix`, `refactor`, and `ui` occurring exactly once each.
- Reject model `relevantPaths` outside the trusted uploaded snapshot manifest.
- A missing legacy field hides the whole “Mulai dari” section; do not render generic examples or an unavailable card.
- Clicking a card fills the full editable prompt, focuses the composer, places the caret at the end, and does not send.
- Keep one canonical starter section and preserve existing workspace layout and unrelated pipeline behavior.
- Use semantic theme tokens for card text, surface, border, and interaction states; verify light/dark and WCAG AA contrast in a real browser.
- Use TDD for production behavior, never assert generated AI prose or Tailwind class strings, and introduce no type bypasses.
- Each coherent milestone must pass required verification, be reviewed with `git diff`/`git status`, and be committed atomically before the next milestone.
- Final handoff requires push to the actual upstream, clean working tree, zero outgoing commits, and upstream synchronization evidence.

---

## File Map

- `src/lib/codebase-analysis.ts`: typed suggestion IDs/objects, optional stored-analysis field, required generation schema, prompt instructions, parser validation against trusted manifest paths.
- `src/lib/constants.ts`: centralized title, description, and prompt character bounds for model-generated starter content.
- `src/lib/codebase-analysis.server.ts`: pass exact paths from the validated uploaded snapshot manifest into the existing parser call; keep the single model invocation and existing persistence lifecycle.
- `src/lib/codebase-analysis.test.ts`: schema compatibility, exact category uniqueness, parser path allowlist, and prompt contract tests.
- `src/routes/codebases/$id.tsx`: pass the validated analysis suggestions to the workspace.
- `src/routes/codebases/-codebases-pages.test.ts`: verify route-to-workspace starter data wiring using the existing route source contract test style.
- `src/components/codebase/codebase-chat-workspace.tsx`: replace generic and duplicate starter systems with repository-aware cards; preserve full-draft prefill; keep semantic colors across button states.
- `src/components/codebase/codebase-chat-workspace.test.tsx`: render, legacy omission, single section, prefill, focus/caret, and no-auto-send behavior.

No database schema, migration, dependency, API route, or unrelated generation pipeline change is required.

---

### Task 1: Validate and persist suggestions in existing snapshot analysis

**Files:**
- Modify: `src/lib/codebase-analysis.ts`
- Modify: `src/lib/constants.ts`
- Modify: `src/lib/codebase-analysis.server.ts`
- Test: `src/lib/codebase-analysis.test.ts`

**Interfaces:**
- Export `CodebaseStarterId` as the union `"feature" | "bugfix" | "refactor" | "ui"`.
- Export `CodebaseStarterSuggestion` inferred from its Zod schema, with `id`, `title`, `description`, `prompt`, and optional `relevantPaths`.
- Export `codebaseStarterSuggestionsSchema` for exactly four suggestions, with a refinement that rejects any duplicate or missing category.
- Add optional `starterSuggestions` to `codebaseAnalysisSchema` so persisted legacy rows continue parsing.
- Export `codebaseAnalysisGenerationSchema` derived from `codebaseAnalysisSchema` with `starterSuggestions` required for newly generated results.
- Change `parseAnalysisOutput` to take a required `ReadonlySet<string>` of trusted snapshot paths and validate every model-provided `relevantPaths` entry against it.

- [ ] **Step 1: Add failing contract tests**

Add a shared valid suggestion fixture with four neutral, non-product-specific test records, one for each supported ID. Add tests that assert:

```ts
expect(codebaseStarterSuggestionsSchema.safeParse(validSuggestions).success).toBe(true);
expect(codebaseStarterSuggestionsSchema.safeParse(validSuggestions.slice(1)).success).toBe(false);
expect(codebaseStarterSuggestionsSchema.safeParse([
  ...validSuggestions.slice(0, 3),
  { ...validSuggestions[3], id: validSuggestions[0]?.id },
]).success).toBe(false);
expect(codebaseAnalysisSchema.safeParse(validAnalysis).success).toBe(true);
expect(codebaseAnalysisGenerationSchema.safeParse({
  ...validAnalysis,
  starterSuggestions: validSuggestions,
}).success).toBe(true);
expect(codebaseAnalysisGenerationSchema.safeParse(validAnalysis).success).toBe(false);
```

Also reject an invalid ID, empty required text field, and title/description/prompt values beyond the exported constants. Do not assert exact generated model prose.

- [ ] **Step 2: Run the focused test and verify expected RED**

Run: `pnpm test src/lib/codebase-analysis.test.ts`

Expected: FAIL because suggestion schemas/types and the generation contract are not yet exported.

- [ ] **Step 3: Add failing parser/path tests**

Update parser tests to use the new required starter set in model JSON and pass an allowlist. Add one test where every supplied path is allowed and one where a suggestion references a neutral path absent from the allowlist; the invalid-path case must throw `AnalysisValidationError`.

Add a prompt contract test that checks the system prompt requests all four IDs exactly once, repository evidence rather than stack/name inference, no duplicate existing functionality, conservative same-stack refactors, and no invented paths. Assert those deterministic instructions, not generated suggestions.

- [ ] **Step 4: Run parser/prompt tests and verify expected RED**

Run: `pnpm test src/lib/codebase-analysis.test.ts`

Expected: FAIL because parser signature, required generation schema, and new prompt contract are not implemented.

- [ ] **Step 5: Implement typed suggestion contracts and exact category validation**

In `src/lib/constants.ts`, add named maximum character constants for starter titles, descriptions, and prompts, reusing an existing prompt limit if its current semantic scope fits. In `src/lib/codebase-analysis.ts`, define an enum schema for the four category IDs and a bounded object schema that uses those constants. Use a four-item array schema plus a refinement that verifies every union member occurs once. Add this field as optional to `codebaseAnalysisSchema`, then derive a generated-analysis schema where it is required.

Keep title, description, prompt, and paths structurally constrained. Do not add domain examples, assumed stack migrations, or hardcoded product capabilities to production prompt output.

- [ ] **Step 6: Implement the single-call grounding prompt and parser checks**

Extend `CODEBASE_ANALYSIS_SYSTEM_PROMPT` to require all four suggestion categories in the same JSON response and to derive each suggestion from the uploaded source/analysis evidence. Require concrete short titles/descriptions and a complete editable prompt. Direct the model to avoid existing capabilities and unsupported certainty, use actual manifest paths when naming modules, and keep refactors within proven repository patterns.

In `parseAnalysisOutput`, validate with `codebaseAnalysisGenerationSchema`, then reject any `relevantPaths` not contained in the required trusted-path set using the existing fixed `AnalysisValidationError` message. Do not leak the rejected path or source text in errors.

- [ ] **Step 7: Pass the validated snapshot path allowlist from the analysis service**

In `src/lib/codebase-analysis.server.ts`, call `parseAnalysisOutput` with the existing project/snapshot IDs and `new Set(storedManifest.data.map((entry) => entry.path))`. Keep the existing single `generate(messages)` invocation, pending/ready/failed transitions, and JSONB persistence unchanged.

- [ ] **Step 8: Run focused tests and compiler/style checks**

Run:

```powershell
pnpm test src/lib/codebase-analysis.test.ts
pnpm exec biome check src/lib/constants.ts src/lib/codebase-analysis.ts src/lib/codebase-analysis.server.ts src/lib/codebase-analysis.test.ts
pnpm exec tsc --noEmit
```

Expected: all pass. Inspect test output to confirm malformed/missing/duplicate categories and out-of-snapshot paths are rejected, while stored legacy output without `starterSuggestions` still parses.

- [ ] **Step 9: Inspect and commit the analysis milestone**

Run `git status --short --branch` and `git diff -- src/lib/constants.ts src/lib/codebase-analysis.ts src/lib/codebase-analysis.server.ts src/lib/codebase-analysis.test.ts`; review the complete diff and `git diff --check`. Stage only those four files and commit:

```powershell
git add src/lib/constants.ts src/lib/codebase-analysis.ts src/lib/codebase-analysis.server.ts src/lib/codebase-analysis.test.ts
git commit -m "feat(codebase): generate validated repository starters"
```

Record the commit hash before continuing.

---

### Task 2: Wire one repository-aware starter section into the workspace

**Files:**
- Modify: `src/routes/codebases/$id.tsx`
- Modify: `src/components/codebase/codebase-chat-workspace.tsx`
- Test: `src/routes/codebases/-codebases-pages.test.ts`
- Test: `src/components/codebase/codebase-chat-workspace.test.tsx`

**Interfaces:**
- Route passes `analysisOutput?.starterSuggestions` to `CodebaseChatWorkspace`.
- Workspace accepts `starterSuggestions?: CodebaseStarterSuggestion[]` imported as a type from the pure analysis module.
- The existing `handlePrefillDraft(prompt)` remains the sole card activation path.

- [ ] **Step 1: Add failing route wiring test**

In the existing route tests, read `src/routes/codebases/$id.tsx` using the current source-contract pattern and assert the route passes the optional validated `analysisOutput?.starterSuggestions` value to `CodebaseChatWorkspace`.

- [ ] **Step 2: Run focused route test and verify expected RED**

Run: `pnpm test src/routes/codebases/-codebases-pages.test.ts`

Expected: FAIL because the route does not yet pass the suggestion prop.

- [ ] **Step 3: Add failing workspace behavior tests**

Replace obsolete tests asserting generic starter labels/fragments and the second suggestion pill list. Use a four-item typed fixture with unique IDs and neutral UI text. Assert that the pristine view shows exactly four supplied suggestion buttons, renders each provided title and description, and exposes exactly one starter section.

Add tests that: omit the entire starter section when `starterSuggestions` is undefined/empty; do not show the old generic starter controls or the duplicate suggestion-list container; clicking a card fills the textarea with that card's complete `prompt`; the textarea is focused with selection at `prompt.length`; and `onSendMessage` remains uncalled.

- [ ] **Step 4: Run focused workspace tests and verify expected RED**

Run: `pnpm test src/components/codebase/codebase-chat-workspace.test.tsx`

Expected: FAIL on the legacy generic behavior and missing typed card rendering.

- [ ] **Step 5: Wire analysis output through the route**

Pass `analysisOutput?.starterSuggestions` as `starterSuggestions` at the existing `CodebaseChatWorkspace` call. Do not fetch or trigger analysis from the browser render path.

- [ ] **Step 6: Replace both starter systems with the single canonical section**

In `codebase-chat-workspace.tsx`, delete `GENERIC_INTENT_STARTERS` and the independent `codebase-starter-suggestions` pills. Import the shared suggestion type. Render the “Mulai dari” label and four card buttons only when the optional suggestion list is present and contains four entries. Each button calls `handlePrefillDraft(item.prompt)`, and displays only `item.title` and concise `item.description`.

Use the existing `handlePrefillDraft` path; do not call `handleSend`, `onSendMessage`, or any model endpoint from a card click. Preserve the current PromptBar and non-pristine workspace behavior.

- [ ] **Step 7: Run focused tests and verify expected GREEN**

Run:

```powershell
pnpm test src/components/codebase/codebase-chat-workspace.test.tsx
pnpm test src/routes/codebases/-codebases-pages.test.ts
```

Expected: both pass; four suggestions appear once, the legacy state hides the section, the full prompt remains editable, focus/caret are correct, and card clicks never submit.

- [ ] **Step 8: Run checks, review, and commit the route/workspace milestone**

Run:

```powershell
pnpm exec biome check src/routes/codebases/$id.tsx src/routes/codebases/-codebases-pages.test.ts src/components/codebase/codebase-chat-workspace.tsx src/components/codebase/codebase-chat-workspace.test.tsx
pnpm exec tsc --noEmit
git diff --check
git status --short --branch
```

Review the complete diff. Stage only these four route/workspace files and commit:

```powershell
git add 'src/routes/codebases/$id.tsx' src/routes/codebases/-codebases-pages.test.ts src/components/codebase/codebase-chat-workspace.tsx src/components/codebase/codebase-chat-workspace.test.tsx
git commit -m "feat(codebase): show persisted starter prompts in workspace"
```

Record the commit hash before continuing.

---

### Task 3: Verify semantic theme states and browser behavior

**Files:**
- No production files unless QA discovers a root-cause defect.
- If a defect is found, fix only the responsible source and add/strengthen its deterministic regression test before restarting QA from the workspace entry flow.

- [ ] **Step 1: Verify source has no generic/duplicate starter system**

Search the relevant production component for `GENERIC_INTENT_STARTERS`, old generic prefill fragments, and the duplicate `codebase-starter-suggestions` test ID. Confirm no production starter fallback remains; inspect `starterSuggestions` call sites and verify there is only one workspace consumer.

- [ ] **Step 2: Start the app using the repository’s managed server workflow**

Read the webapp-testing helper’s supported usage first:

```powershell
python "C:\Users\alghi\.agents\skills\webapp-testing\scripts\with_server.py" --help
```

Then use the documented helper to run `pnpm dev` on port `3000` with readiness detection and cleanup. Do not launch an unmanaged long-running process.

- [ ] **Step 3: Inspect available real synced repositories and authenticated browser context**

Use Chrome DevTools to inspect the actual local app, session, and codebase list. Test two meaningfully different repositories only if genuinely synced repositories are available to this authenticated test context. Do not alter the database, fabricate an analysis row, or infer success from fixture output.

- [ ] **Step 4: Verify theme and interaction states in the real browser**

On the pristine workspace with real suggestions, inspect computed foreground/background colors and calculate WCAG contrast for title and description in light and dark mode. Exercise default, pointer hover, keyboard focus-visible, and pressed/active states; verify the focus ring is visible and text remains readable. Click every card and verify the full prompt, textarea focus, caret at the end, no auto-send, and zero console errors.

If two real repositories are available, record each repository’s actual four titles and verify that suggestions for the unrelated repository do not contain domain-specific items from the other repository. Capture browser evidence and the console result. If fewer than two are available, report exactly which repository contexts were available and do not claim cross-repository proof.

- [ ] **Step 5: Run final repository verification**

Run the exact scripts declared in `package.json`:

```powershell
pnpm test
pnpm exec tsc --noEmit
pnpm check
pnpm build
```

Run the required type-bypass scan over `src`:

```powershell
rg -n "as never|as any|\bas any\b|: any|@ts-ignore|@ts-expect-error|as unknown as" src
```

Expected for new code: no matches. Any command failure must be resolved or recorded as a concrete blocker; do not weaken tests or replace required checks.

- [ ] **Step 6: Inspect final diff/status and push the task commits**

Run `git status --short --branch`, `git diff --check`, `git diff HEAD~2..HEAD`, and `git log -3 --oneline`. Confirm only the spec and the two scoped implementation milestones are included, with no generated or secret artifacts. Resolve upstream from Git, then push the current branch:

```powershell
git push origin feature/vibeplan-existing-codebase
```

In PowerShell, quote Git's upstream expressions so they are passed as Git revision syntax rather than parsed as a PowerShell hashtable:

```powershell
git status --short --branch
git log '@{upstream}..HEAD' --oneline
git rev-list --left-right --count '@{upstream}...HEAD'
```

Expected: clean worktree, zero outgoing commits, zero incoming commits, and upstream synchronization.
