# VibeDesign Scrap Repair & Docrivo Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the proven Docrivo scrape/design behavior in VibeEverything, adapt it to VibeEverything's architecture, provide an action-first Scrap page, dedicated History page, honest real persisted progress lifecycle, contrast-safe buttons in light/dark mode, and fix the DESIGN.md generation failure via structured extraction and `repairDesign`.

**Architecture:** 
1. The Scrap page (`/design/scrap`) is decoupled from history, presenting a centered action-first URL input with 56px control height, globe icon, and high-contrast submit button.
2. A scoped sub-navigation (`Scrap` | `Riwayat`) is mounted in the parent layout (`src/routes/design/scrap.tsx`), routing to `/design/scrap` and `/design/scrap/history`.
3. The dedicated History route (`src/routes/design/scrap.history.tsx`) manages user-owned scrape records with domain context, human-readable Indonesian status labels, view link, and delete capability.
4. The processing lifecycle is asynchronous and canonical: `queued` -> `capturing` -> `extracting` -> `generating` -> `saving` -> `completed` (or `failed`). All stages are persisted in the database and polled by the client; no fake timer or random percentages.
5. Dual-artifact contract: `completed` status requires BOTH `index.html` and `design.md` to be persisted.
6. The AI generation pipeline extracts structured `DesignExtraction` from the target site and feeds it into the design prompt, backed by Docrivo's `normalizeDesign`, `repairDesign` (ensuring 12+ Do/Don't bullets and 5+ example component prompts), and validation without leaking internal diagnostic details to end users.
7. Button contrast uses semantic tokens (`var(--btn-bg)` / `var(--btn-text)`) to guarantee visible text in both light and dark themes.

**Tech Stack:** React 19, TanStack Start & Router, Drizzle ORM, PostgreSQL 17, Tailwind CSS 4, Vercel AI SDK v7 / 9router, Vitest, Playwright/Chrome DevTools.

**Spec:** USER_REQUEST + Reference Implementation (`ghazyAlghifari508/docrivo` at `C:\Coding\Web Development\Next\docrivo`).

## Global Constraints
- Target branch: `feature/vibedesign-scrape` ONLY.
- Zero type-safety bypasses (`as never`, `as any`, `@ts-ignore`).
- Zero hardcoded magic strings or fake timer sequences.
- Real persisted state only: indicators must be driven by real backend database status.
- UI copy in Indonesian; technical domain terms preserved in English.
- Strictly adhere to atomic commit discipline per milestone.
- Mandatory browser QA in light and dark mode before declaring complete.

---

### Milestone 1: Canonical Scrape Lifecycle & Data Model Parity

**Files:**
- Modify: `src/db/schema.ts`
- Modify: `src/lib/design-errors.ts`
- Modify: `src/lib/types/scrape.ts` (or create if needed)
- Test: `src/db/vibe-design-schema.test.ts`

**Interfaces:**
- Consumes: `pgTable`, `text`, `jsonb`, `timestamp` from Drizzle ORM
- Produces: 
  - `ScrapeStatus`: `"queued" | "capturing" | "extracting" | "generating" | "saving" | "completed" | "failed"`
  - `ScrapeProgress`: mapping each status deterministically to 10%, 30%, 55%, 80%, 95%, 100%, 0%
  - `ScrapeMetadata` extended with `stage`, `progress`, `errorMessage`, `errorDetail`

- [ ] **Step 1: Write test for scrape lifecycle statuses and metadata schema**
- [ ] **Step 2: Update `src/db/schema.ts` status enum and metadata type**
- [ ] **Step 3: Update `src/lib/design-errors.ts` with user-friendly error codes and messages**
- [ ] **Step 4: Run tests and verify they pass**
- [ ] **Step 5: Atomic Commit for Milestone 1**

---

### Milestone 2: Scrap Page UI, Scoped Navigation & Submit Contrast Fix

**Files:**
- Modify: `src/routes/design/scrap.tsx` (add scoped nav: Scrap | Riwayat)
- Modify: `src/routes/design/scrap.index.tsx` (remove history loading and render action-first Docrivo composition)
- Modify: `src/components/design/html-scraper.tsx` (Docrivo layout: horizontal 56px input + globe icon + contrast-guaranteed CTA button)
- Test: `src/components/design/html-scraper.test.tsx`

