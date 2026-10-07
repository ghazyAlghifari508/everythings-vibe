# VibeDesign Scrap Information Architecture & Mode Switching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine VibeDesign Scrap information architecture by separating Page Navigation (Scrap/History/Pricing in top navbar) from Scrap Tool Modes (Generate DESIGN.md / Scrape HTML tabs inside `/design/scrap`), porting the proven Docrivo interaction model without copying Docrivo visual branding.

**Architecture:**
1. Extract Page Navigation into the top navbar: canonical route predicate `isVibeDesignScrapRoute` controls desktop and mobile navlinks (`Scrap`, `History`, `Pricing`).
2. Remove `Scrap | Riwayat` segmented control from `src/routes/design/scrap.tsx`.
3. Add accessible two-mode tool switcher (`ScrapModeSwitcher`) on `/design/scrap` with `Generate DESIGN.md` (default) and `Scrape HTML`, preserving form state across tab switches via `hidden`.
4. Model `ScrapeMode = "design" | "html"` in database schema, service pipeline, and API so each mode runs only its required operations and produces only its contract artifact.
5. Mode-aware progress and result presentation (`design.md` for design mode, `index.html` for html mode), with explicit mode badges in History.

**Tech Stack:** React 19, TanStack Start, TanStack Router, TanStack Query v5, Drizzle ORM, Tailwind CSS 4, Lucide React, Vitest.

---

## Global Constraints
- Strictly work on branch: `feature/vibedesign-scrape`.
- Follow repository rules: `AGENTS.md`, `.opencode/rules/atomic-commit.md`, `.opencode/rules/no-hardcode.md`, `.opencode/rules/no-type-bypass.md`, `.opencode/rules/anti-ai-slop.md`.
- No fake progress, no artificial delays, no broad type bypasses (`as any`, `as never`, `@ts-ignore`).
- High-contrast button styling in both light and dark mode.
- Commit atomically after each coherent milestone and push to remote before handoff.

---

### Milestone 1: Top Navbar & Scoped Page Navigation Architecture

**Files:**
- Create: `src/lib/design-nav.ts`
- Test: `src/lib/design-nav.test.ts`
- Modify: `src/components/layout/navbar.tsx`
- Modify: `src/routes/design/scrap.tsx`
- Test: `src/components/layout/navbar-integration.test.tsx`

**Interfaces:**
- Produces:
  - `isVibeDesignScrapRoute(pathname: string): boolean`
  - `isVibeDesignScrapActive(pathname: string): boolean`
  - `isVibeDesignHistoryActive(pathname: string): boolean`
- Updates `Navbar`:
  - When in VibeDesign Scrap routes, renders desktop links: `Scrap` (`/design/scrap`), `History` (`/design/scrap/history`), `Pricing` (`/pricing`).
  - Active states: `/design/scrap` & descendants -> Scrap active; `/design/scrap/history` -> History active; History does NOT activate Scrap.
  - Mobile menu: renders `Scrap`, `History` (`/design/scrap/history`), `Pricing`.
- Cleans `src/routes/design/scrap.tsx`:
  - Removes `Scrap | Riwayat` segmented control completely.

- [ ] **Step 1: Write unit tests for `design-nav.ts` predicates**
- [ ] **Step 2: Implement `src/lib/design-nav.ts`**
- [ ] **Step 3: Update `src/routes/design/scrap.tsx` to remove segmented control**
- [ ] **Step 4: Update `src/components/layout/navbar.tsx` with desktop and mobile VibeDesign links**
- [ ] **Step 5: Update `navbar-integration.test.tsx` to assert VibeDesign Scrap, History, and Pricing links**
- [ ] **Step 6: Run tests and verify they pass**
- [ ] **Step 7: Atomic commit for Milestone 1**

---

### Milestone 2: Schema & Canonical Mode Domain Decision

**Files:**
- Modify: `src/db/schema.ts`
- Create: `drizzle/0031_add_scrapes_mode.sql` (generated via `drizzle-kit generate`)
- Modify: `src/db/vibe-design-schema.test.ts`

**Interfaces:**
- Produces:
  - `type ScrapeMode = "design" | "html"`
  - `scrapes.mode` column in PostgreSQL schema with enum and default `"design"`
  - `ScrapeMetadata.mode?: ScrapeMode`

- [ ] **Step 1: Write test in `vibe-design-schema.test.ts` asserting `scrapes.mode` definition and default**
- [ ] **Step 2: Update `src/db/schema.ts` to export `ScrapeMode` and add `mode` column to `scrapes` table and `ScrapeMetadata`**
- [ ] **Step 3: Run `pnpm db:generate` to produce migration `0031_...sql`**
- [ ] **Step 4: Run `pnpm db:migrate` to apply column to local database**
- [ ] **Step 5: Run tests and verify they pass**
- [ ] **Step 6: Atomic commit for Milestone 2**

---

### Milestone 3: Mode-Specific Scrape Service & API Operations

**Files:**
- Modify: `src/lib/services/scrape-service.ts`
- Modify: `src/routes/api/scrape.ts`
- Modify: `src/lib/services/scrape-service.test.ts`
- Create: `src/routes/api/-scrape-modes.test.ts`

