# ibeEverything Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform PRDFY into VibeEverything by porting &amp; adapting Docrivo's scraper &amp; 2-file generator, adopting OpenDesign's prompt &amp; sandboxed iframe canvas, implementing the 4-Bento Homepage Hub with a slide-out History Drawer, and rebranding the CLI package to `@ghazynabiel/vibeeverything`.

**Architecture:** A unified TanStack Start + Vite full-stack workspace running on Drizzle ORM, Better Auth, and 9Router/OpenAI-compatible AI streaming. All navigation flows through the 4-Bento Hub (`/`) and the top-navbar History Drawer, routing into dedicated standalone sub-routes (`/plan/*`, `/design/*`, `/templates`, `/bantuan`).

**Tech Stack:** TanStack Start, TanStack Router, React 19, TypeScript, Tailwind CSS, Drizzle ORM, PostgreSQL, Lucide React, JSZip, Commander (CLI).

**Spec:** [`docs/superpowers/specs/2026-09-28-vibeeverything-architecture-spec.md`](file:///C:/Coding/Web%20Development/Tanstack-start/prdfy/docs/superpowers/specs/2026-09-28-vibeeverything-architecture-spec.md)  
**Visual UI Blueprint:** [`prototype-vibe-hub.html`](file:///C:/Coding/Web%20Development/Tanstack-start/prdfy/prototype-vibe-hub.html)  
**Docrivo Reference Source:** `C:\Coding\Web Development\Next\docrivo`  
**OpenDesign Reference Source:** `https://github.com/nexu-io/open-design`  

---

## Global Engineering Constraints &amp; 5 Critical Safeguards

1. **PORTING &amp; ADAPTASI (JANGAN COPY-PASTE BUTA, JANGAN BIKIN DARI NOL):**
   - **Fitur Scrap HTML &amp; DESIGN.md:** Ambil algoritma scraping, preview cleaner, prompt 12k char, dan UI dari Docrivo (`C:\Coding\Web Development\Next\docrivo`). Sesuaikan (adaptasi) seluruh import path (`@/*`), autentikasi (`@/lib/session`), skema Drizzle database, dan orchestrator AI VibeEverything.
   - **Fitur Prompt UI Studio:** Pelajari repo OpenDesign (`https://github.com/nexu-io/open-design`). Ambil arsitektur prompt generator HTML/Tailwind CDN dan komponen canvas sandboxed iframe, lalu implementasikan secara rapi ke stack VibeEverything.
2. **PENGAMAN 1 — Route Tree Synchronization:** Setiap kali membuat/mengubah file di dalam `src/routes/`, agent **WAJIB menjalankan `pnpm generate-routes`** sebelum menjalankan typecheck atau test agar `src/routeTree.gen.ts` selalu sinkron.
3. **PENGAMAN 2 — Scraper Asset Proxy (`/api/scrape/asset`):** Wajib mengikutsertakan endpoint asset proxy agar gambar, font, dan stylesheet preview website yang discrap tidak terblokir CORS/CSP di iframe.
4. **PENGAMAN 3 — Markdown Cleaner Helper (`extractCleanHtml`):** Output LLM wajib diparsing membersihkan tag `html ...`  sebelum disuntikkan ke `<iframe srcdoc={...} />`.
5. **PENGAMAN 4 — History Drawer Lazy Fetching:** Drawer riwayat pada navbar root HANYA boleh mem-fetch data ke database saat drawer berstatus terbuka (`enabled: isOpen`).
6. **PENGAMAN 5 — Preservasi State ChatInput Greenfield:** Logic input PRD &amp; pembuatan projek dari `src/routes/index.tsx` wajib dimigrasikan secara utuh ke `src/routes/plan/new.tsx`.
7. **Zero Type Bypasses &amp; Tenant Isolation:** Bebas dari `as any` dan `@ts-ignore`. Seluruh mutasi menggunakan Drizzle `$inferInsert` dan filter `eq(table.userId, user.id)`.

---

### Task 1: Rebrand CLI in `packages/cli` to VibeEverything

**Files:**

- Modify: `packages/cli/package.json`
- Modify: `packages/cli/src/index.ts`
- Modify: `packages/cli/src/lib/version.ts`
- Modify: `packages/cli/README.md`
- Test: `packages/cli/src/index.test.ts`

**Interfaces:**

- Consumes: Commander CLI primitives and existing codebase sync actions.
- Produces: `@ghazynabiel/vibeeverything` npm package with binary executable `vibeeverything` and `prdfy` alias.

- [ ] **Step 1: Write failing test for VibeEverything CLI binary name and branding**

```typescript
// packages/cli/src/index.test.ts
import { describe, expect, it } from "vitest";
import { program } from "./index.js";

describe("CLI branding and commands", () => {
	it("has name vibeeverything and proper description", () => {
		expect(program.name()).toBe("vibeeverything");
		expect(program.description()).toContain("VibeEverything");
	});

	it("registers codebase sync command", () => {
		const codebase = program.commands.find((c) => c.name() === "codebase");
		expect(codebase).toBeDefined();
		const sync = codebase?.commands.find((c) => c.name() === "sync");
		expect(sync).toBeDefined();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/cli/src/index.test.ts`
Expected: FAIL with `expected 'prdfy' to be 'vibeeverything'`

- [ ] **Step 3: Update `packages/cli/package.json`, `version.ts`, `index.ts`, and `README.md`**

In `packages/cli/package.json`:

- `name`: `@ghazynabiel/vibeeverything`
- `bin`: `{ "vibeeverything": "dist/index.js", "vibe": "dist/index.js", "prdfy": "dist/index.js" }`
- `description`: "CLI tool for VibeEverything — manage projects, codebases, and tasks from terminal"

In `packages/cli/src/index.ts`:

- Set `program.name("vibeeverything")` and description mentioning VibeEverything.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run packages/cli/src/index.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/
git commit -m "feat(cli): rebrand CLI package to vibeeverything"
```

---

### Task 2: Layout Shell &amp; Top Navigation (Hamburger Menu + Lazy History Drawer)

**Files:**

- Create: `src/components/layout/history-drawer.tsx`
- Modify: `src/components/layout/navbar.tsx`
- Modify: `src/routes/__root.tsx`
- Test: `src/components/layout/history-drawer.test.tsx`
- Test: `src/components/layout/navbar-integration.test.tsx`

**Interfaces:**

- Consumes: UI store drawer toggle, lazy TanStack Query for history (`enabled: isOpen`), and layout blueprint from `prototype-vibe-hub.html`.
- Produces: Slide-out `HistoryDrawer` and updated `Navbar` with hamburger button on the left of the logo and single `Pricing` link.

- [ ] **Step 1: Write test for History Drawer and updated Navbar**

```typescript
// src/components/layout/history-drawer.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HistoryDrawer } from "./history-drawer";

describe("HistoryDrawer", () => {
	it("renders search bar and category tabs when open", () => {
		const onClose = vi.fn();
		render(
			<HistoryDrawer
				isOpen={true}
				onClose={onClose}
				items={[
					{
						id: "p1",
						name: "E-Commerce SIMRS",
						type: "plan",
						updatedAt: new Date(),
						url: "/prd/p1",
					},
					{
						id: "s1",
						name: "Airbnb Landing Scrap",
						type: "scrap",
						updatedAt: new Date(),
						url: "/design/scrap/s1",
					},
				]}
			/>
		);

		expect(screen.getByPlaceholderText(/Cari riwayat/i)).toBeInTheDocument();
		expect(screen.getByText("Semua")).toBeInTheDocument();
		expect(screen.getByText("VibePlan")).toBeInTheDocument();
		expect(screen.getByText("Scrap")).toBeInTheDocument();
		expect(screen.getByText("E-Commerce SIMRS")).toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/components/layout/history-drawer.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement `HistoryDrawer` with lazy fetching and update `Navbar`**

- Ambil struktur slide-out drawer dari `prototype-vibe-hub.html` (backdrop overlay, search bar, filter tabs: `Semua`, `VibePlan`, `VibeDesign`, `Scrap`, dan list kartu projek).
- Pasang hook TanStack Query di drawer: `useQuery({ queryKey: ["history-drawer"], queryFn: fetchHistoryList, enabled: isOpen, staleTime: 30_000 })` sehingga database tidak pernah diakses saat drawer tertutup.
- Di `src/components/layout/navbar.tsx`:
  - Letakkan tombol hamburger (`<button onClick={() => setDrawerOpen(true)}><Menu className="w-5 h-5" /></button>`) tepat di sebelah kiri logo VibeEverything.
  - Hapus semua link navigasi modul di navbar atas. Sisakan HANYA link **`Pricing`** (`/pricing`).
  - Rebrand title &amp; logo text menjadi "VibeEverything".
- Jalankan sync router: `pnpm generate-routes`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/components/layout/history-drawer.test.tsx src/components/layout/navbar-integration.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/ src/routes/__root.tsx
git commit -m "feat(layout): implement lazy hamburger history drawer and clean navbar"
```

---

### Task 3: Migrate Greenfield Chat to `/plan/new` and Build 4-Bento Hub on `/`

**Files:**

- Create: `src/routes/plan/new.tsx` (Tempat baru untuk HeroContent &amp; ChatInput)
- Create: `src/components/home/bento-hub.tsx` (Komponen 4 kartu Bento dari prototype)
- Modify: `src/routes/index.tsx` (Menggantikan Hero lama dengan BentoHub)
- Test: `src/components/home/bento-hub.test.tsx`

**Interfaces:**

- Consumes: Blueprint layout from `prototype-vibe-hub.html`, existing `HeroContent` and `ChatInput`.
- Produces: 4-card interactive bento navigation hub on `/` and full working PRD creation screen on `/plan/new`.

- [ ] **Step 1: Write test for Bento Hub component**

```typescript
// src/components/home/bento-hub.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BentoHub } from "./bento-hub";

describe("BentoHub", () => {
	it("renders 4 core bento cards with correct titles and links", () => {
		render(<BentoHub />);
		expect(screen.getByText("VibePlan")).toBeInTheDocument();
		expect(screen.getByText("VibeDesign")).toBeInTheDocument();
		expect(screen.getByText("VibeTemplate")).toBeInTheDocument();
		expect(screen.getByText("VibeBantuan")).toBeInTheDocument();

		const links = screen.getAllByRole("link");
		const hrefs = links.map((l) => l.getAttribute("href"));
		expect(hrefs).toContain("/plan");
		expect(hrefs).toContain("/design");
		expect(hrefs).toContain("/templates");
		expect(hrefs).toContain("/bantuan");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/components/home/bento-hub.test.tsx`
Expected: FAIL

- [ ] **Step 3: Migrate ChatInput to `/plan/new` and mount `BentoHub` to `index.tsx`**

1. Buat route `src/routes/plan/new.tsx` yang membungkus `HeroContent` (membawa seluruh fungsionalitas `ChatInput`, `TemplateGallery`, model picker, dan inisialisasi PRD baru tanpa ada state yang hilang).
2. Salin styling dan struktur 4 kartu bento dari `prototype-vibe-hub.html` ke `src/components/home/bento-hub.tsx`.
3. Ganti konten `src/routes/index.tsx` dengan `BentoHub`.
4. Jalankan: `pnpm generate-routes`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/components/home/bento-hub.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/routes/plan/new.tsx src/components/home/bento-hub.tsx src/routes/index.tsx src/routeTree.gen.ts
git commit -m "feat(home): migrate chat input to /plan/new and launch 4-bento hub"
```

---

### Task 4: VibePlan Routes (`/plan` and `/plan/codebase`)

**Files:**

- Create: `src/routes/plan/index.tsx`
- Create: `src/routes/plan/codebase.tsx`
- Test: `src/routes/plan/plan-routes.test.tsx`

**Interfaces:**

- Consumes: Codebase connect components (`ScreenConnect`), CLI sync instructions.
- Produces: Dedicated route for plan option selection (`/plan`) and Codebase Existing connect (`/plan/codebase`).

- [ ] **Step 1: Write test for `/plan` selection route**

```typescript
// src/routes/plan/plan-routes.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PlanLandingView } from "./index";

describe("PlanLandingView", () => {
	it("renders both Greenfield and Codebase Existing option cards", () => {
		render(<PlanLandingView />);
		expect(screen.getByText("Projek Baru (Greenfield)")).toBeInTheDocument();
		expect(screen.getByText("Codebase Existing")).toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/routes/plan/plan-routes.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement `/plan` and `/plan/codebase`**

- `src/routes/plan/index.tsx`: Dua kartu opsi mandiri (Card 1: *Projek Baru (Greenfield)* $\rightarrow$ `/plan/new`, Card 2: *Codebase Existing* $\rightarrow$ `/plan/codebase`).
- `src/routes/plan/codebase.tsx`: Layar koneksi codebase dengan instruksi CLI `vibeeverything codebase sync --project-id <id>` dan polling status sinkronisasi.
- Jalankan: `pnpm generate-routes`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/routes/plan/plan-routes.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/routes/plan/ src/routeTree.gen.ts
git commit -m "feat(plan): create dedicated greenfield and codebase sub-routes"
```

---

### Task 5: VibeDesign Opsi 1 — Porting &amp; Adaptasi Docrivo + Asset Proxy

> **MANDAT WAJIB AGENT:** Porting dan adaptasi kode dari Docrivo (`C:\Coding\Web Development\Next\docrivo`). Sesuaikan import `@/*`, Drizzle schema, session Better Auth, dan porting endpoint `/api/scrape/asset` agar iframe preview tidak terblokir CORS!

**Files &amp; Adaptasi:**

- Source Code to Port &amp; Adapt:
  - `C:\Coding\Web Development\Next\docrivo\src\lib\fetch-html.ts` $\rightarrow$ adaptasi ke `src/lib/fetch-html.ts`.
  - `C:\Coding\Web Development\Next\docrivo\src\lib\preview-html.ts` $\rightarrow$ adaptasi ke `src/lib/preview-html.ts`.
  - `C:\Coding\Web Development\Next\docrivo\src\routes\api\scrape.asset.ts` $\rightarrow$ porting ke `src/routes/api/scrape.asset.ts` (Proxy gambar &amp; CSS preview).
  - `C:\Coding\Web Development\Next\docrivo\src\lib\ai-provider.ts` $\rightarrow$ adaptasi prompt 12k char ke `src/lib/prompts-design-md.ts`.
  - `C:\Coding\Web Development\Next\docrivo\src\components\html-scraper.tsx` $\rightarrow$ adaptasi ke `src/components/design/html-scraper.tsx`.
  - `C:\Coding\Web Development\Next\docrivo\src\components\scrape-detail.tsx` $\rightarrow$ adaptasi ke `src/components/design/scrape-detail.tsx`.
  - `C:\Coding\Web Development\Next\docrivo\src\queries\scrapes.ts` $\rightarrow$ adaptasi ke `src/lib/services/scrape-service.ts`.
- Destination Routes:
  - Modify: `src/db/schema.ts` (Tambahkan tabel `scrapes` dan `scrape_documents`)
  - Create: `src/routes/api/scrape.ts` (Server function penanganan scraping &amp; AI streaming)
  - Create: `src/routes/api/scrape.asset.ts` (Asset proxy handler)
  - Create: `src/routes/design/index.tsx` (Halaman landing 2 kartu: Opsi 1 Scrap vs Opsi 2 Studio)
  - Create: `src/routes/design/scrap.tsx` (Form URL input &amp; daftar riwayat scrap)
  - Create: `src/routes/design/scrap.$id.tsx` (Detail 2 file: preview index.html 1440px desktop + tab design.md + tombol copy &amp; download ZIP)
- Test: `src/lib/fetch-html.test.ts`
- Test: `src/components/design/scrape-detail.test.tsx`

- [ ] **Step 1: Write test for adapted HTML scraper and cleaner**

```typescript
// src/lib/fetch-html.test.ts
import { describe, expect, it } from "vitest";
import { cleanPreviewHtml } from "./fetch-html";

describe("cleanPreviewHtml from Docrivo adaptation", () => {
	it("strips scripts and fixes relative links to absolute URLs", () => {
		const raw = `<html><head><script>evil()</script><link rel="stylesheet" href="/style.css"></head><body><img src="/logo.png"></body></html>`;
		const cleaned = cleanPreviewHtml(raw, "https://example.com");
		expect(cleaned).not.toContain("<script>");
		expect(cleaned).toContain('href="https://example.com/style.css"');
		expect(cleaned).toContain('src="https://example.com/logo.png"');
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/lib/fetch-html.test.ts`
Expected: FAIL

- [ ] **Step 3: Port and adapt files from Docrivo and install Asset Proxy**

1. Tambahkan skema tabel `scrapes` dan `scrape_documents` ke `src/db/schema.ts`.
2. Porting dan adaptasi `fetch-html.ts` dan `preview-html.ts` ke `src/lib/`.
3. Buat file `src/routes/api/scrape.asset.ts` dengan header CORS `Access-Control-Allow-Origin: *` dan stream asset proxy.
4. Adaptasi prompt 12.000+ karakter dari Docrivo ke `src/lib/prompts-design-md.ts`, hubungkan dengan AI streaming orchestrator VibeEverything.
5. Adaptasi komponen `html-scraper.tsx` dan `scrape-detail.tsx` ke `src/components/design/`.
6. Implementasikan route `src/routes/design/scrap.$id.tsx`:
   - Menampilkan 2 file langsung: Tab 1 `index.html` (preview iframe desktop 1440px dengan scaling), Tab 2 `design.md` (markdown code view).
   - Tombol aksi: "Salin DESIGN.md", "Salin HTML", "Download ZIP (2 Files)" menggunakan `jszip`.
7. Jalankan: `pnpm generate-routes`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/lib/fetch-html.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/db/schema.ts src/lib/ src/components/design/ src/routes/design/ src/routes/api/scrape.asset.ts src/routeTree.gen.ts
git commit -m "feat(design): port and adapt Docrivo HTML scrap with asset proxy and 2-file generator"
```

---

### Task 6: VibeDesign Opsi 2 — Adaptasi OpenDesign (Prompt UI Studio + HTML Cleaner)

> **MANDAT WAJIB AGENT:** Pelajari repo OpenDesign (`https://github.com/nexu-io/open-design`). Wajib gunakan helper pembersih markdown `extractCleanHtml` agar iframe me-render web hidup, bukan teks backticks markdown!

**Files &amp; Adaptasi:**

- Reference Repository: `https://github.com/nexu-io/open-design`
- Create: `src/lib/clean-html.ts` (Helper ekstraksi HTML murni dari balasan LLM)
- Create: `src/lib/prompts-ui-studio.ts` (Diadaptasi dari system prompt UI generation OpenDesign: standalone HTML, Tailwind CDN, Lucide icons, responsive layout)
- Create: `src/components/design/studio-canvas.tsx` (Diadaptasi dari arsitektur sandboxed iframe runtime OpenDesign)
- Create: `src/routes/api/studio/generate.ts` (Endpoint streaming kode UI)
- Create: `src/routes/design/studio.tsx` (Layar input prompt &amp; sesi baru)
- Create: `src/routes/design/studio.$id.tsx` (Layar canvas interaktif dengan viewport switch 1440px/768px/375px, code inspection panel, dan floating chat input)
- Test: `src/lib/clean-html.test.ts`
- Test: `src/lib/prompts-ui-studio.test.ts`

- [ ] **Step 1: Write test for HTML cleaner and prompt builder**

```typescript
// src/lib/clean-html.test.ts
import { describe, expect, it } from "vitest";
import { extractCleanHtml } from "./clean-html";

describe("extractCleanHtml", () => {
	it("extracts pure HTML from markdown codeblock fences", () => {
		const raw = "```html\n<!DOCTYPE html>[[ORCA_RICH_MD:654fe4ac7aa8f9cb68695896cd07179c:inline-html:%3Chtml%3E]][[ORCA_RICH_MD:654fe4ac7aa8f9cb68695896cd07179c:inline-html:%3Cbody%3E]][[ORCA_RICH_MD:654fe4ac7aa8f9cb68695896cd07179c:inline-html:%3Ch1%3E]]Hello[[ORCA_RICH_MD:654fe4ac7aa8f9cb68695896cd07179c:inline-html:%3C%2Fh1%3E]][[ORCA_RICH_MD:654fe4ac7aa8f9cb68695896cd07179c:inline-html:%3C%2Fbody%3E]][[ORCA_RICH_MD:654fe4ac7aa8f9cb68695896cd07179c:inline-html:%3C%2Fhtml%3E]]\n```";
		const cleaned = extractCleanHtml(raw);
		expect(cleaned).toBe("<!DOCTYPE html><html><body><h1>Hello</h1></body></html>");
	});

	it("returns raw HTML directly if no fences present", () => {
		const raw = "<!DOCTYPE html><html><body><h1>Hello</h1></body></html>";
		const cleaned = extractCleanHtml(raw);
		expect(cleaned).toBe(raw);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/lib/clean-html.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement clean-html helper, prompts, canvas, and studio routes**

1. Buat `src/lib/clean-html.ts` dengan regex parser ````(?:html)?\s*([\s\S]*?)\s*````.
2. Implementasikan `src/lib/prompts-ui-studio.ts` berdasarkan pola prompt OpenDesign (Tailwind CDN, Google fonts, lucide icons).
3. Implementasikan `src/components/design/studio-canvas.tsx`:
   - Sandboxed iframe `<iframe srcdoc={extractCleanHtml(htmlCode)} sandbox="allow-scripts" />`.
   - Selector lebar viewport: Desktop (`1440px`), Tablet (`768px`), Mobile (`375px`).
   - Panel toggle antara `Canvas Preview` dan `Inspect HTML Code` dengan tombol copy to clipboard.
4. Buat route `src/routes/design/studio.tsx` dan `src/routes/design/studio.$id.tsx`.
5. Jalankan: `pnpm generate-routes`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/lib/clean-html.test.ts src/lib/prompts-ui-studio.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/clean-html.ts src/lib/prompts-ui-studio.ts src/components/design/studio-canvas.tsx src/routes/design/studio.tsx src/routes/design/studio.$id.tsx src/routeTree.gen.ts
git commit -m "feat(design): implement Prompt UI Studio canvas and HTML fence cleaner"
```

---

### Task 7: VibeTemplate Catalog (`/templates`) &amp; VibeBantuan (`/bantuan`)

**Files:**

- Modify: `src/lib/template-gallery.ts` (Perluas ke 3 kategori: Planning, Design, Boilerplate Projects)
- Create: `src/routes/templates.tsx` (Katalog interaktif dengan filter tab kategori dan tombol aksi langsung)
- Create: `src/routes/bantuan.tsx` (Halaman support, FAQ, dan form feedback bawaan yang sync ke admin)
- Test: `src/lib/template-gallery.test.ts`

- [ ] **Step 1: Write test for 3-category template catalog**

```typescript
// src/lib/template-gallery.test.ts
import { describe, expect, it } from "vitest";
import { VIBE_TEMPLATES } from "./template-gallery";

describe("VIBE_TEMPLATES", () => {
	it("contains planning, design, and boilerplate categories with real templates", () => {
		const categories = new Set(VIBE_TEMPLATES.map((t) => t.category));
		expect(categories).toContain("planning");
		expect(categories).toContain("design");
		expect(categories).toContain("boilerplate");

		const simrs = VIBE_TEMPLATES.find((t) => t.id === "simrs-hospital");
		expect(simrs).toBeDefined();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/lib/template-gallery.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement template catalog and bantuan support route**

- Di `src/lib/template-gallery.ts`: Tambahkan template realistis untuk SIMRS Hospital App, B2B Multi-tenant SaaS, E-Commerce, Dark Mode Analytics, dll.
- Di `src/routes/templates.tsx`: Tab kategori (`Semua`, `Planning`, `Design`, `Boilerplate`) dengan tombol: "Buka di VibePlan", "Buka di VibeDesign", "Salin Prompt".
- Di `src/routes/bantuan.tsx`: Pasang `FeedbackForm` dari `src/components/settings/feedback-form.tsx` dan FAQ produk.
- Jalankan: `pnpm generate-routes`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/lib/template-gallery.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/template-gallery.ts src/routes/templates.tsx src/routes/bantuan.tsx src/routeTree.gen.ts
git commit -m "feat(templates): implement 3-category prompt directory and bantuan support route"
```

---

### Task 8: Migration &amp; Verification Suite

**Files:**

- Drizzle migrations for new tables (`scrapes`, `scrape_documents`, `studio_projects`, `studio_revisions`)

- [ ] **Step 1: Generate &amp; push database migrations**

Run: `pnpm db:generate` dan `pnpm db:push`

- [ ] **Step 2: Full Route Tree regeneration**

Run: `pnpm generate-routes`

- [ ] **Step 3: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 4: Linter**

Run: `pnpm check`
Expected: 0 errors.

- [ ] **Step 5: Unit &amp; Integration tests**

Run: `pnpm test`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add drizzle/
git commit -m "chore(db): add migrations for scrapes and studio tables"
```