**Interfaces:**
- Consumes: Scoped sub-navigation in `scrap.tsx`
- Produces: Action-first form without history rows under input; contrast-safe button (`bg-[var(--btn-bg)] text-[var(--btn-text)]` or high-contrast utility)

- [ ] **Step 1: Write tests for HtmlScraper UI and contrast tokens**
- [ ] **Step 2: Update `src/routes/design/scrap.tsx` layout with scoped navigation tabs**
- [ ] **Step 3: Refactor `src/components/design/html-scraper.tsx` to match Docrivo's composition and fix CTA contrast**
- [ ] **Step 4: Update `src/routes/design/scrap.index.tsx` to decouple from history loading**
- [ ] **Step 5: Run tests and verify they pass**
- [ ] **Step 6: Atomic Commit for Milestone 2**

---

### Milestone 3: Dedicated Scrap History Page

**Files:**
- Create: `src/routes/design/scrap.history.tsx`
- Create: `src/components/design/scrape-history-list.tsx`
- Test: `src/components/design/scrape-history-list.test.tsx`
- Test: `src/routes/design/-scrape-history-route.test.ts`

**Interfaces:**
- Consumes: `listScrapes`, `deleteScrape` from `src/lib/services/scrape-service.ts`
- Produces: Dedicated history screen with Indonesian status badges ("Selesai", "Diproses", "Gagal"), relative timestamps, open action, delete modal, empty state

- [ ] **Step 1: Write tests for `ScrapeHistoryList` component and history route**
- [ ] **Step 2: Implement `src/components/design/scrape-history-list.tsx` porting Docrivo `history-list.tsx` features**
- [ ] **Step 3: Implement route `src/routes/design/scrap.history.tsx` with loader and delete actions**
- [ ] **Step 4: Run route generation (`pnpm run generate-routes`) and tests**
- [ ] **Step 5: Atomic Commit for Milestone 3**

---

### Milestone 4: Restore Docrivo Structured DesignExtraction & Scraper Parity

**Files:**
- Create: `src/lib/design-extraction.ts`
- Modify: `src/lib/fetch-html.ts`
- Test: `src/lib/design-extraction.test.ts`
- Test: `src/lib/fetch-html.test.ts`

**Interfaces:**
- Consumes: HTML markup + inlined CSS from `fetch-html.ts`
- Produces:
  - `DesignExtraction`: structured tokens (colors, typography, typographyRoles, ctaButtons, fontFaces, layout_patterns, components, tokens, surfaces, imagery, metadata)
  - `extractDesignFromHtml(html: string, pageUrl: string): DesignExtraction`

- [ ] **Step 1: Write tests for `extractDesignFromHtml` asserting token discovery (colors, fonts, CTAs, headings)**
- [ ] **Step 2: Implement `src/lib/design-extraction.ts` porting Docrivo's visual signal extraction logic**
- [ ] **Step 3: Ensure `fetch-html.ts` provides complete inlined styles and handles redirects/bounds safely**
- [ ] **Step 4: Run tests and verify they pass**
- [ ] **Step 5: Atomic Commit for Milestone 4**

---

### Milestone 5: Restore Docrivo DESIGN.md Generation & Repair Parity

**Files:**
- Modify: `src/lib/prompts-design-md.ts`
- Test: `src/lib/prompts-design-md.test.ts`

