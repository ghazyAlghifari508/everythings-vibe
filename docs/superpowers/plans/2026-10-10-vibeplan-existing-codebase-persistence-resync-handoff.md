# VibePlan Existing Codebase — Persistence, Re-Sync & CLI Handoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make an existing-codebase workspace reopen with its real persisted planning, keep one repository identity across re-syncs, support many independent feature plans per repository, and hand the whole plan off to a coding agent through `docs/vibeplan/` written by the VibeEverything CLI.

**Architecture:** Three domains stay separate. A **codebase** is one repository with a stable identity, sync sessions and snapshots. A **project** is one feature plan bound to a codebase. **Workspace UI state** is a presentation pointer that is always re-derivable from the server. The workspace resolves its active plan deterministically (explicit pointer → durable anchor → single plan → explicit picker), hydrates every artifact through an explicit per-artifact status so "not loaded yet" and "failed to load" can never render as "no planning", and never spends credit to merely open a plan. The CLI gains one `export plan` command that reads the canonical server artifacts and writes them under `docs/vibeplan/` with atomic, idempotent, path-safe writes.

**Tech Stack:** TanStack Start/Router, React 19, Drizzle ORM + PostgreSQL, Zod v4, Vitest, Commander-based CLI in `packages/cli`.

**Spec:** `docs/prompts/prompt1.md`

## Global Constraints

- No `any`, `as never`, `@ts-ignore`, `@ts-expect-error`, or `as unknown as X` (`.opencode/rules/no-type-bypass.md`).
- No hardcoded credentials, URLs, limits, or provider values (`.opencode/rules/no-hardcode.md`).
- Never fabricate progress, status, or success (`.opencode/rules/no-hardcode.md` Rule 7, `AGENTS.md` §8).
- Every tenant query filters `WHERE user_id = ?` (`prdfy-context.md` §7.3).
- Forward-only, non-destructive Drizzle migration; no database reset (`prompt1.md` D3).
- Do **not** perform browser QA, Playwright, or Puppeteer (`prompt1.md` E2).
- Do not change the greenfield flow, and do not overwrite `AGENTS.md`, `.cursorrules`, `.claude/rules/` (C9).
- UI copy is Indonesian; technical terms stay in English (`no-assumptions.md` Rule 9).
- Reuse existing components, services, schemas, and utilities before adding new ones (`AGENTS.md` §7).

## Root Cause (evidence)

1. **Active plan resolved by `updatedAt DESC` while repository context uses the immutable anchor.**
   `src/routes/codebases/$id.tsx:178-193` loads `featureProjects` ordered `desc(projects.updatedAt)` and takes `featureProjects[0]` as `feature`; `resolvedFeature = activeFeature ?? feature` (line 1011) and every artifact loader (`loadPrd`, `loadAc`, `refreshFeatureTree`, `refreshTaskTree`, `useKanbanTasks`) uses `effectiveFeatureId` from it. `onboardingFeature` is resolved separately by explicit pointer (`src/lib/codebase-anchor.ts:40-62`) and drives the analysis, starter suggestions, explorer fallback, and `readStatus` project identity. Once a repository has more than one feature plan — reachable through the workspace's own "Buat Fitur Baru" intent (`codebase-revision-intent.ts:19-24` → `ensureFeatureInWorkspace` → `POST /api/codebases/$codebaseId/features`) — the two diverge: artifacts load from one project, repository context from another, and the artifact-less project renders as the pristine empty state while the explorer still lists the repository.
2. **`isPristine` cannot tell "not loaded yet" from "no planning".**
   `codebase-chat-workspace.tsx:286-293` is a pure absence predicate over transient state. Artifact loads are asynchronous effects, so every reopen paints the empty composer first; `loadPrd`/`loadAc` write `null` on a failed precondition or failed fetch (`$id.tsx:1067-1072, 1080-1097, 1108-1141`) and `refreshFeatureTree`/`refreshTaskTree` swallow errors into `null` (`$id.tsx:1157-1160, 1172-1175`), so a failed read is indistinguishable from a genuinely empty plan (A6 violation).
