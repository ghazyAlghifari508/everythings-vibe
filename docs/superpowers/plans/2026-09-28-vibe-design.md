# Phase 2: VibeDesign Subsystem (Scrap HTML & DESIGN.md + Prompt UI Studio) Implementation Plan

> **For agentic workers & OMP:** Steps use checkbox (`- [ ]`) syntax for tracking. Follow tasks linearly from Task 1 to Task 6. At every task, write tests, implement code, verify tests pass, and run route sync before proceeding.

**Goal:** Implement the entire VibeDesign subsystem:
1. **Opsi 1 (Scrap HTML & DESIGN.md):** Port & adapt Docrivo so it is fully retired. Scrapes target website URLs, proxies preview assets to avoid CORS, and directly outputs 2 files: `index.html` (1440px desktop scaled preview) and `design.md` (12k+ character depth tokens, component specs, Do's/Don'ts) with copy buttons and ZIP download.
2. **Opsi 2 (Prompt UI Studio):** Adopt OpenDesign's prompt architecture and sandboxed iframe runtime to generate live, interactive HTML/Tailwind CDN components with responsive viewports (Desktop 1440px, Tablet 768px, Mobile 375px) and code inspection.

**Architecture:** TanStack Start full-stack routes with Drizzle ORM, Better Auth session guards, 9Router AI streaming orchestration, sandboxed `iframe` rendering, and an asset proxy endpoint (`/api/scrape/asset`) for preview isolation.

**Tech Stack:** TanStack Start, TanStack Router, React 19, TypeScript, Tailwind CSS, Drizzle ORM, PostgreSQL, Lucide React, JSZip, Vitest.

