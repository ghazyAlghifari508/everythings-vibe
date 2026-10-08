# VibeDesign Targeted DESIGN.md Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair only invalid or missing DESIGN.md sections before a bounded full-document fallback, preserving all existing quality requirements.

**Architecture:** Keep `designIssues()` as the authoritative output validator. Map validator issues to known markdown section ranges, request those sections together in one repair generation, merge each returned section into the existing document without changing valid sections, and validate the merged result. If section mapping is impossible, the document is too short, or targeted repair still fails, perform at most one full rewrite after the initial generation.

**Tech Stack:** TypeScript, Vitest, Zod-free deterministic markdown validation, existing Vercel AI SDK / 9router orchestration.

**Spec:** User request sections I, J, K, and P in the current task.

## Global Constraints

- Stay on `feature/vibedesign-scrape`.
- Preserve `DESIGN_MIN_CHARS = 12_000`, all required headings, 8+ color rows, 8+ component specs, 6+ Do and 6+ Don't bullets, and 5 example prompts.
- Keep `maxTokens` at its existing default of 12,000.
- Never regenerate the entire document for a section-level issue when targeted repair can handle it.
- Preserve valid source sections byte-for-byte during a targeted merge.
- Emit activity and timing only at the corresponding real generation and validation operations.
- Use typed contracts and no type-safety bypasses.

---

### Task 1: Test targeted repair and generation bounds

**Files:**
- Modify: `src/lib/prompts-design-md.test.ts`
- Test with: `pnpm exec vitest run src/lib/prompts-design-md.test.ts`

**Interfaces:**
- Mock only `tryStreamWithFallback`, the external streaming boundary. Its mock returns the real typed shape: `{ generator: AsyncGenerator<string, void, undefined>, firstChunk: string, abortController: AbortController, outcome: {} }`.
- Exercise the public `generateDesignMd(sourceUrl, extraction, maxTokens, instrumentation)` API.

- [x] **Step 1: Add a valid-first-generation test**

Use the deterministic complete document fixture. Return it from the first mocked stream and assert the result passes `designIssues()` and the adapter is called once.

- [x] **Step 2: Run the targeted test and confirm first-pass behavior**

Run `pnpm exec vitest run src/lib/prompts-design-md.test.ts -t "valid first generation"`. The current generator calls its rewrite path only for invalid content; this test should pass without needing implementation changes. Use the invalid-output tests in the next step as the RED check for the new behavior.

- [x] **Step 3: Add a component-only repair test**

Start from a complete fixture with seven component specs. Return a response containing only the eight component specs on the repair call. Assert the second prompt asks for the Components section only, the merged document passes `designIssues()`, and the Colors section is unchanged.

- [x] **Step 4: Add final-validation, activity, and retry-bound tests**

Return invalid repair content and invalid full-rewrite content. Assert `generateDesignMd()` rejects with `ScrapeError`, total model generations do not exceed three (initial, targeted, one full fallback), activity includes generation/validation/repair transitions, and the unchanged complete contract is still enforced.

- [x] **Step 5: Run the focused tests and confirm targeted-repair tests fail before production code changes**

Run `pnpm exec vitest run src/lib/prompts-design-md.test.ts`. Confirm failures concern full rewrite/no targeted section merge or missing activity transitions, not fixture setup.

### Task 2: Implement deterministic section repair and fallback

**Files:**
- Modify: `src/lib/prompts-design-md.ts`
- Test: `src/lib/prompts-design-md.test.ts`

**Interfaces:**
- Add a private `RepairTarget` contract with `heading`, `endHeading`, and `displayName` fields.
- Map validator issues to the existing section ranges: Colors→Typography, Typography→Spacing & Shapes, Spacing & Shapes→Components, Components→Do's and Don'ts, Do's and Don'ts→Surfaces, Example Component Prompts→Similar Brands, and other required level-two headings to the following required heading (or end-of-document).
- Merge only a returned section that contains its exact requested heading; leave an existing valid section untouched if the response omits that target.

- [x] **Step 1: Add target selection and deterministic section replacement**

Translate `needs 8+ color rows`, `needs 8+ component specs`, `needs 6+ do and 6+ don't bullets`, `needs 5 example component prompts`, and `missing <heading>` into deduplicated targets. Do not target the whole document for `too short`; that issue requires the full fallback. If no safe target can be mapped, skip targeted generation.

- [x] **Step 2: Request all selected section replacements in one repair generation**

Ask for only the named sections, exact headings, with the existing extraction JSON and fidelity constraints. Keep the model token limit unchanged. Record this call under `repairGeneration` timing and emit truthful targeted repair activity.

- [x] **Step 3: Merge, normalize, and validate the targeted result**

Extract each requested section from the repair response, replace only its exact section range, normalize the merged document, and run the unchanged `designIssues()` contract. Emit the repair validation activity at that actual validation point.

- [x] **Step 4: Use one full rewrite only as the last resort**

If targeted repair cannot be mapped or the merged document remains invalid, perform one full rewrite with the current issues. Re-run `designIssues()` and throw the existing `AI_GENERATION_FAILED` error if the full rewrite is still invalid. Total generations are bounded to three.

- [x] **Step 5: Run tests, typecheck, and Biome**

Run `pnpm exec vitest run src/lib/prompts-design-md.test.ts`, `pnpm exec tsc --noEmit`, and `pnpm exec biome check src/lib/prompts-design-md.ts src/lib/prompts-design-md.test.ts`.

- [ ] **Step 6: Inspect diff and commit atomically**

Stage only this plan and the prompt implementation/test files. Commit as `perf(design): repair invalid DESIGN.md sections before full rewrite`.