3. **No persisted active-plan pointer and no plan list.** `readPlanCodebaseProjectPointer`/`storePlanCodebaseProjectPointer` (`src/lib/codebase-plan-storage.ts:81-92`) are used only by `/plan/codebase` (`plan/codebase.tsx:189, 237, 425`). Nothing lists a codebase's feature plans (B6, B7).
4. **Library readiness requires a ready analysis.** `isCodebaseLibraryReady` (`codebase-library.ts:137-146`) requires `status === "ready"` and `buildCodebaseLibraryItems` filters on it (line 204), so a repository with a valid usable snapshot but pending/failed analysis disappears from History (B5 violation).
5. **No repository identity beyond the folder name.** `codebases` has no identity column (`src/db/schema.ts:594-624`); the CLI reports only the basename (`packages/cli/src/lib/repository.ts:130-137`). Two different repositories with the same folder name are indistinguishable, and the same repository opened from another path cannot be recognised (B3).
6. **Opening a workspace can spend credit.** `$id.tsx:833-841` auto-triggers analysis when the resolved project has none, so opening a plan that never had an analysis bills the user without an explicit action (A4, A7).
7. **No CLI plan export.** `packages/cli/src/commands/export.ts` writes only `AGENTS.md`/`.cursorrules`/`.claude/rules/project-spec.md` from PRD+AC; grep for `vibeplan`/`HANDOFF`/`tasks.json` in `packages/cli/src` returns nothing. The workspace handoff card (`codebase-chat-workspace.tsx:115-126, 672-797`) therefore hands off rules plus `task next` instead of the complete plan (C1, C3, C7).

## File Structure

**Create**
- `src/lib/codebase-active-plan.ts` — pure active-plan resolution.
- `src/lib/codebase-active-plan.test.ts`
- `src/lib/codebase-workspace-hydration.ts` — pure workspace view state machine.
- `src/lib/codebase-workspace-hydration.test.ts`
- `src/lib/codebase-repository-identity.ts` — identity normalization + comparison.
- `src/lib/codebase-repository-identity.test.ts`
- `src/routes/api/codebases/$codebaseId/plans.ts` — plan list + explicit selection read/write contract.
- `src/components/codebase/codebase-plan-switcher.tsx` — plan list/open/create/switch UI.
- `packages/cli/src/lib/fs-atomic.ts` — atomic write + safe directory helpers.
- `packages/cli/src/lib/fs-atomic.test.ts`
- `packages/cli/src/lib/plan-export.ts` — pure export planning/rendering.
- `packages/cli/src/lib/plan-export.test.ts`
- `packages/cli/src/commands/export-plan.ts` — `export plan` action.
- `packages/cli/src/commands/export-plan.test.ts`

**Modify**
- `src/db/schema.ts` — `codebases.repositoryIdentity`; `drizzle/0033_*.sql` migration.
- `src/routes/codebases/$id.tsx` — deterministic plan resolution, hydration statuses, remove credit-spending auto-analysis, plan switcher wiring, planning-review indicator.
- `src/components/codebase/codebase-chat-workspace.tsx` — view-driven rendering + handoff prompt via CLI export.
- `src/lib/codebase-plan-storage.ts` — active-plan pointer per codebase.
- `src/lib/codebase-library.ts` + `src/routes/codebases/index.tsx` — readiness by usable snapshot, sync vs analysis status.
- `src/lib/codebase-sync.ts` — handshake identity field + mismatch signal.
- `src/routes/api/v1/codebases/$id/codebase/sync.ts` — adopt/verify identity.
- `src/routes/api/v1/projects/$id.ts` — expose `featureTree`, `codebase`, `snapshot` for export.
- `packages/cli/src/index.ts` — register `export plan`.
- `packages/cli/src/lib/sync-client.ts`, `packages/cli/src/lib/repository.ts` — report identity.

---

### Task 1: Deterministic active feature plan resolution

**Files:** create `src/lib/codebase-active-plan.ts`, `src/lib/codebase-active-plan.test.ts`.

**Interfaces (produces):**