**Spec:** [`docs/superpowers/specs/2026-09-28-vibeeverything-architecture-spec.md`](file:///C:/Coding/Web%20Development/Tanstack-start/prdfy/docs/superpowers/specs/2026-09-28-vibeeverything-architecture-spec.md)  
**Visual UI Blueprint:** [`prototype-vibe-hub.html`](file:///C:/Coding/Web%20Development/Tanstack-start/prdfy/prototype-vibe-hub.html)  
**Docrivo Source Path:** `C:\Coding\Web Development\Next\docrivo`  
**OpenDesign Reference:** `https://github.com/nexu-io/open-design`  

---

## Global Engineering Constraints (CRITICAL)

1. **Drizzle Schema Type Rule:**
   All IDs and foreign keys to `users.id` **MUST use `text`**, NOT `uuid`!  
   Better Auth uses text string IDs. Writing `uuid("user_id")` will cause a fatal PostgreSQL type mismatch error.
2. **Porting & Adaptasi (DILARANG COPY-PASTE BUTA):**
   - Adapt all imports from Docrivo (`~/` $\rightarrow$ `@/`).
   - Use VibeEverything's session helper: `requireUserServer()` / `requireUser(request.headers)` from `@/lib/session`.
   - Use VibeEverything's Drizzle client: `db` from `@/db`.
   - Use VibeEverything's AI streaming orchestrator: `tryStreamWithFallback` from `@/lib/services/ai-orchestrator`.
3. **Route Tree Synchronization:**
   Every time route files are created or modified in `src/routes/`, execute `pnpm generate-routes` so `src/routeTree.gen.ts` stays in sync.
4. **Markdown Fences Cleaner:**
   Before injecting LLM output into an iframe `srcdoc`, always use `extractCleanHtml(raw)` to strip ````html ... ```` backtick blocks.
5. **Asset Proxy Required:**
   The sandboxed iframe preview needs `/api/scrape/asset` to load external stylesheets, fonts, and images without browser CORS/CSP blocks.
6. **Zero Type Bypasses:**
   No `as any`, `as never`, or `@ts-ignore`. All database inserts must satisfy Drizzle `$inferInsert`.

---

### Task 1: Database Schema for Scrapes and Studio Projects

**Files:**
- Modify: `src/db/schema.ts`
- Create: `src/db/vibe-design-schema.test.ts`

**Interfaces:**
- Consumes: Drizzle pg-core column types (`text`, `timestamp`, `jsonb`, `integer`).
- Produces: Tables `scrapes`, `scrapeDocuments`, `studioProjects`, `studioRevisions` with strict foreign key relations and TypeScript inference.

- [ ] **Step 1: Write test for schema definitions and type safety**

```typescript
// src/db/vibe-design-schema.test.ts
import { describe, expect, it } from "vitest";
import {
	scrapeDocuments,
	scrapes,
	studioProjects,
	studioRevisions,
} from "./schema";

describe("VibeDesign Schema Definitions", () => {
	it("defines scrapes and scrape_documents with text IDs", () => {
		expect(scrapes.id.dataType).toBe("string");
		expect(scrapes.userId.dataType).toBe("string");
		expect(scrapeDocuments.scrapeId.dataType).toBe("string");
	});

	it("defines studio_projects and studio_revisions with text IDs", () => {
		expect(studioProjects.id.dataType).toBe("string");
		expect(studioProjects.userId.dataType).toBe("string");
		expect(studioRevisions.projectId.dataType).toBe("string");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/db/vibe-design-schema.test.ts`
Expected: FAIL (Cannot find exported tables)

- [ ] **Step 3: Add tables to `src/db/schema.ts`**

Append to `src/db/schema.ts`:
```typescript
// === VIBEDESIGN TABLES ===

export const scrapes = pgTable("scrapes", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	userId: text("user_id")
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
	sourceUrl: text("source_url").notNull(),
	domain: text("domain").notNull(),
	title: text("title"),
	status: text("status", {
		enum: ["queued", "processing", "completed", "failed"],
	})
		.notNull()
		.default("queued"),
	html: text("html"),
	previewHtml: text("preview_html"),
	metadata: jsonb("metadata").$type<Record<string, unknown>>(),
	createdAt: timestamp("created_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
});

export const scrapeDocuments = pgTable("scrape_documents", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	scrapeId: text("scrape_id")
		.notNull()
		.references(() => scrapes.id, { onDelete: "cascade" }),
	designMd: text("design_md").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
});

export const studioProjects = pgTable("studio_projects", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	userId: text("user_id")
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
	title: text("title").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
});

export const studioRevisions = pgTable("studio_revisions", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	projectId: text("project_id")
		.notNull()
		.references(() => studioProjects.id, { onDelete: "cascade" }),
	prompt: text("prompt").notNull(),
	htmlCode: text("html_code").notNull(),
	version: integer("version").notNull().default(1),
	createdAt: timestamp("created_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
});

export type ScrapeRow = typeof scrapes.$inferSelect;
export type InsertScrapeRow = typeof scrapes.$inferInsert;
export type StudioProjectRow = typeof studioProjects.$inferSelect;
export type StudioRevisionRow = typeof studioRevisions.$inferSelect;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/db/vibe-design-schema.test.ts`
Expected: PASS

- [ ] **Step 5: Generate and push Drizzle migrations**

Run: `pnpm db:generate` and `pnpm db:push`
Expected: Migration generated and schema pushed to database cleanly.

- [ ] **Step 6: Commit**

```bash
git add src/db/schema.ts src/db/vibe-design-schema.test.ts drizzle/
git commit -m "feat(db): add scrapes and studio projects tables with text IDs"
```

---

### Task 2: Port & Adapt Docrivo Core Scraper, Preview Cleaner, and Asset Proxy

**Files:**
- Source Reference:
  - `C:\Coding\Web Development\Next\docrivo\src\lib\fetch-html.ts`
  - `C:\Coding\Web Development\Next\docrivo\src\lib\preview-html.ts`
  - `C:\Coding\Web Development\Next\docrivo\src\routes\api\scrape.asset.ts`
- Create: `src/lib/url-validator.ts`
- Create: `src/lib/fetch-html.ts`
- Create: `src/lib/preview-html.ts`
- Create: `src/routes/api/scrape.asset.ts`
- Test: `src/lib/preview-html.test.ts`
- Test: `src/lib/fetch-html.test.ts`

**Interfaces:**
- Consumes: Target website URL string.
- Produces: `fetchHtml(url: string)` returning raw HTML, `cleanPreviewHtml(html: string, baseUrl: string)` returning sanitized HTML with asset URLs rewritten to `/api/scrape/asset`, and `GET /api/scrape/asset?url=...` endpoint proxying external assets with CORS headers.

- [ ] **Step 1: Write tests for preview-html cleaner and asset rewriter**

```typescript
// src/lib/preview-html.test.ts
import { describe, expect, it } from "vitest";
import { cleanPreviewHtml, rewriteCssUrls } from "./preview-html";

describe("cleanPreviewHtml", () => {
	it("strips script tags and rewrites relative resources to asset proxy", () => {
		const raw = `<html><head><script>alert('xss')</script><link rel="stylesheet" href="/styles.css"></head><body><img src="/logo.png"></body></html>`;
		const cleaned = cleanPreviewHtml(raw, "https://example.com");

		expect(cleaned).not.toContain("<script>");
		expect(cleaned).toContain("/api/scrape/asset?url=https%3A%2F%2Fexample.com%2Fstyles.css");
		expect(cleaned).toContain("/api/scrape/asset?url=https%3A%2F%2Fexample.com%2Flogo.png");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/preview-html.test.ts`
Expected: FAIL (Cannot find module)

- [ ] **Step 3: Port and adapt `url-validator.ts`, `fetch-html.ts`, `preview-html.ts`, and `scrape.asset.ts`**

1. Port SSRF guard `src/lib/url-validator.ts` from Docrivo (checks private IP ranges `127.0.0.1`, `10.0.0.0/8`, `192.168.0.0/16` and validates hostname via DNS).
2. Port `src/lib/fetch-html.ts` from Docrivo:
   - Fetches HTML with bot headers (`User-Agent: Mozilla/5.0...`), redirect handling, 25-second timeout, and 5MB size limit.
3. Port `src/lib/preview-html.ts` from Docrivo:
   - Strips malicious tags, meta CSP, and converts links, images, and fonts to `/api/scrape/asset?url=...`.
4. Create `src/routes/api/scrape.asset.ts`:
   - Port handler from Docrivo `src/routes/api/scrape.asset.ts` using `createFileRoute("/api/scrape/asset")({ server: { handlers: { GET } } })`.
   - Set CORS header `Access-Control-Allow-Origin: *` and `Content-Security-Policy: sandbox; default-src 'none'`.
5. Sync router: `pnpm generate-routes`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/preview-html.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/url-validator.ts src/lib/fetch-html.ts src/lib/preview-html.ts src/routes/api/scrape.asset.ts src/lib/preview-html.test.ts src/routeTree.gen.ts
git commit -m "feat(design): port Docrivo HTML fetcher, preview cleaner, and asset proxy"
```

---

### Task 3: Port Docrivo 12k System Prompt & Scrape Service

**Files:**
- Source Reference:
  - `C:\Coding\Web Development\Next\docrivo\src\lib\ai-provider.ts`
  - `C:\Coding\Web Development\Next\docrivo\src\queries\scrapes.ts`
- Create: `src/lib/prompts-design-md.ts`
- Create: `src/lib/services/scrape-service.ts`
- Create: `src/routes/api/scrape.ts`
- Test: `src/lib/services/scrape-service.test.ts`

**Interfaces:**
- Consumes: Scraped HTML, target domain, `tryStreamWithFallback` from `@/lib/services/ai-orchestrator.ts`.
- Produces: `DESIGN.md` markdown generator with 12k+ character depth, and server endpoints for creating scrapes and streaming design system generation.

- [ ] **Step 1: Write test for scrape service database operations**

```typescript
// src/lib/services/scrape-service.test.ts
import { describe, expect, it } from "vitest";
import { buildDesignMdPrompt } from "@/lib/prompts-design-md";

describe("Scrape Prompt Builder", () => {
	it("builds 12,000+ character depth system prompt with token tables", () => {
		const prompt = buildDesignMdPrompt("https://linear.app", "<html><body><header>Linear</header></body></html>");
		expect(prompt).toContain("Tokens - Colors");
		expect(prompt).toContain("Tokens - Typography");
		expect(prompt).toContain("Tokens - Spacing & Shapes");
		expect(prompt).toContain("Tailwind v4");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/services/scrape-service.test.ts`
Expected: FAIL

- [ ] **Step 3: Port prompt and implement scrape service**

1. In `src/lib/prompts-design-md.ts`:
   Port the comprehensive 12,000+ char depth prompt from Docrivo `src/lib/ai-provider.ts`.
   Structure covers:
   - Header, Brand Essence, Theme (light/dark)
   - Tokens - Colors (semantic name, value, token, role)
   - Tokens - Typography (scale, font families, hierarchy)
   - Tokens - Spacing & Shapes (base unit, radius table, shadows)
   - 8-14 Component specs (Hero, Nav, CTA, Card, Form, Badge, Footer)
   - At least 6 Do and 6 Don't bullets
   - Agent Prompt Guide & Tailwind v4 starter code
2. In `src/lib/services/scrape-service.ts`:
   Implement `createScrape(userId, url)`, `getScrapeById(id, userId)`, `saveScrapeDocument(scrapeId, designMd)`.
   Use `requireUserServer()` and `db` from `@/db`.
3. In `src/routes/api/scrape.ts`:
   Expose `createServerFn` endpoint to handle scrape execution and trigger AI streaming.
4. Sync router: `pnpm generate-routes`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/services/scrape-service.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/prompts-design-md.ts src/lib/services/scrape-service.ts src/routes/api/scrape.ts src/lib/services/scrape-service.test.ts src/routeTree.gen.ts
git commit -m "feat(design): implement Docrivo 12k DESIGN.md prompt and scrape service"
```

---

### Task 4: VibeDesign Opsi 1 UI — Scraper Form & 2-File Output Viewer

**Files:**
- Source Reference:
  - `C:\Coding\Web Development\Next\docrivo\src\components\html-scraper.tsx`
  - `C:\Coding\Web Development\Next\docrivo\src\components\scrape-detail.tsx`
- Create: `src/components/design/html-scraper.tsx`
- Create: `src/components/design/scrape-detail.tsx`
- Create: `src/routes/design/index.tsx` (Landing page: Opsi 1 Scrap vs Opsi 2 Studio)
- Create: `src/routes/design/scrap.tsx` (Scraper URL input + history)
- Create: `src/routes/design/scrap.$id.tsx` (2-File Viewer)
- Test: `src/components/design/scrape-detail.test.tsx`

**Interfaces:**
- Consumes: Scrape data (`previewHtml`, `designMd`), `JSZip` library.
- Produces: 
  - `/design` landing page with two distinct cards.
  - `/design/scrap` scraper form.
  - `/design/scrap/$id` showing 2 files directly: Tab 1 `index.html` (1440px desktop scaled preview in sandboxed iframe) and Tab 2 `design.md` (markdown code view with syntax highlighting), "Salin DESIGN.md", "Salin HTML", and "Download ZIP (2 Files)".

- [ ] **Step 1: Write test for ScrapeDetail 2-file viewer tabs and actions**

```typescript
// src/components/design/scrape-detail.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ScrapeDetail } from "./scrape-detail";

describe("ScrapeDetail 2-File Output Viewer", () => {
	it("renders both index.html preview and design.md tabs with copy actions", () => {
		render(
			<ScrapeDetail
				sourceUrl="https://example.com"
				domain="example.com"
				previewHtml="<div>Mock Preview</div>"
				designMd="# Example Design System"
			/>
		);

		expect(screen.getByText("index.html")).toBeInTheDocument();
		expect(screen.getByText("design.md")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /Salin DESIGN.md/i })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /Download ZIP/i })).toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/components/design/scrape-detail.test.tsx`
Expected: FAIL

- [ ] **Step 3: Port and adapt UI components and routes**

1. In `src/components/design/html-scraper.tsx`:
   - URL input with domain validation, submit button with loading spinner, and list of previous scrapes.
2. In `src/components/design/scrape-detail.tsx`:
   - Header with source URL badge, timestamp, and action buttons ("Salin DESIGN.md", "Salin HTML", "Download ZIP").
   - Tab switcher: `Preview index.html (1440px Desktop)` vs `design.md (Tokens & System)`.
   - In `Preview index.html`: Render `<iframe srcDoc={previewHtml} sandbox="allow-scripts allow-same-origin" className="w-[1440px] h-[900px] border-0" />` inside a scaled viewport container (`transform: scale(...)`).
   - In `design.md`: Render formatted markdown with copyable code blocks.
   - ZIP download: Use `jszip` to pack `index.html` and `design.md` into `design-system-${domain}.zip`.
3. In `src/routes/design/index.tsx`:
   - Render 2 distinct selection cards:
     - Card 1: **Scrap HTML & DESIGN.md** $\rightarrow$ links to `/design/scrap`.
     - Card 2: **Prompt UI Studio** $\rightarrow$ links to `/design/studio`.
4. Create routes `src/routes/design/scrap.tsx` and `src/routes/design/scrap.$id.tsx`.
5. Sync router: `pnpm generate-routes`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/components/design/scrape-detail.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/design/ src/routes/design/ src/components/design/scrape-detail.test.tsx src/routeTree.gen.ts
git commit -m "feat(design): implement Opsi 1 Docrivo scraper UI and 2-file output viewer"
```

---

### Task 5: VibeDesign Opsi 2 — Prompt UI Studio (OpenDesign Pattern + Canvas Sandbox)

**Files:**
- Reference: `https://github.com/nexu-io/open-design`
- Create: `src/lib/clean-html.ts`
- Create: `src/lib/prompts-ui-studio.ts`
- Create: `src/components/design/studio-canvas.tsx`
- Create: `src/routes/api/studio/generate.ts`
- Create: `src/routes/design/studio.tsx`
- Create: `src/routes/design/studio.$id.tsx`
- Test: `src/lib/clean-html.test.ts`
- Test: `src/lib/prompts-ui-studio.test.ts`

**Interfaces:**
- Consumes: User UI prompt string, OpenAI/9Router streaming engine.
- Produces: `extractCleanHtml(raw)` helper, Prompt UI Studio interface with live sandboxed `iframe` canvas, responsive viewport toggles (Desktop 1440px, Tablet 768px, Mobile 375px), code inspection panel, and floating chat revision input.

- [ ] **Step 1: Write tests for clean-html helper and studio prompt generator**

```typescript
// src/lib/clean-html.test.ts
import { describe, expect, it } from "vitest";
import { extractCleanHtml } from "./clean-html";

describe("extractCleanHtml", () => {
	it("extracts pure HTML from markdown codeblock fences", () => {
		const raw = "```html\n<!DOCTYPE html><html><body><h1>Test</h1></body></html>\n```";
		const cleaned = extractCleanHtml(raw);
		expect(cleaned).toBe("<!DOCTYPE html><html><body><h1>Test</h1></body></html>");
	});

	it("returns raw HTML directly if no fences present", () => {
		const raw = "<!DOCTYPE html><html><body><h1>Test</h1></body></html>";
		const cleaned = extractCleanHtml(raw);
		expect(cleaned).toBe(raw);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/clean-html.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement clean-html helper, studio prompt, canvas, and routes**

1. In `src/lib/clean-html.ts`:
   ```typescript
   export function extractCleanHtml(raw: string): string {
     if (!raw) return "";
     const trimmed = raw.trim();
     const match = trimmed.match(/```(?:html)?\s*([\s\S]*?)\s*```/i);
     if (match && match[1]) {
       return match[1].trim();
     }
     return trimmed;
   }
   ```
2. In `src/lib/prompts-ui-studio.ts`:
   System prompt instructing the LLM to output a complete, production-grade standalone HTML page styled with Tailwind CSS CDN (`<script src="https://cdn.tailwindcss.com"></script>`), modern typography, semantic cards/grids, realistic copy (in Indonesian), and Lucide icons via CDN.
3. In `src/components/design/studio-canvas.tsx`:
   - Canvas toolbar: Viewport switcher buttons (Desktop `1440px`, Tablet `768px`, Mobile `375px`), Zoom/Scale slider, Tab switcher (`Canvas Preview` vs `Inspect Code`), "Salin HTML", "Download HTML".
   - Sandboxed iframe runtime:
     `<iframe srcDoc={extractCleanHtml(htmlCode)} sandbox="allow-scripts" className="h-full border-0 transition-all duration-300" style={{ width: viewportWidth }} />`
   - Floating chat input bar at the bottom for iterative revisions ("Ubah warna tombol jadi hijau", "Tambahkan tabel riwayat transaksi").
4. In `src/routes/api/studio/generate.ts`:
   Server endpoint streaming UI HTML generations using `tryStreamWithFallback`.
5. Create routes `src/routes/design/studio.tsx` and `src/routes/design/studio.$id.tsx`.
6. Sync router: `pnpm generate-routes`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/clean-html.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/clean-html.ts src/lib/prompts-ui-studio.ts src/components/design/studio-canvas.tsx src/routes/design/studio.tsx src/routes/design/studio.$id.tsx src/routes/api/studio/ src/lib/clean-html.test.ts src/routeTree.gen.ts
git commit -m "feat(design): implement Prompt UI Studio canvas runtime and HTML fence cleaner"
```

---

### Task 6: Route Tree Sync & Full Verification for Phase 2

**Files:**
- Modify: `src/routeTree.gen.ts` (regenerated)

- [ ] **Step 1: Regenerate route tree**

Run: `pnpm generate-routes`
Expected: Clean generation with `/design/index`, `/design/scrap`, `/design/scrap/$id`, `/design/studio`, and `/design/studio/$id` registered.

- [ ] **Step 2: Run full TypeScript check**

Run: `pnpm exec tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Run linter and formatting check**

Run: `pnpm check`
Expected: 0 errors.

- [ ] **Step 4: Run all unit & integration tests**

Run: `pnpm test`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/routeTree.gen.ts
git commit -m "chore: synchronize route tree and verify phase 2 vibe-design"
```
