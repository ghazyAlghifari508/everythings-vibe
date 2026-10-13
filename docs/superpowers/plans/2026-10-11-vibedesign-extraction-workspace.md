# VibeDesign Extraction Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver four persisted extraction modes and contextual HTML results through the existing Scrap workspace.

**Architecture:** Extend the user-owned scrape identity with validated settings and resumable PostgreSQL jobs. Reuse guarded Chromium capture, public-IP-pinned fetching, signed assets, and existing result/history routes. A separately managed worker claims persisted work and resumes checkpoints after interruption.

**Tech Stack:** Existing pnpm, TypeScript, React, TanStack Start/Router, PostgreSQL, Drizzle, Zod, Playwright, Vitest, Biome.

**Spec:** `docs/superpowers/specs/2026-10-11-vibedesign-extraction-workspace-design.md`

## Global Constraints

- Stay on `feature/vibedesign-scrape`; never merge main.
- Crawl and Images do not deduct credits.
- Preserve existing DESIGN.md generation, Style Inspector, and captured-DOM visual snapshot security.
- View switching remains local and never changes `from` or creates route history entries.
- Source/copy/download read persisted original HTML.
- Use no new runtime dependencies without approval.
- Every coherent milestone requires affected tests, typecheck, changed-file Biome, diff/status review, and an atomic commit.
- Before final delivery run full tests/check/build, type-bypass and security scans, authenticated application QA, push, and clean/upstream/outgoing verification.
- The user explicitly declined starting the dev server and worker on 2026-10-11. Do not start either service; report application browser and managed worker runtime QA as blocked.

## Rule obligations

| Rule | Action and execution point | Evidence |
| --- | --- | --- |
| basic-rules / no-assumptions | Read actual callers/contracts/tests before each change; preserve valid tests and scope | Relevant file reads and deterministic checks |
| skills-mcp | Load relevant process/domain skills before their phase; consult current library docs; discover reusable UI | Tool results and reuse notes |
| atomic-commit | Verify and commit each coherent unit before the next; stage exact paths | Gate output and hashes |
| no-hardcode | Put changeable limits/defaults in a browser-safe canonical module; wire actual state | Validation and parameter-effect tests |
| no-type-bypass | Validate unknown data, infer DB types, scan all actual application roots | tsc and bypass scan |
| anti-satisficing | Cover error/empty/pending/disabled/unauthorized/duplicate/stale/terminal states | Contract matrix and real QA |
| anti-ai-slop | Evaluate hierarchy/theme/keyboard/mobile/copy; preserve requested composition | Visual and accessibility QA |
| prdfy-context | Keep ownership, server-only imports, persisted state and ledger invariants | API/DB ownership tests and build |

## Task 1: Contextual Back navigation

**Files:** `src/components/design/scrape-back-link.tsx`, `src/components/design/scrape-back-link.test.tsx`, `src/lib/scrape-return-path.test.ts`.

**Interfaces:** Consume `resolveScrapeReturnPath(from: unknown): string`; preserve `ScrapeBackLink({ from?: unknown })`.

- [x] Read existing tests, return-path validation, form/history origin consumers, and recent navigation changes.
- [x] Replace the old expectation that history Back wins with a regression asserting the allowlisted target wins, including when unrelated history entries exist. Keep direct-link and unsafe-origin fallback coverage.
- [x] Run `pnpm test src/components/design/scrape-back-link.test.tsx src/lib/scrape-return-path.test.ts` and confirm the current interception violates that contract.
- [x] Remove the history interception and render the existing router Link with `to={target}` and `replace`, preserving modified-click native behavior.
- [x] Run the affected tests, `pnpm exec tsc --noEmit`, and `pnpm check src/components/design/scrape-back-link.tsx src/components/design/scrape-back-link.test.tsx`.
- [x] Inspect diff/status and commit `fix(design): honor validated scrape return destinations` (`f585e61`).

## Task 2: Typed settings, persistence and queue

**Files:** create `src/lib/scrape-contract.ts` and its test, `src/lib/services/scrape-job-service.ts` and its test; modify `src/db/schema.ts`, `src/routes/api/scrape.ts`, `src/lib/services/scrape-service.ts`, `.env.example`, `package.json`; generated migration under `drizzle/`.

