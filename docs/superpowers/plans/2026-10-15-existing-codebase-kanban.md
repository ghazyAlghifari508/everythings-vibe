# Existing Codebase Kanban Route Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give existing-codebase feature plans a repository-aware full Kanban route that opens in a new tab and reuses the shared board and persisted task data.

**Architecture:** Add a dedicated nested file route that loads repository and project context only after authentication, verifies both records belong to the user and the project references that repository, and preserves current workflow entitlement checks. Parameterize only the shared Kanban board's navigation presentation; keep the current API, SSE/polling, task state, and mutations shared.

**Tech Stack:** TanStack Router/Start, React, Drizzle ORM, Vitest, TypeScript.

**Spec:** `docs/prompts-cb-existing/p8.md`

## Global Constraints

- Existing Codebase full route: `/codebases/:codebaseId/kanban/:projectId`.
- Greenfield `/kanban/:projectId` remains compatible.
- Full Kanban opens with a normal anchor (`target="_blank"`, `rel="noopener noreferrer"`).
- Validate user ownership of repository and project, their relationship, and existing plan entitlement on the server.
- Reuse Kanban task API, stream/polling, columns/cards, progress, and status update flow.
- Add non-browser tests for route ownership/mismatch, URL/new-tab attributes, compatibility, shared task-data identity, and unauthorized access.
- No browser QA, Playwright, Puppeteer, or screenshot comparison.
- Run repository lint, typecheck, build, tests, and the no-type-bypass scan.
- Commit coherent milestones atomically, push to the actual upstream, and verify clean/synchronized git state.
- Preserve all pre-existing/unrelated files and changes.

---

### Task 1: Repository-aware navigation URL and anchor

**Files:**
- Modify: `src/components/codebase/codebase-kanban-board.tsx`
- Modify: `src/components/codebase/codebase-kanban-board.test.tsx`
- Test: `src/components/codebase/codebase-kanban-board.test.tsx`

**Interfaces:**
- Add optional `codebaseId?: string` to `CodebaseKanbanBoardProps`.
- With a repository id, generate the route `/codebases/$id/kanban/$projectId`; otherwise preserve `/kanban/$id`.
- Render a real anchor with `target="_blank"` and `rel="noopener noreferrer"`.

- [ ] Write/update tests first: assert route href/params and exact target/rel for existing codebase; assert greenfield/default link still targets `/kanban/:id` and carries new-tab attributes.
- [ ] Run the test and verify failure is from missing destination/attributes.
- [ ] Implement the conditional typed Link destination and props.
- [ ] Run focused Vitest and Biome checks.
- [ ] Inspect status/diff, stage only these two files, and commit `fix(codebase): open full kanban in repository-aware tab`.

### Task 2: Dedicated authorized route and shared board navigation

**Files:**
- Create: `src/routes/codebases/$id/kanban/$projectId.tsx`
- Modify: `src/components/kanban/kanban-board.tsx`
- Modify: `src/routes/kanban/$id.tsx`
- Modify: `src/routes/codebases/$id.tsx`
- Modify: generated `src/routeTree.gen.ts` only via verified repository route-generation script.

**Interfaces:**
- Add an optional `navigationContext` to `KanbanBoard` with repository codebase id/name; default behavior remains greenfield.
- Dedicated loader returns authorized project id/name, repository id/name, PRD/AC latest content, and project step.
- Repository context renders a workspace back-link and task progress; hides greenfield Roadmap and `/plan/new` chat navigation.

- [ ] Add pure route-authorization contract tests before implementation for matching owner+relationship, missing/foreign repo, missing/foreign project, and mismatched repository.
- [ ] Run those tests and confirm expected failures.
- [ ] Implement server loader using authenticated user and dynamic server-only imports; query codebase with its owner id and project with user id, codebase id, and non-deleted condition; enforce `hasFullWorkflow` consistent with existing full Kanban.
- [ ] Implement dedicated header presentation through shared `KanbanBoard`; keep task API/SSE/mutations and all task state unchanged.
- [ ] Pass `codebaseId` from authorized workspace data to preview link; make workspace Back link return to `/codebases/$id`.
- [ ] Generate typed route tree using `pnpm generate-routes` only after checking its result and affected-file boundary.
- [ ] Run focused route and board tests, typecheck, lint/check, inspect diff/status, and commit only dedicated route, shared board, route tree, workspace consumer, and their tests as one coherent route/UI concern.

### Task 3: Full verification and handoff

**Files:**
- No new scope expected; include any necessary focused test files from prior tasks.

- [ ] Run all repository tests (non-browser suite), `pnpm lint`, `pnpm exec tsc --noEmit`, and `pnpm build`.
- [ ] Run the exact no-type-bypass scan required by `.opencode/rules/no-type-bypass.md` against `src`.
- [ ] Audit all `p8.md` requirements, security/ownership, empty/loading/error behavior inherited by board, no duplicate generation, shared task identity, responsive/accessibility contract by code inspection (no browser tests per spec).
- [ ] Review git diff/status, ensure no generated/unrelated/secrets artifacts were included, and resolve any check failures in the affected production logic.
- [ ] Push commits to the discovered upstream branch; verify clean working tree, zero outgoing commits, and synchronized upstream.