```ts
export interface ActivePlanCandidate {
	id: string;
	name: string;
	updatedAt: string | null;
	hasArtifacts: boolean;
}

export type ActivePlanSource = "explicit" | "anchor" | "only_plan" | "most_recent_with_artifacts";

export type ActivePlanResolution =
	| { kind: "resolved"; plan: ActivePlanCandidate; source: ActivePlanSource }
	| { kind: "empty" }
	| { kind: "needs_selection"; plans: readonly ActivePlanCandidate[] };

export function resolveActivePlan(input: {
	requestedProjectId?: string | null;
	anchorProjectId?: string | null;
	plans: readonly ActivePlanCandidate[];
}): ActivePlanResolution;
```

Order: explicit pointer present in `plans` → `explicit`; anchor present → `anchor`; exactly one plan → `only_plan`; several plans and exactly one has artifacts → `most_recent_with_artifacts`; otherwise `needs_selection`. Never `plans[0]`, never bare `updatedAt` ordering.

**Verification:** `pnpm vitest run src/lib/codebase-active-plan.test.ts`; cases cover each source, an explicit pointer naming a foreign/unknown project, and the ambiguous multi-plan case.

---

### Task 2: Workspace hydration state machine

**Files:** create `src/lib/codebase-workspace-hydration.ts` + test.

**Interfaces (produces):**

```ts
export type ArtifactHydrationStatus = "pending" | "ready" | "empty" | "failed";

export interface WorkspaceArtifactHydration {
	feature: ArtifactHydrationStatus;
	prd: ArtifactHydrationStatus;
	ac: ArtifactHydrationStatus;
	tasks: ArtifactHydrationStatus;
}

export type WorkspacePlanState = "resolved" | "empty" | "needs_selection" | "failed";

export type WorkspaceView =
	| { kind: "loading" }
	| { kind: "plan_unavailable"; reason: "load_failed" | "not_found" }
	| { kind: "needs_plan_selection" }
	| { kind: "pristine" }
	| { kind: "active"; failedArtifacts: readonly (keyof WorkspaceArtifactHydration)[] };

export function resolveWorkspaceView(input: {
	plan: WorkspacePlanState;
	artifacts: WorkspaceArtifactHydration;
	hasMessages: boolean;
	hasQuestions: boolean;
	isSending: boolean;
	runStatus: "idle" | "running" | "failed" | "done";
}): WorkspaceView;
```

Rules: `plan === "failed"` → `plan_unavailable`; `needs_selection` → `needs_plan_selection`; `empty` → `pristine`; `resolved` with every artifact `pending` → `loading`; every artifact `failed` and no local activity → `plan_unavailable(load_failed)`; all `empty` and no local activity → `pristine`; anything `ready` → `active` naming the failed artifacts.

**Verification:** `pnpm vitest run src/lib/codebase-workspace-hydration.test.ts`.

---

### Task 3: Persisted active-plan pointer + plan list contract

**Files:** modify `src/lib/codebase-plan-storage.ts`; create `src/routes/api/codebases/$codebaseId/plans.ts`.

**Interfaces (produces):**
- `readActivePlanPointer(codebaseId: string): string | null`
- `storeActivePlanPointer(codebaseId: string, projectId: string): void`
- `clearActivePlanPointer(codebaseId: string): void`
- `GET /api/codebases/$codebaseId/plans` → `{ plans: Array<{ id, name, updatedAt, hasArtifacts }> }`, ownership-guarded, `hasArtifacts` computed from real rows (`featureTree`, `prd_versions`, `ac_versions`, `tasks`).

**Verification:** `pnpm vitest run src/lib/codebase-plan-storage.test.ts src/routes/api/codebases/-plans-route.test.ts`.

---

### Task 4: Stable repository identity

**Files:** create `src/lib/codebase-repository-identity.ts` + test; modify `src/db/schema.ts`; add `drizzle/0033_repository_identity.sql`; modify `src/routes/api/v1/codebases/$id/codebase/sync.ts`, `src/lib/codebase-sync.ts`, `packages/cli/src/lib/repository.ts`, `packages/cli/src/lib/sync-client.ts`.

