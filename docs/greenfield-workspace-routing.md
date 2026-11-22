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

## P2: workspace CTA and forward navigation

Root cause: `readWorkspaceProject` built `hasPrd`/`hasAc`/`hasTasks` with raw `exists(select 1 from t where project_id = id)`. Postgres resolves the unqualified `id` to the inner table, so every flag was always false and parent `progress` never left `fitur`. The Navbar then derived its CTA from the persisted step rank and showed `Kembali ke Fitur` after a saved PRD. The subqueries now use drizzle `exists()` with table-qualified columns.

Sources of truth: the viewed route selects the stage; parent loader availability (`hasPrd`, `hasAc`, `hasTasks`) proves artifacts; the persisted step stays monotonic and never gates a forward CTA; chat-store flags and the in-flight advance request disable the CTA. `utils/flow-cta.ts` (`deriveWorkspaceCta`) is the only CTA policy for Fitur, PRD and AC. Ask keeps `getFlowStepCta`.

| Route | State | Primary CTA |
| --- | --- | --- |
| PRD | PRD unsaved or streaming | `Generate AC`, disabled |
| PRD | PRD saved, eligible | `Generate AC` |
| PRD | AC exists / tasks exist | `Lanjut ke AC` / `Lanjut ke Task` |
| AC | AC unsaved or generating | `Menyusun AC...`, disabled |
| AC | AC saved | `Generate Task` |
| PRD, AC | free plan | `Upgrade ke Pro` |

Invalidation: after a save, `use-workspace-sync` revalidates the parent once per (project, artifact) when the child loader holds the artifact and the parent does not. No per-token invalidation, no polling.

Endpoint contract change: `POST /api/projects/$id/step` now answers 401 when unauthenticated and 409 `PREREQUISITE_MISSING` when `ac` needs a saved PRD or `task` needs a saved AC. Ownership, Greenfield mode and soft-delete are checked on the locked project row. 403 `UPGRADE_REQUIRED` is unchanged; the Navbar opens the paywall on it. The endpoint never reserves or charges credits.

Recovery: a project with no saved PRD and no running generation shows `PrdRetryBar` in the PRD chat panel. It re-reads the persisted Ask handoff, or refreshes if the PRD appeared meanwhile.

Not verified: browser rendering (QA not authorized for P2) and live AI generation.

## P3: PRD chat toggle, composer focus, Send/Stop

Chat toggle. Navbar trigger (`navbar-flow-actions.tsx`) and the PRD chat container (`prd-detail.tsx`) both read `useUIStore.isChatPanelOpen`. The trigger carries `aria-expanded` and `aria-controls={PRD_CHAT_PANEL_ID}`; the container is an `<aside id={PRD_CHAT_PANEL_ID} data-state>`.

Class conflict found by audit (not a runtime reproduction). The old container combined `hidden md:flex` (tab), `md:hidden` (closed) and `xl:flex xl:w-0` (closed): same-breakpoint display utilities fight, and compiled order (`md:flex` before `md:hidden`, `xl:*` after `md:*`) made the closed panel at `xl` a zero-width `display:flex` box that stayed in the tab order. Now exactly one display utility per breakpoint: `<md` follows the Dokumen/Chat tab, `md+` follows the store (`md:flex` open, `md:hidden` closed). Closed = `display:none`: no width, border, resize hitbox or tab stops. The width transition on `xl` was removed with the `w-0` state.

Stream ownership is unchanged. The panel is hidden, not unmounted, so the `ChatPanel` stream owner, draft and messages survive repeated toggles. Reopen does not autosubmit (the autosubmit guard is untouched).

Draft isolation fix: `useChatDraft` kept the previous project's text when `projectId` changed inside one mounted hook (proved by a failing probe). It now swaps to the new project's draft in the same render and saves the old text under its own key.

Composer. Send/Stop is one button, `justify-end`, same position and size in both states. The press handler on the composer wrapper (`mousedown`) focuses the textarea when idle, enabled and not read-only, with the caret at the end; presses on a button, link, input or textarea are ignored. While streaming the textarea stays `disabled` and Stop still calls `onCancel` once (`useChatStream.handleCancel` aborts the active request). Enter ignores IME composition. Button has an accessible name, `focus-visible` ring and a 44px target below `md`. Icons are Hugeicons `ArrowUp02Icon` / `StopIcon` via the shared `Icon`.