**Interfaces:** `ScrapeRequest` is a Zod discriminated union of four modes with mode-specific settings. `claimScrapeJob` returns an owner/job/token/expiry claim or null. All writes require that claim and ownership. Existing `createScrape` consumers remain compatible through defaults.

- [ ] Inspect migration history, DB client, rate-limit helpers, API callers, deployment and tsx configuration before changing contracts.
- [ ] Add contract tests for missing/unknown mode, URL normalization/credentials/unsafe protocols, bounded integers, isolated settings, active duplicate requests and retry state predicates.
- [ ] Define canonical defaults/limits and strict Zod variants. Validate URL and settings both in the API and worker.
- [ ] Add additive settings/job fields and related page/image schemas with owner-bound unique identifiers; generate migration with `pnpm db:generate` and inspect SQL.
- [ ] Implement transactionally locked job claim/lease renewal/recovery with fencing, bounded attempts and resource caps. Completed page/image checkpoints survive retries.
- [ ] Replace API fire-and-forget invocation with enqueueing; apply ownership, request-size/rate limits and idempotency to creation/retry/delete.
- [ ] Add a managed worker entry and package script, graceful shutdown/browser cleanup, documented readiness/deployment and required environment configuration.
- [ ] Verify lease race/recovery, ownership, retry reuse and legacy records; run affected tests/tsc/check, inspect diff and atomic commit each independently working contract/queue unit.

## Task 3: Crawl engine and results

**Files:** create `src/lib/crawl-website.ts`, `src/lib/crawl-website.test.ts`, `src/lib/crawl-url-filter.ts`, its test, `src/components/design/crawl-result.tsx`; modify `src/lib/fetch-html.ts`, job/service integration and result route.

**Interfaces:** Engine consumes validated Crawl settings and claim-fenced checkpoint callbacks. Outputs persisted pages and observed parent edges; blueprint is generated from persisted observations.

- [ ] Inspect extraction helpers and reuse safe fetch; add redirect-scope callback before following redirects, not after fetching them.
- [ ] Test breadth-first depth zero/page bound, normalization/deduplication, host/subdomain scope, external/private redirects, robots precedence/unavailability/delay, include flags, main-only text and partial failures.
- [ ] Implement isolated regex evaluation with syntax validation, input/pattern caps and worker termination deadline; test pathological timeout independently.
- [ ] Persist frontier/page status/results per page and observed edges; use shared per-origin scheduling and bounded request deadlines/concurrency.
- [ ] Implement inventory, observed sitemap, selected page content/metadata, partial errors and downloadable observed blueprint. Display preview only if captured.
- [ ] Verify reopen/recovery and export effects with controlled fixtures, run tests/tsc/check and atomic commit engine then result integration.

## Task 4: Image extraction and secure explorer

**Files:** create `src/lib/scrape-images.ts`, its test, `src/components/design/images-result.tsx`; modify `src/lib/render-page.ts`, `src/lib/fetch-html.ts`, signed asset/download boundary, worker/service and result route.

**Interfaces:** Capture returns bounded image candidates plus provenance. Image result stores dimensions only when measured and category only with recorded metadata evidence.

- [ ] Add fixtures for currentSrc/srcset/picture/lazy attributes/computed backgrounds/icon links, duplicates and broken/large assets.
- [ ] Pass wait settings into actual Chromium capture; gather rendered candidates under scan/count/byte caps.
- [ ] Implement optional bounded actual resolution measurement and optional evidence-based classification; unavailable/ambiguous data stays null with reason.
- [ ] Persist asset/page associations and incremental processed/failed counts through fenced checkpoints.
- [ ] Issue signed image capabilities after owner lookup; attachment download only accesses actual stored image targets through safe bounded fetch.
- [ ] Build gallery/filter/empty/failure states with real thumbnails and original sources; handle broken thumbnails without placeholders.
- [ ] Verify unauthorized/expired/deleted-owner capability, MIME and resource-size boundaries; tests/tsc/check and atomic commits.