**Interfaces:**
- Consumes: `DesignExtraction` from `design-extraction.ts`
- Produces:
  - `generateDesignMd(sourceUrl: string, extraction: DesignExtraction): Promise<string>`
  - `normalizeDesign(text: string): string`
  - `repairDesign(text: string): string` (repairs missing Do/Don't bullets to 12+ and example component prompts to 5+)
  - `designIssues(text: string): string[]`

- [ ] **Step 1: Write tests in `prompts-design-md.test.ts` verifying `repairDesign` handles short Do/Don'ts and component prompts**
- [ ] **Step 2: Implement `repairDesign` and update `generateDesignMd` to consume `DesignExtraction` with repair loops**
- [ ] **Step 3: Guard against raw internal diagnostic leaks; return user-friendly errors**
- [ ] **Step 4: Run tests and verify all pass**
- [ ] **Step 5: Atomic Commit for Milestone 5**

---

### Milestone 6: Real Persisted Progress Lifecycle & Processing UI

**Files:**
- Create: `src/hooks/use-scrape-status.ts`
- Create: `src/components/design/scrape-progress.tsx`
- Modify: `src/lib/services/scrape-service.ts`
- Modify: `src/routes/api/scrape.ts`
- Test: `src/hooks/use-scrape-status.test.ts`
- Test: `src/components/design/scrape-progress.test.tsx`

**Interfaces:**
- Consumes: `GET /api/scrape?id=$id` polling
- Produces:
  - `runScrapePipeline(scrapeId: string, userId: string): Promise<void>` transitioning DB rows through `queued` -> `capturing` -> `extracting` -> `generating` -> `saving` -> `completed`
  - `POST /api/scrape` immediately returns `scrapeId` and queues pipeline
  - `ScrapeProgress` component rendering real stages and a stage-aligned indeterminate bar based on persisted status, with no estimated percentage or ETA

- [ ] **Step 1: Write tests for async pipeline transitions and polling hook**
- [ ] **Step 2: Refactor `scrape-service.ts` with `runScrapePipeline` executing real stages and updating DB**
- [ ] **Step 3: Update `POST /api/scrape` to kick off async pipeline and return immediately**
- [ ] **Step 4: Implement `useScrapeStatus` hook and `ScrapeProgress` component inspired by Docrivo's `generation-result.tsx`**
- [ ] **Step 5: Run tests and verify they pass**
- [ ] **Step 6: Atomic Commit for Milestone 6**

---

### Milestone 7: Result Page & Failure/Retry Lifecycle Consistency

**Files:**
- Modify: `src/routes/design/scrap.$id.tsx`
- Modify: `src/components/design/scrape-detail.tsx`
- Test: `src/routes/design/-scrap-id-route.test.ts`
- Test: `src/components/design/scrape-detail.test.tsx`

**Interfaces:**
- Consumes: Polled status and completed artifacts
- Produces:
  - While in-flight: renders `ScrapeProgress` showing real backend progress
  - When failed: shows friendly error message and "Coba Lagi" (Retry) action without corrupt duplicate states
  - When completed: renders `ScrapeDetail` with dual artifacts (`index.html` preview + `design.md`), copy actions, and ZIP download
  - Contrast fix on all `ScrapeDetail` buttons

- [ ] **Step 1: Write tests for `scrap.$id` route handling in-flight, failed, and completed states**
- [ ] **Step 2: Update `src/routes/design/scrap.$id.tsx` to mount `ScrapeProgress` and handle retry**
- [ ] **Step 3: Fix button contrast in `src/components/design/scrape-detail.tsx`**
- [ ] **Step 4: Run tests and verify they pass**
- [ ] **Step 5: Atomic Commit for Milestone 7**

---

### Milestone 8: Full Verification, Security Audit & Browser QA

**Files:**
- All changed files
- Ported tests from Docrivo

**Verification:**
- Vitest full suite for design/scrape features
- Typecheck scan (`pnpm exec tsc` / bypass check)
- Biome check
- Chrome DevTools live QA:
  - Scrap landing page light mode & dark mode (contrast verified)
  - Submit live public URL
  - Observe real stage transitions
  - Verify completion, index.html preview, design.md, copy, ZIP download
  - Test History page: newly completed scrape, open, delete
  - Test refresh during processing (reconciles persisted state)
  - Test failure handling
- Final git push and zero outgoing commits verification

- [ ] **Step 1: Run comprehensive test suites and security checks**
- [ ] **Step 2: Perform Chrome DevTools browser QA across all flows and both themes**
- [ ] **Step 3: Push branch to `origin/feature/vibedesign-scrape`**
- [ ] **Step 4: Verify git clean tree and zero outgoing commits**