Click-problem investigation. Two hypotheses, tested separately:
1. Empty composer area does not focus: confirmed by code. The wrapper had no handler and padding is outside the textarea, so a press there focused nothing. Fixed and covered by DOM tests.
2. Stop does not respond: not reproduced. In DOM tests Stop receives the click while the textarea is disabled and calls cancel once. Whether a real overlay (devtools corner button, `md:fixed` sheet at `z-40`, resize handle `-left-1 z-10`) covers it in a browser is Not Verified.

Component exploration (checked for Button/IconButton, Sheet/Drawer, InputGroup/Textarea, Collapsible/Resizable): shadcn InputGroup uses an addon `onClick` that focuses the input unless the target is a `button`, which is the same guard used here; adopting it would add a primitive that needs `lucide`/token rework for one wrapper. HeroUI (Textarea, Drawer), React Bits, AffectUI, TuffUI and SakaniUI index pages were fetched and keyword-scanned; they list chat, prompt or sheet pieces, but individual components were not installed or evaluated. Magic UI, CUI and ThinkingOrbs index pages had no relevant control (ThinkingOrbs matched only "prompt"). Nothing was adopted: the existing `Icon`, the `PromptBar` mousedown guard pattern and the existing tablet bottom-sheet container already cover the behavior, and the others would add a dependency or ornamental styling.

Not verified / for P8 (browser): hit testing at 360/768/1280px, overlap with the dev-only TanStack devtools button at bottom-right, resize hitbox and `z-40` sheet stacking, Stop reachable at the bottom of the viewport. Not done: a modal focus trap and backdrop for the tablet sheet. The sheet stays non-modal as before (document remains interactive); changing it to a modal drawer is a behavior change deferred to the P8 decision.

## P4: shared chrome, five-stage stepper, neutral progress

Workspace header. `GreenfieldWorkspace` no longer renders the `VibePlan <projectName>` bar. The `<section aria-label="VibePlan workspace">` stays as the flex/`min-h-0`/`overflow-hidden` parent, so child content starts directly under the Navbar. Last-route reporting, active-project reset, drawer/modal cleanup and the `activeProjectId` gate are unchanged. No replacement label or breadcrumb. Project name still appears in History, the Feature Tree root and documents.

Stepper. `FlowStepNav` `STEPS` is exactly Ask, Fitur, PRD, AC, Task. Kanban is a view of the Task stage: `view === "kanban"` maps to `task` for the current-stage marker (`aria-current="step"`). Completion is still read from `availability` (`hasHandoff`, `hasFeatures`, `hasPrd`, `hasAc`, `hasTasks`), never from the URL, so opening Kanban does not mark Task done. The `/vibeplan/$id/kanban` route, guard (`accessibleWorkspaceView`), History resume and the Kanban board are untouched. The indicator stays non-clickable.

Neutral status language (tokens `snow`, `onyx`, `fog`, `graphite`, which swap per light/dark theme):

| State | Marker | Extra signal |
| --- | --- | --- |
| Completed | outlined circle, `Tick01Icon`, `text-snow`, `border-fog` | sr-only `(Selesai)` |
| Active | filled `bg-snow text-onyx` circle with step number | `aria-current="step"`, sr-only `(Tahap saat ini)` |
| Pending | `border-graphite text-fog` circle with number | none |

The connector line colour still follows `stepRank`; it is not a status carrier. `bg-emerald` was removed from this component only. `CodebaseStepNav` and other `emerald` usages (diff, success toast, billing) are not touched.

PRD section progress (`ChatStreamStatus`). Rows are now a `<ul>`; the current row has `aria-current="step"`. Completed: neutral check (`text-mist`), label `text-mist`. Current: existing spinner in `text-snow`, label `text-snow` weight 510. Pending: `text-slate`. Each row has sr-only `(selesai)`, `(sedang diproses)` or `(menunggu)`. The eight sections and completion data still come from `ALL_PRD_SECTIONS` and the stream, nothing hardcoded. The heading `✅ PRD selesai digenerate` is now `PRD selesai`.