**Interfaces (produces):**
- `normalizeRepositoryIdentity(remoteUrl: string | null | undefined): string | null` — strips protocol, userinfo, port, trailing slash and `.git`, lowercases host and path; returns `null` for anything unverifiable. Never returns a value containing credentials.
- CLI `readRepositoryIdentity(root: string): Promise<string | null>` reading `.git/config` (or the `gitdir:` target for a `.git` file), never shelling out.
- Handshake request gains `repositoryIdentity?: unknown`, validated by the same "untrusted cosmetic metadata" boundary as `repositoryName`; adopted on the codebase only when the stored value is null; a differing value records a `repository_identity_mismatch` lifecycle event and is reported through the sync status response.

**Verification:** `pnpm vitest run src/lib/codebase-repository-identity.test.ts packages/cli/src/lib/repository.test.ts packages/cli/src/lib/sync-client.test.ts src/lib/codebase-sync.test.ts`; `pnpm db:generate` produces a forward-only migration adding a nullable column plus an index.

---

### Task 5: Workspace rehydration and false-empty-state prevention

**Files:** modify `src/routes/codebases/$id.tsx`, `src/components/codebase/codebase-chat-workspace.tsx`; create `src/components/codebase/codebase-plan-switcher.tsx`.

**Interfaces (produces):**
- Loader returns `plans`, `anchorProjectId`, `defaultProjectId`, `planningSnapshotId`, `currentSnapshotId` in addition to today's fields.
- Component prop `view?: WorkspaceView` computed by `resolveWorkspaceView`; when omitted the component derives it from its existing props so direct renders keep their current behavior.
- Per-artifact statuses are set by every loader: `pending` before the request, `ready` when content is non-empty, `empty` when the server answered with no artifact, `failed` when the request failed.
- The `readStatus` auto-analysis trigger is removed; analysis runs only from the explicit retry action and the onboarding flow.
- A planning-review notice appears when the active plan's generation-context snapshot differs from the newest usable snapshot; nothing is regenerated.

**Verification:** `pnpm vitest run src/components/codebase/codebase-chat-workspace.test.tsx src/routes/codebases/-codebases-pages.test.ts src/routes/codebases/-workspace-analysis-reconciliation.test.tsx`.

---

### Task 6: Library readiness and multi-plan visibility

**Files:** modify `src/lib/codebase-library.ts`, `src/routes/codebases/index.tsx`, `src/components/codebase/codebase-library-view.tsx`.

**Interfaces (produces):**
- `CodebaseLibraryItem` gains `hasUsableSnapshot: boolean` and `planCount: number`; `buildCodebaseLibraryItems` filters on a usable snapshot, not on a ready analysis; `mapLibraryStatus` keeps sync and analysis status distinct.
- Library card shows the plan count and the real last-sync time.

**Verification:** `pnpm vitest run src/lib/codebase-library.test.ts src/components/codebase/codebase-library-view.test.tsx`.

---

### Task 7: Server export contract

**Files:** modify `src/routes/api/v1/projects/$id.ts`.

**Interfaces (produces):** `GET /api/v1/projects/$id` additionally returns `featureTree`, `codebase: { id, name, repositoryIdentity } | null`, and `snapshot: { id, commitSha, branch, createdAt } | null`, with `read:project` scope and ownership checks unchanged.

**Verification:** `pnpm vitest run src/routes/api/v1 -t "project detail"`; extend the existing v1 tests.

---

### Task 8: CLI `export plan`

**Files:** create `packages/cli/src/lib/fs-atomic.ts`, `packages/cli/src/lib/plan-export.ts`, `packages/cli/src/commands/export-plan.ts` + tests; modify `packages/cli/src/index.ts`.

**Interfaces (produces):**
- `writeFileAtomic(filePath: string, content: string): Promise<void>` — same-directory temp file + rename, temp removed on failure.
- `planExportWrites(input): PlanExportWrite[]` — pure; validates every output path stays inside `docs/vibeplan`, builds `manifest.json`, `feature.md`, `PRD.md`, `AC.md`, `tasks.json`, `HANDOFF.md`.
- `exportPlanCommand(projectId, options)` — resolves the Git root, authenticates with the existing config credential, verifies ownership and repository identity, fetches artifacts, refuses to write when a required artifact is missing, writes atomically, and reports each written path.

