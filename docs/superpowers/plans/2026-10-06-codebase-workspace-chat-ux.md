# Codebase Workspace Chat UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine the center-pane pristine state of the Existing Codebase 3-pane workspace into a polished ChatGPT-style layout with centered PromptBar, non-repetitive developer-grade copy, subtle context signals, and smooth transition to active docked chat.

**Architecture:** Split the center-pane visual presentation into two mutually exclusive states: PRISTINE (vertically centered onboarding block containing the single PromptBar, concise heading, supporting copy, subtle context badge, and optional suggestions) and CHAT ACTIVE (scrollable message history with PromptBar docked at bottom). Ensure exactly one PromptBar instance in the DOM, drive the pristine transition via a single canonical predicate, and resolve repository headers via `resolveCodebaseDisplayName`.

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4, Framer Motion, Vitest jsdom.

**Spec:** Current task description and AGENTS.md rules.

## Global Constraints
- No AI slop: no purple glow, no emoji in UI chrome, no rainbow gradients, no 3D drop shadows.
- No type bypasses: zero `as any`, zero `as never`, zero `@ts-ignore`, zero `@ts-expect-error`, zero `as unknown as`.
- Exactly one PromptBar in DOM: do not duplicate PromptBar at center and bottom simultaneously.
- Atomic commits per logical milestone; verification before every commit; mandatory `git push` before handoff.

---

### Task 1: Update Pristine State Layout, Header Title, Context Signal, and Copy in CodebaseChatWorkspace

**Files:**
- Modify: `src/components/codebase/codebase-chat-workspace.tsx`
- Modify: `src/routes/codebases/$id.tsx`

**Interfaces:**
- Consumes: `resolveCodebaseDisplayName` from `@/lib/codebase-naming`.
- Produces: Updated `CodebaseChatWorkspace` with `starterSuggestions?: string[]`, `fileCount?: number`, canonical `isPristine` predicate, centered pristine block, and single PromptBar reuse.

- [ ] **Step 1: Update CodebaseChatWorkspace implementation**
  - Add `resolveCodebaseDisplayName` import.
  - Add optional `fileCount?: number` and `starterSuggestions?: string[]` to `CodebaseChatWorkspaceProps`.
  - Compute `headerTitle` using `resolveCodebaseDisplayName(codebaseName) ?? resolveCodebaseDisplayName(featureName)`.
  - Compute `contextSignal` using detected repo name and `fileCount`.
  - Refine `isPristine` to:
    `messages.length === 0 && questions.length === 0 && artifacts.length === 0 && !questionsLoading && !questionsError && !isSending && stage === "questions"`.
  - In pristine mode, render the centered block with:
    - Context signal badge with emerald dot.
    - `<h2>Apa yang ingin kamu bangun?</h2>`.
    - `<p>Jelaskan fitur, perubahan, atau masalah yang ingin kamu kerjakan. VibeEverything akan menyesuaikannya dengan struktur codebase ini.</p>`.
    - Single `PromptBar` with placeholder `"Jelaskan fitur atau perubahan yang kamu inginkan..."`.
    - Optional starter suggestion buttons (if `starterSuggestions` has items).
  - In active mode, render `codebase-chat-messages` scroll container and bottom-docked `PromptBar`.
  - Wire `fileCount` from `$id.tsx`.

- [ ] **Step 2: Verify with Biome and TypeScript**
  Run: `pnpm exec biome check --write src/components/codebase/codebase-chat-workspace.tsx src/routes/codebases/$id.tsx`
  Run: `pnpm exec tsc --noEmit`

- [ ] **Step 3: Commit Milestone 1**
  ```bash
  git add src/components/codebase/codebase-chat-workspace.tsx src/routes/codebases/$id.tsx
  git commit -m "feat(codebase): center pristine onboarding and refine workspace header"
  ```

---

### Task 2: Update and Add Tests for Pristine/Active Chat UX

**Files:**
- Modify: `src/components/codebase/codebase-chat-workspace.test.tsx`

- [ ] **Step 1: Write and update deterministic tests**
  - Pristine workspace renders `"Apa yang ingin kamu bangun?"`.
  - Old `"Halo!"` copy is gone.
  - Supporting copy mentions broader intent (`"fitur, perubahan, atau masalah"`).
  - Placeholder is `"Jelaskan fitur atau perubahan yang kamu inginkan..."`.
  - Pristine PromptBar renders inside the centered intro composition.
  - Bottom-docked composer is NOT duplicated in pristine state (exactly 1 PromptBar).
  - Header displays `"Workspace · <name>"` or fallback `"Workspace · Perencanaan codebase"` when provisional.
  - Transition to active state when first message is sent, when `questionsLoading=true`, when `questions` present, when `artifacts` present, or when `stage !== "questions"`.
  - Active state renders PromptBar at the bottom.
  - Starter suggestions prefill `draft` on click without auto-sending (`onSendMessage` not called).
  - No generic hardcoded starter suggestions appear when `starterSuggestions` is omitted.
  - Verify all existing adaptive-question and stage tests remain green.

- [ ] **Step 2: Run test suite**
  Run: `pnpm test src/components/codebase/codebase-chat-workspace.test.tsx`
  Expected: PASS

- [ ] **Step 3: Commit Milestone 2**
  ```bash
  git add src/components/codebase/codebase-chat-workspace.test.tsx
  git commit -m "test(codebase): add tests for pristine and active chat workspace UX"
  ```

---

### Task 3: Full Repository Verification, Type Bypass Scan, and Git Push

- [ ] **Step 1: Run typecheck**
  Run: `pnpm exec tsc --noEmit`
- [ ] **Step 2: Run full Vitest suite**
  Run: `pnpm test`
- [ ] **Step 3: Run Biome check on modified files**
  Run: `pnpm exec biome check src/components/codebase/codebase-chat-workspace.tsx src/components/codebase/codebase-chat-workspace.test.tsx src/routes/codebases/$id.tsx`
- [ ] **Step 4: Scan for type bypasses**
  Run: `git grep -E "as never|as any|\bas any\b|: any|@ts-ignore|@ts-expect-error|as unknown as" -- src/components/codebase/codebase-chat-workspace.tsx src/routes/codebases/$id.tsx`
- [ ] **Step 5: Push to remote and verify git state**
  Run: `git push origin main`
  Run: `git status` (verify clean and up to date)
  Run: `git log origin/main..main --oneline` (verify 0 outgoing commits)