Component evaluation. Fetched: HeroUI component index (Stepper exists only as HeroUI Pro, paid; no free Stepper) and Magic UI component index (no stepper; `Animated Circular Progress Bar` and `Scroll Progress` do not fit a stage indicator). Not fetched or evaluated in P4: shadcn/ui, React Bits, AffectUI, ThinkingOrbs, TuffUI, CUI, SakaniUI. Decision: refine the existing `FlowStepNav` and shared `Icon`/`Tick01Icon`; no new component, no new dependency, no decorative dots, glow, gradient or motion.

Tests: `workspace-progress.test.tsx` (five stages, no Kanban label, Kanban maps to Task without inventing completion, status exposed without colour classes), `chat-stream-status.test.tsx` (differentiated rows, no `emerald`, no emoji), `workspace-router.test.tsx` (no title bar in the shell, shell identity preserved).

Not verified / for P8 (browser): contrast of the neutral markers in light and dark, 360px width with five indicators, and the layout of the Task/Kanban/AC/PRD documents without the removed header bar.

## P5: refined generation UX (Fitur, PRD, AC, Task)

One loader primitive: `src/components/ui/spinner.tsx` (installed HeroUI `Spinner` wrapper, `motion-safe`/`motion-reduce`). No new dependency, no orb/glow/sparkle component. `GenerationProgress` is now one semantic `<output>` with `Spinner` and `Menyusun {label}...`; its `thinkingText`, `isStreaming`, `steps` and `activeStep` props are gone.

| View | Before | After |
| --- | --- | --- |
| Fitur | Dynamic `AI sedang menyusun daftar fitur...` title, `ThoughtLine`, three tutorial cards, verbose error | Static `Feature Tree`; one topbar `Menyusun daftar fitur...`; existing `FeatureMapCanvas` skeleton/connectors/dots preserved; short empty/error copy |
| PRD | Center `GenerationProgress` with fake steps, waiting paragraph and typing dots even beside the section checklist | Eight-section checklist in Chat is the primary indicator; one compact fallback only when chat is closed / mobile document tab and before the first token; heading shortened to `Menyusun PRD` |
| AC | Animated six-bar TOC skeleton plus reasoning card | Real `TableOfContents` from streamed/saved headings; one pre-token loader inside `AcViewer`; saved/retry/error/paywall paths intact |
| Task | Title followed raw SSE reasoning, animated dots and a `thinking-title` helper | Static `Task Breakdown`; one topbar `Menyusun task...`; `WhiteboardCanvas` skeleton preserved; reasoning events ignored in the UI |
| Chat | Raw `<details>` reasoning and three blinking dots | One compact `Menunggu balasan...` / `Menyusun revisi...` status for non-document replies; document generation uses the checklist only |
| Navbar | Disabled CTA flipped to `Menyusun fitur...` / `Menyusun AC...` | Disabled forward CTA keeps `Generate PRD` / `Generate Task`; P2 readiness rules and hints unchanged |

Removed copy/symbols in Greenfield: `AI sedang menyusun daftar fitur`, `PRD sedang di-generate oleh AI`, `Menganalisis kebutuhan`, `Menulis dokumen`, the long waiting paragraph, `animate-typing-dot`, `Menyusun fitur...`, `Menyusun AC...`, `ThoughtLine`, `TypingIndicator`, `thinking-title.ts` and its test. `ThoughtLine` in Codebase and the internal reasoning state in the AC/chat hooks are untouched: neither renders in these views. Both canvases now expose `aria-busy` so the skeleton state is observable without inspecting CSS.

Preserved: skeleton nodes and dotted canvases, PRD live Markdown from the first token, Chat ownership/toggle (no remount), AC streaming/save-recovery/retry/credit/paywall, Task handoff/Kanban/drawers, credit atomicity and tenant scoping. No generation request is re-issued by a status change; the disabled CTA is still driven by real artifact state.

Component exploration: HeroUI `Spinner` was adopted from the existing wrapper; HeroUI docs were checked. Magic UI, React Bits, AffectUI, Thinking Orbs, TuffUI, CUI, SakaniUI and shadcn catalogs were evaluated at index level and rejected for decorative motion or missing fit. The existing skeleton canvases were reused instead of a new loading canvas.

Checks: touched-file Biome clean (18 files); targeted Vitest 10 files / 75 tests passed, including new `p5-status-contract.test.tsx` and `p5-view-generation.test.tsx` (static titles, one semantic status, `aria-busy` skeleton → real nodes, PRD fallback visibility/toggle/first token/abort, AC one loader and real TOC, disabled CTA labels). `pnpm exec tsc --noEmit` still reports only the pre-existing Studio `Promise.withResolvers` mismatch, outside P5.

