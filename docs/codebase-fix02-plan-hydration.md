# FIX 02: Deterministic Plan Resolution for the Existing-Codebase Workspace

Scope: how `useWorkspacePlan` decides which feature plan a repository workspace
opens on, and when browser navigation state is allowed to influence that
decision. No browser-storage removal, no plan switching removal, no routing
change, no persisted-artifact (PRD/AC/Tasks) change, no database write, no
`suppressHydrationWarning`, no client-only workspace.

## 1. Root cause

`src/features/codebase/hooks/use-workspace-plan.ts` read the browser pointer
*inside the render-time resolution*:

```ts
requestedProjectId ?? readActivePlanPointer(codebase.id)
```

`readActivePlanPointer` reads `sessionStorage` (`plan-storage.ts`). The server
has no browser storage, so SSR resolved the plan from loader data alone; the
first client render read the pointer and could resolve a different plan. That
resolution feeds `resolvedFeature` → `CodebasePlanSwitcher`'s `activePlanName`
and the chat workspace's `featureName`, so server HTML and the first client
commit named different plans, which is exactly the reported mismatch
(`Ghazy Portofolio` vs `Demi Kemudahan Eksplorasi Karya`).

Two related state leaks made the same decision non-deterministic across a
repository switch: the requested project id and the created-plan list were plain
component state, so a workspace that navigated from one repository to another
could resolve with an id the new repository does not own.

## 2. Contract after the fix

```
SERVER (no browser storage)
  loader plans + onboarding anchor -> resolveActivePlan -> plan A markup
FIRST CLIENT RENDER
  same inputs (pointer not consulted) -> plan A markup  (markup identical)
AFTER HYDRATION
  read pointer -> validate against this repository's plans
     valid   -> selection = pointer        (user preference restored)
     invalid -> pointer ignored, storage rewritten with resolved plan
```

- Resolution inputs are `requestedProjectId` (in-session selection), the
  onboarding anchor, and the loaded plan list. Browser storage is never an input
  to a render.
- `sessionStorage` stays a navigation preference, applied after hydration and
  validated: an id that names no plan of this repository is dropped, never
  forced active. `resolveActivePlan` keeps its own guard for the same reason.
- Selection state, created-plan state, and the created-feature override are
  scoped by `codebase.id`, so a repository switch cannot carry a foreign id,
  foreign plan row, or foreign feature name into the new workspace.
- The canonical repository title stays repository identity; the switcher keeps
  naming the active feature plan.

## 3. Implementation

`src/features/codebase/hooks/use-workspace-plan.ts`:

- Render-time resolution now uses only `requestedProjectId`, `onboardingFeatureId`
  and `plans`; the `readActivePlanPointer` call was removed from the memo.
- A mount/plan-list effect reads the pointer once, validates it against the
  current plans, and only then sets the selection. It never overwrites an
  existing selection of the same repository, so an in-session choice is not
  silently moved by a later storage write.
- The existing store effect (already post-hydration) persists the plan that
  actually resolved, which heals a stale pointer.
- `selection`, `createdPlansState` and `activeFeatureState` carry the
  `codebaseId` they belong to; values from another repository read as absent.

Strategy note: a post-hydration React effect was chosen over an external store
because the value is navigation preference, not data — the server snapshot is
the deterministic resolution, and nothing needs to be readable during render.
An external store with a server snapshot would add a subscription layer for the
same result, and moving the workspace to client-only or suppressing the warning
is prohibited by FIX 02.

Server-readable navigation preference (evaluated, then rejected): nothing on the
server can read `sessionStorage`, and the only ways to give SSR a preference
would be a new store — a cookie or a column on the codebase row — which FIX 02
forbids ("don't create storage that is not needed") and which would also make an
unrelated navigation choice part of canonical database state. Applying the
existing pointer after hydration restores the same user-visible preference with
no new storage and no write to canonical state.

## 4. Targeted verification

New: `src/features/codebase/tests/workspace-plan-hydration.test.tsx` (9 tests,
jsdom). The server side is simulated by stubbing `sessionStorage` away during
`renderToString`, and the client side hydrates the emitted markup with
`hydrateRoot`, capturing `onRecoverableError` plus hydration-flavoured
`console.error` output.

Covered:

1. Server markup names the deterministic plan while a different pointer exists.
2. Hydration produces no recoverable error / console mismatch while a different
   plan is stored, then restores the valid stored preference.
3. Empty storage keeps the deterministic plan and records it.
4. Stale pointer (plan no longer owned) falls back to the valid plan and storage
   is rewritten with it.
5. Pointer naming another repository's plan is ignored.
6. Selection + refresh: the pointer survives a remount and re-hydrates without a
   mismatch.
7. Multiple plans are listed, the trigger label equals the active plan name, and
   the trigger contains no nested interactive / menu markup.
8. Repository switching honours the new repository's own pointer and never the
   previous repository's selection.
9. A feature created in the previous repository disappears on switch (trigger,
   and the plan list) instead of naming a plan the new repository does not own.

Existing suites re-run and green: `workspace-plan-isolation.test.tsx`,
`plan-switcher.test.tsx`, `workspace-feature-isolation.test.tsx`. Biome passed
for both touched files.

`pnpm exec tsc --noEmit` still reports the previously documented, unrelated
`studio-composer.test.tsx:241` `Promise.withResolvers` / ES2022 library error
(see `codebase-fix01-rich-answer-options.md`). That file and the repository
TypeScript configuration are unchanged by this fix.

No browser/Playwright QA in this fix (deferred to FIX 09), no live-database
observation: the hydration behaviour is verified through SSR/server + real
client hydration in jsdom, which is the deterministic part of the defect.

Baseline note (not caused by this fix): the folder run
`pnpm vitest run src/features/codebase` reports 13 failing tests in
`auto-name.test.ts`, `codebases-pages.test.ts`, `plan-codebase-name.test.tsx` and
`workspace-analysis-reconciliation.test.tsx`. Running those four files with the
hook change stashed produces the identical `13 failed | 89 passed`, so they are
pre-existing on this branch and outside FIX 02.