Layout: `docs/vibeplan/manifest.json` plus `docs/vibeplan/<slug>-<short-project-id>/{feature.md,PRD.md,AC.md,tasks.json,HANDOFF.md}`. Re-export updates only that feature and its index entry; a file whose recorded hash no longer matches disk is left untouched and the new content is written beside it as `<name>.vibeplan-new`. Never touches `AGENTS.md`, `.cursorrules`, `.claude/rules/`, or any other repository file. No Git commit or push.

**Verification:** `pnpm vitest run packages/cli/src/lib/fs-atomic.test.ts packages/cli/src/lib/plan-export.test.ts packages/cli/src/commands/export-plan.test.ts packages/cli/src/index.test.ts`; `pnpm --dir packages/cli build`.

---

### Task 9: Workspace handoff prompt

**Files:** modify `src/components/codebase/codebase-chat-workspace.tsx` and its test.

**Interfaces (produces):** `buildPlanHandoffPrompt(projectId: string, codebaseName: string | null): string` — a single copy-pasteable prompt that instructs the agent to read `AGENTS.md`, confirm the repository, run `vibeeverything export plan <projectId> --root .`, read `docs/vibeplan/manifest.json` and the feature's files, analyse the existing implementation, work tasks in dependency order against the acceptance criteria, verify against PRD and AC, update task status through the CLI, and follow the repository's testing/commit rules. No credential, token, or placeholder appears in it.

**Verification:** `pnpm vitest run src/components/codebase/codebase-chat-workspace.test.tsx`.

---

### Task 10: Tests and hardening

**Files:** extend `src/lib/codebase-chat-flow.test.ts`, `src/lib/codebase-sync.test.ts`, `src/routes/codebases/-codebases-pages.test.ts`, `src/lib/codebase-library.test.ts`, plus the new suites above.

Coverage required by `prompt1.md` E1: reopen with PRD / PRD+AC / tasks; refresh keeps project identity; correct active plan; multi-plan isolation; failed hydration is not an empty workspace; reopen neither duplicates projects nor regenerates nor spends credit; persisted Ask handoff restores; a late response for a previous plan never overwrites the active one; re-sync keeps `codebaseId`; failed re-sync preserves the previous usable snapshot; old planning stays after a successful re-sync; same-name different-identity repositories are never merged; a repository without a remote is handled safely; export writes the right content and manifest; multiple features do not overwrite each other; re-export is idempotent; invalid or unauthorized project ids are rejected; a missing artifact errors instead of writing an empty document; a failed write is not reported as success; traversal and unsafe paths are rejected; `AGENTS.md` is never overwritten; command parsing works on Windows paths with spaces.

**Verification:** `pnpm test`, `pnpm exec tsc --noEmit`, `pnpm check`, `pnpm build`, `rg -n "as never|as any|: any|@ts-ignore|@ts-expect-error|as unknown as" src packages/cli/src` returns nothing new.

---

### Task 11: Final audit, atomic commits, push

Review the diff for data loss, `codebaseId` vs `projectId` mistakes, active-plan resolution, race conditions, backward compatibility, CLI/API authorization, export filesystem safety, duplicate state, UI/error consistency, and test/type failures. Commit each coherent concern separately with Conventional Commit messages, push the branch, and verify a clean tree with zero outgoing commits.

---

## Self-Review

- **Spec coverage:** A1–A7 → Tasks 1, 2, 3, 5; B1–B7 → Tasks 1, 3, 4, 5, 6; C1–C9 → Tasks 7, 8, 9; D1–D4 → Tasks 5, 6, 8, 10 (authorization is enforced in Tasks 3, 4, 7, 8); E1 → Task 10; E2 is respected because no task opens a browser.
- **Placeholder scan:** no `TBD`/`TODO`/"handle edge cases"; every task names files, real signatures, and the exact command that proves it.
- **Type consistency:** `ActivePlanCandidate`, `WorkspaceView`, `ArtifactHydrationStatus`, `writeFileAtomic`, and `planExportWrites` are defined once and consumed by name in later tasks.