Not verified / for P8 (browser, not authorized here): contrast and reduced-motion behaviour in light/dark, 360/768/1280px layout, real SSE timing, real credit/paywall interactions, and visual confirmation that the skeleton diagram remains unobstructed on each device.

## P6: one contextual PRD version control

Toolbar removed. `prd-viewer.tsx` no longer renders the always-visible `Pratinjau` segmented control or the `Diff` tab. The document is the default view. With 0/1 persisted version (or on the public share route, which passes no `versions`) the pane has no control bar at all; no replacement title bar was introduced.

Single control. `version-history.tsx` reuses the installed shadcn/Radix `DropdownMenu` (`src/components/ui/dropdown-menu.tsx`). One compact `Versi {n}` trigger sits at the right of the document pane. The menu lists actual persisted version numbers as `menuitemradio` items sorted newest first, checks the selected version and marks `(Terbaru)` from the maximum version number — not from array position — so stale and non-contiguous lists stay honest. Version selection calls the existing `onSelectVersion(content, version)` callback; nothing is written. The existing plan gate is unchanged: `FEATURES[plan].versionHistory === false` shows only the upgrade message, with no version records and no compare action.

| Compare case | Persisted pair (old → new) |
| --- | --- |
| Selected vN with an earlier revision | closest earlier version → vN |
| Earliest version selected (incl. v1) | v1 → next available version |
| Selected version missing from the list | closest earlier version → newest persisted version |
| Fewer than two usable records | compare unavailable |

`resolveComparePair` in `diff-utils.ts` owns that policy. Both diff sides are persisted records: the live/streaming canvas is never a diff side. Direction is always old → new, so `+`/`-` semantics are preserved. `PrdDiffViewer` and `computeDiff` are unchanged. Compare is a temporary mode entered from the same menu; a compact header shows `Versi X → Versi Y` with `Kembali ke dokumen`, Escape closes, focus returns to the version trigger, and starting a generation/revision leaves compare mode so live content is never hidden behind a stale snapshot. Version actions are disabled while generating.

State. `use-prd-detail.ts` only replaces the canvas when a genuinely newer persisted version appears; a loader revalidation with the same version no longer yanks the document back to latest while an older version is being read. A route param change resets the locally refreshed version list, content and selection to that project, preventing cross-project leakage. `prd-detail.tsx` passes `isGeneratingPRD` to the viewer. Append-only persistence, revisions via `:::UPDATE_SECTION[...]:::`, entitlement, read-only lock, chat toggle, TOC/Markdown/Mermaid and public share are untouched.

Component exploration (links checked, no Tavily): shadcn Dropdown Menu (`https://ui.shadcn.com/docs/components/dropdown-menu`) — adopted via the already-installed Radix wrapper, gives `aria-haspopup`/`aria-expanded`, roving keyboard focus, Escape, focus return and viewport collision handling with zero new dependency; Radix Dropdown Menu docs (`https://www.radix-ui.com/primitives/docs/components/dropdown-menu`) and the W3C APG menu-button pattern (`https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/`) match the interaction. HeroUI Dropdown (`https://www.heroui.com/en/docs/react/components/dropdown`) was evaluated but its React Aria-based v3 API would introduce a second menu convention for one control. Magic UI, React Bits, Thinking Orbs, AffectUI, TuffUI, CUI and SakaniUI catalogs were checked at index level: decorative/motion-oriented, no fit for a compact history control. No component was built from scratch and no package was added.

Checks: `diff-utils.test.ts` (pair direction, non-contiguous versions, v1 fallback, stale selection, invalid list) and `prd-viewer.test.tsx` (no toolbar for 0/1 versions, one labelled control, selected/latest markers, selection callback, compare from the same menu, old → new labels, back/Escape/focus return, plan gate, disabled actions during generation). Biome clean on touched files; targeted Vitest 2 files / 22 tests passed. `pnpm exec tsc --noEmit` still reports only the pre-existing Studio `Promise.withResolvers` mismatch, outside P6.

Not verified / for P8 (browser QA not authorized in P6): visual density at 360/768/1280px, real dropdown collision near viewport edges, and screen-reader announcement of the radio-style version items.
