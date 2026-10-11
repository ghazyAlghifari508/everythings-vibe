# Studio Workspace Overhaul Implementation Plan

**Goal:** Implement the user's full Studio canvas overhaul on `feature/vibedesign-design-studio`.

**Architecture:** Preserve the current authenticated routes, HTML outputs, assets and Studio job tables. Extend the existing job pipeline for explicit add/selected-revision/project-revision operations with database coordination. Keep generated content isolated from the application and make visual bounds authoritative.

**Authorization:** The user's supplied A–G implementation specification is the approved scope and execution order. No additional proposal or throwaway UI route is requested. Browser/DevTools QA is explicitly delegated to the user.

## Evidence and constraints

- Starting HEAD: `e382c1d637c41ca1ed511912d323e6a2a511b3bc`; upstream `origin/feature/vibedesign-design-studio`.
- Pre-existing untracked `docs/prompt/` is user work; never stage it.
- `AppLayout` excludes codebase detail but not Studio detail. Frame previews run scripts, have fixed heights and capture website interactions. Composer uses single selection, implicit additions and clears rejected drafts. Add/revise/retry services await AI; initial jobs are persisted but process-local locking cannot coordinate workers.
- Reuse existing Radix dropdown/dialog, theme/auth controls, canonical DESIGN.md extractor, ZIP exporter, frame/job/project/asset tables and AI adapter. No new runtime dependency without verified necessity.
- Preserve owner checks, server-only imports, original HTML/history, atomic writes, valid historical projects and unrelated workflows.
- All operation states are persisted facts: queued/planning/generating/ready/failed. No invented screens, stages or progress.
- Verify real contracts and persistence. Component mocks support regression checks but never establish end-to-end correctness.

## A — Workspace shell

- [x] Regression: Studio detail omits global navbar; Studio list retains it; body scroll ownership follows route.
- [x] Extend existing shell's detail-only routing and dynamic viewport sizing. Check, typecheck, four layout tests; commit `f99baff`.
- [ ] Add transaction-backed duplication in `studio-service.ts`: authorize source, copy metadata, owned assets, HTML references, frames, historical revisions; no running jobs transferred.
- [ ] Extend existing `studio.project.ts` POST with validated duplicate action; return independent project ID, classify failures.
- [ ] Replace detail header with existing accessible Radix menus, hamburger/back/duplicate, export/disabled Coming Soon and authenticated profile. Remove ready/platform/reference badges.
- [ ] Make ZIP reject empty output or missing required assets, retain real HTML.
- [ ] Verify duplicate ownership/rollback/source independence, route/action tests, archive contents, typecheck/check/diff; atomic concern commits.

## B — Theme and composer

- [ ] Apply semantic surfaces to Studio header/canvas/frame/composer/dialog/error states; primary button uses paired button variables rather than undefined ink.
- [ ] Autosizing textarea, Enter/Shift+Enter/IME, accepted-only clearing, pending ref guard, explicit add/project scope and selected revision; one Plus icon.
- [ ] Verify rejected draft, duplicate submissions, operation scope, semantic contrast values and check/types/tests; commit.

## C — Design systems

- [ ] Versioned curated preset data with real DESIGN.md specifications; palette menu reuses Radix and existing import dialog.
- [ ] Persist provenance and owned logo keep/replace/remove semantics. Enforce recognized tokens and preserve unsupported supplied styling as AI context; do not invent missing tokens.
- [ ] Apply existing frames through an explicit persisted revision operation when deterministic enforcement cannot honor the complete specification. Future generations use active reference.
- [ ] Verify extraction, persistence, logo references, actual token application and failure behavior; check/types/tests/migration if needed; commit.

## D — Visual frames

- [ ] Compare static browser capture (existing Playwright; server resource/storage costs), inert isolated HTML (no application interactions; Tailwind CDN needs compilation), and main DOM rendering (reject shared CSS/security boundary).
- [ ] Choose using verified rendering support. Generated JS must never execute in canvas. Preserve CSS/fonts/images and true full document bounds; retain source HTML. Cache visual outputs against HTML changes; contextual capture failure.
- [ ] Distinct viewport width with measured content height, aligned frame flow, no distortion/clipping, lazy visual loading.
- [ ] Verify security/output/height contracts and render regression checks without DevTools UI QA; check/types/tests; commit.

## E — Canvas interaction

- [ ] Real tool/temporary Space-pan state, V/H/Escape outside editables; pointer capture and actual dragging state, trackpad navigation.
- [ ] Multi-ID selection, Shift toggling, empty deselect, keyboard frame selection, removable named composer chips and reset across project IDs.
- [ ] Fit computed visual bounds; isolate controls from pointer/wheel handlers and keep mobile controls above composer.
- [ ] Check deterministic selection/gesture contracts, types/tests/check/diff; commit.

## F — AI lifecycle

- [ ] Existing Studio jobs gain validated targets/idempotency/operation metadata and database lease/claim coordination; no second orchestrator.
- [ ] Persist request and affected queued frames before acknowledgment. Context includes original project request/plan/system/selected IDs/previous HTML/new instruction.
- [ ] Independent target results, partial failure, successful frame retention, version history, targeted retry of original instruction, stale/restart recovery and bounded concurrency.
- [ ] Auth/input/malformed output/provider/storage/network/render errors distinguished; poll failures visible, no fabricated optimistic generation.
- [ ] Verify real database rollback/ownership/idempotency/reload/recovery/export, plus meaningful contract tests; check/types/tests; commit.

## G — Generation experience

- [ ] Replace fabricated skeleton layouts with persisted screen-name/status artboards and restrained edge motion; known dimensions only. Planning has no invented frame count.
- [ ] Immediate completed reveal, useful contextual errors/retry, terminal loading removal; reduced motion, focus, non-color-only selection and responsive controls.
- [ ] Inspect all states: empty, pending, disabled, valid/invalid, unauthorized, provider/storage/network/render failure, duplicate/stale/conflict, terminal. Cancel only where actual cancellation exists; no unsupported cancel control.
- [ ] Check/types/affected tests/diff; commit.

## Final verification and delivery

- [ ] Run actual `pnpm check`, `pnpm exec tsc --noEmit`, `pnpm test`, `pnpm build`; scan application roots for forbidden casts/suppressions and changed area for unfinished/fake behavior.
- [ ] Do not claim manual/browser visual QA. Record exact runtime blockers and remaining limitations; user performs browser QA.
- [ ] Review/stage intended files per concern, push resolved feature upstream, verify tree except pre-existing user artifacts, zero outgoing and upstream synchronization.
- [ ] Handoff branch/HEAD, changed files/reasons, root causes, operation/render/design/job contracts, actual results, atomic hashes and push evidence. Close goal only when full acceptance is evidenced.