**Interfaces:**
- Consumes: `mode?: ScrapeMode` in `createScrape` and `POST /api/scrape`
- Produces:
  - `html` mode pipeline: captures HTML, prepares preview, saves `index.html`, marks `completed` without AI generation
  - `design` mode pipeline: captures HTML, extracts tokens, generates `design.md`, saves document, marks `completed`
  - `listScrapes` returns `mode: ScrapeMode`

- [ ] **Step 1: Write unit tests in `scrape-service.test.ts` asserting pipeline differences between `design` and `html` modes**
- [ ] **Step 2: Update `src/lib/services/scrape-service.ts` to support `mode` in `createScrape`, `runScrapePipeline`, and `listScrapes`**
- [ ] **Step 3: Update `src/routes/api/scrape.ts` to accept `mode` in POST request body and return `mode` in responses**
- [ ] **Step 4: Run tests and verify they pass**
- [ ] **Step 5: Atomic commit for Milestone 3**

---

### Milestone 4: Two Real Tool Modes & Tab Switcher UI

**Files:**
- Create: `src/components/design/scrap-mode-switcher.tsx`
- Create: `src/components/design/design-generator-panel.tsx`
- Create: `src/components/design/html-scraper-panel.tsx`
- Modify: `src/components/design/html-scraper.tsx`
- Modify: `src/routes/design/scrap.index.tsx`
- Create: `src/components/design/scrap-mode-switcher.test.tsx`

**Interfaces:**
- Produces:
  - Accessible tab switcher with `role="tablist"`, `role="tab"`, `aria-selected`, `aria-controls`, `tabpanel`
  - Keyboard navigation: ArrowLeft, ArrowRight, Home, End, roving tabIndex
  - Preserves panel states across tab switches using `hidden`
  - Default mode: `Generate DESIGN.md`
  - DESIGN.md mode: input + "Buat DESIGN.md" button + helper "Website publik · DESIGN.md untuk AI coding"
  - Scrape HTML mode: input + "Scrape HTML" button + helper "Website publik · Preview HTML · index.html"
  - Neutral umbrella copy on `scrap.index.tsx`: "Ambil design system atau HTML dari website publik."

- [ ] **Step 1: Write tests for `ScrapModeSwitcher` covering default tab, tab switching, keyboard events, state preservation**
- [ ] **Step 2: Implement `DesignGeneratorPanel` and `HtmlScraperPanel` with high-contrast buttons**
- [ ] **Step 3: Implement `ScrapModeSwitcher` mounting both panels with `hidden`**
- [ ] **Step 4: Update `src/routes/design/scrap.index.tsx` with neutral umbrella copy and `ScrapModeSwitcher`**
- [ ] **Step 5: Run tests and verify they pass**
- [ ] **Step 6: Atomic commit for Milestone 4**

---

### Milestone 5: History List, Real Mode Progress & Result Contract Parity

**Files:**
- Modify: `src/components/design/scrape-history-list.tsx`
- Modify: `src/components/design/scrape-progress.tsx`
- Modify: `src/components/design/scrape-detail.tsx`
- Modify: `src/routes/design/scrap.$id.tsx`
- Modify: `src/routes/design/scrap.history.tsx`
- Test: `src/components/design/scrape-history-list.test.tsx`
- Test: `src/components/design/scrape-progress.test.tsx`
- Test: `src/components/design/scrape-detail.test.tsx`

**Interfaces:**
- Produces:
  - History list rows display clear mode badge: `DESIGN.md` vs `HTML`
  - `ScrapeProgress` displays honest stages according to mode
  - `scrap.$id.tsx` completes based on required artifact per mode (`design.md` for design, `index.html` for html)
  - `ScrapeDetail` presents mode-specific result view: DESIGN.md viewer for design mode; HTML preview/code for html mode

- [ ] **Step 1: Write tests in `scrape-history-list.test.tsx`, `scrape-progress.test.tsx`, and `scrape-detail.test.tsx` for mode handling**
- [ ] **Step 2: Update `ScrapeHistoryList` to display mode badges (`DESIGN.md` / `HTML`)**
- [ ] **Step 3: Update `ScrapeProgress` to render mode-specific stages**
- [ ] **Step 4: Update `ScrapeDetail` and `scrap.$id.tsx` to enforce single-artifact completion per mode and render mode-focused result**
- [ ] **Step 5: Run tests and verify all pass**
- [ ] **Step 6: Atomic commit for Milestone 5**

---

### Milestone 6: Verification, Browser QA & Push

**Verification:**
- Full test suite: `pnpm test`
- Typecheck: `pnpm exec tsc --noEmit`
- No type-bypass scan: `rg -n "as never|as any|: any|@ts-ignore|@ts-expect-error|as unknown as" src`
- Lint / format check: `pnpm check`
- Chrome DevTools live QA:
  - Desktop `/design/scrap`: navbar has Scrap / History / Pricing, no segmented control in content, DESIGN.md mode default, switch to HTML, state preserved.
  - History page: `/design/scrap/history`, navbar History active, items show mode badges.
  - Detail page: design mode result vs html mode result.
  - Light mode & dark mode visual check.
  - Mobile navbar verification.
- Push to remote `origin/feature/vibedesign-scrape` and verify git clean tree and zero outgoing commits.
