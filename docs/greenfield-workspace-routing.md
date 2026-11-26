# Greenfield workspace routing

## Route ownership

Greenfield uses TanStack Router nested layout routes, not a search-parameter wizard:

```text
/vibeplan/$id                    authenticated metadata and persistent shell
  /                             verified entry/resume redirect
  /ask                          loadAsk / AskFlow
  /fitur                        loadFitur / FiturDetail
  /prd                          loadPrd / PrdDetail
  /ac                           loadAc / AcDetail
  /task                         loadTask / TaskDetail
  /kanban                       loadKanban / KanbanBoard
```

`src/routes/vibeplan/$id/route.tsx` authorizes the parent before child loading. `workspace-project.server.ts` reads project metadata and artifact existence, not document bodies. Its owner/deletion predicate also scopes artifact existence checks. Child server functions retain independent authorization and existing plan checks. Existing Codebase projects redirect to their own workspace. `/prd/share/$token` remains public and outside this parent.

`GreenfieldWorkspace` owns project identity and last-route reporting. Global `AppLayout` and `Navbar` remain shared. Parent remount identity depends only on project ID. Children are keyed by project ID; project-specific global state resets before the next project's child mounts. Stage headers describe their content rather than duplicating the shared project header.

## Progress and resume

`flow-step.ts` is the canonical typed URL builder. Database workflow steps remain `question`, `fitur`, `prd`, `ac`, `task`; Kanban is a separate view, not a new database step.

`workspace-routing.ts` separates view, verified artifact availability, and progress. Opening a URL never marks its artifact completed. Entry uses an accessible same-project last URL first, then available artifacts or a completed Ask handoff. The historical default `projects.step = prd` does not imply a saved PRD. Locked direct URLs redirect to an accessible stage without running a child generator.

`flow-progress.ts` accepts exact same-project canonical or legacy URLs, rejects external/foreign paths, normalizes legacy URLs, and sends missing/invalid resumes to the server-verified workspace entry. No stored history rows are bulk rewritten.

## Lifecycle

Generation remains owned by existing server handlers and client hooks. No worker or queue was added. `use-generation-navigation-guard.ts` blocks pathname changes while Feature Tree, PRD, AC or Task work owns its view; unload uses the browser's native warning. AC also blocks while generated output needs a save retry. Completion releases the blocker; explicit PRD cancellation retains client ownership until request cleanup finishes.

PRD has one mounted chat/stream owner across desktop, mobile tab and tablet drawer presentations. Hiding chat does not unmount the connection. Existing resize, version selection, revision, export and public sharing remain in their existing components.

Setup and pending PRD prompts carry project identity. Workspace consumers cannot consume another project's prompt. Fitur's explicit PRD action can recover its compiled Ask context from the authenticated existing Ask loader. PRD drafts remain per-project, debounced while editing and flushed on departure; clearing one draft leaves other projects intact.

No schema, AI prompt, generation credit reservation, settlement or backend endpoint contract changed.

## Compatibility

`/ask/$id`, `/fitur/$id`, `/prd/$id`, `/ac/$id`, `/task/$id`, `/kanban/$id` are thin replace redirects to the corresponding canonical child. Payment destinations whitelist supported string search fields again at the redirect boundary: Router validation alone does not remove unknown input from the merged search object. IDs and stages are preserved.

Home and `/plan/new` remain pre-project entry pages. New Greenfield projects enter `/vibeplan/$id/ask`. History, Navbar, stage links, Admin project links and the Greenfield fallback from Codebase use canonical targets.

## Verification

- Official route generator succeeds.
- Router integration exercises shell identity across child navigation/history, legacy payment normalization, artifact resume, streaming navigation blocking/release, auth redirect, missing project isolation, child error containment, and project switching.
- Read-only DB smoke: owned project and resume load; foreign user, missing project and deleted project reject. Temporary smoke script removed.
- Actual HTTP SSR smoke: all six legacy paths return 307 to the matching canonical child; all six anonymous child entries redirect to login with the canonical return path.
- Production build succeeds. Build emits browser-externalization warnings for PostgreSQL dependencies; no browser QA was authorized, so browser rendering and live AI generation are not claimed verified.
- Full-repository checks must be reported separately from touched-file checks: existing Admin export ordering and the Studio `Promise.withResolvers`/ES2022 mismatch are outside this migration.
- `pnpm test --maxWorkers 2` timed out after 600 seconds, without a final suite count. It reported two failures in `src/features/codebase/tests/plan-codebase-analysis.test.tsx`: analysis failure/retry and legacy analysis refresh. This is not a passing full-suite result; the file is outside the migration.
- `/prd/share/invalid-token` returned HTTP 500 with no login redirect, matching the unchanged public route's throwing error path. A valid shared document was not exercised; public share success is Not Verified.
- Final routing/state selection: 10 files, 130 tests passed, including forward history and locked direct entry. Extended persistence/lifecycle selection: 24 unaffected files passed; stale Kanban consumers were corrected separately.
- Removed source-text/markup pins from the existing Codebase Kanban contract suite; retained input-validation and tenant-access boundary tests. Updated the real full-board URL assertion and replaced obsolete duplicate-project-title waits with task readiness; drawer/navigation assertions remain.
- Final Kanban selection: 3 files, 36 tests passed. Final touched-source Biome check: 66 files, no fixes or errors. Final full TypeScript diagnostics contain only the Studio `Promise.withResolvers` error above.