## Task 5: Shared four-mode workspace and parameters

**Files:** modify `scrap.index.tsx`, `scrap-mode-switcher.tsx`, existing form components/tests; create shared form/parameters in `src/components/design/`; modify history/result/status contracts and tests.

**Interfaces:** Shared form consumes `ScrapeRequest`; per-mode settings reset from canonical defaults; submit returns the existing scrape ID and preserves form origin.

- [ ] Discover existing UI primitives and inspect semantic tokens/autofill rules; evaluate composition against the user's supplied structural reference.
- [ ] Build four independent mode buttons with keyboard selection, centered restrained heading, shared protocol/suffix input, arrow-up submit and concise mode text.
- [ ] Keep mode settings isolated, validate via the shared schema, collapse advanced parameters, and reset only active settings. DESIGN.md has no invented settings.
- [ ] Use a synchronous in-flight guard and stable idempotency key; preserve user input and show field/server errors.
- [ ] Extend history labels and result dispatch for all four modes; polling reads typed persisted counts and errors without synthetic percentages.
- [ ] Verify each request/settings/reset/paste/Enter/duplicate/invalid contract; run affected tests/tsc/check, routes generation and atomic commit.

## Task 6: HTML capture parameters and detail toolbar

**Files:** `render-page.ts`, `fetch-html.ts`, `scrape-detail.tsx`, `scrap.$id.tsx`, related lifecycle/readiness/route tests.

**Interfaces:** Extend capture options with bounded wait and iframe inclusion; source remains original persisted HTML, snapshot stays separate.

- [ ] Test bounded additional capture wait and safely accessible same-origin iframe capture, skipped-frame reporting and byte/count limits.
- [ ] Implement actual capture settings without re-executing page JavaScript on view changes or relaxing CSP/signed assets.
- [ ] Add one site title and one full URL; Eye/Code icon tabs share compact toolbar with copy/download and accessible keyboard/tooltip/selected states.
- [ ] Preserve original source data, wide preview, readiness/retry and inactive media behavior; verify repeated switches create no router entries.
- [ ] Run capture/lifecycle/copy/download/navigation regressions, tsc/check and atomic commit.

## Task 7: Full QA and delivery

- [ ] Run `pnpm generate-routes`, `pnpm test`, `pnpm exec tsc --noEmit`, `pnpm check`, and `pnpm build`; record output and distinguish baseline failures.
- [ ] Scan actual roots for `as never|as any|: any|@ts-ignore|@ts-expect-error|as unknown as`, unfinished behavior, secrets and unsupported controls.
- [ ] With authorized managed runtime, verify worker readiness, crash/restart recovery and all four authenticated operations on controlled fixtures and public targets.
- [ ] Run History→Detail→repeated switches→Back, form→Detail→Back, direct URL fallback, refresh/reopen/delete/retry, ownership and secure downloads.
- [ ] Review desktop/mobile 320–1440 widths, light/dark contrast, keyboard/focus, reduced motion, empty/error/pending states; fix issues and restart affected journeys.
- [ ] Commit verified cleanup, push exact feature upstream, verify clean working tree and `git rev-list --left-right --count HEAD...@{upstream}` equals `0 0`.
- [ ] Report actual changes, backend parameter effects, security/test/browser evidence, hashes, push and status. Do not call full feature Complete with missing runtime QA or modes.

## Verified checkpoints

- `addd373`: spec and plan; database-backed direction and uncharged Crawl/Images decision documented.
- `f585e61`: contextual Back fix; regression demonstrated failure before fix, then 17 tests passed. Typecheck and changed-file Biome passed. Authenticated browser behavior remains unverified.
- `130bd85`: browser-safe request/settings contract, not yet wired to API. Sixteen contract tests, typecheck, and changed-file Biome passed. Existing server DNS/private-IP protections remain the authoritative fetch boundary.
- Baseline `pnpm test`: 223 files passed, two tests timed out under full-suite parallel load (2169 tests passed). Rerunning the two affected files passed all 10 tests. Do not characterize the full baseline suite as passed.
- Full four-mode implementation remains pending. Written spec review is required before persistence/worker implementation proceeds.
