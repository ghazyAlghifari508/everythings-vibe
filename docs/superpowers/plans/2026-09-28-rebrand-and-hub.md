# hase 1: Rebrand &amp; Navigation Hub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebrand the application and CLI from PRDFY to VibeEverything, update the top navigation to feature a hamburger-triggered slide-out History Drawer with a single `Pricing` link, migrate the existing Greenfield chat flow to `/plan/new`, and launch the 4-Bento Navigation Hub on the homepage (`/`).

**Architecture:** TanStack Start full-stack application. Global branding is unified across the web shell and terminal CLI. The homepage is transformed into a lightweight, high-converting Bento grid referencing `prototype-vibe-hub.html`, while the existing project creation engine is preserved in a dedicated `/plan/new` route. History data is fetched on-demand (lazy) when the drawer opens to prevent unnecessary database queries on page navigation.

**Tech Stack:** TanStack Start, TanStack Router, React 19, TypeScript, Tailwind CSS, Lucide React, Commander (CLI), Vitest.

**Spec:** [`docs/superpowers/specs/2026-09-28-vibeeverything-architecture-spec.md`](file:///C:/Coding/Web%20Development/Tanstack-start/prdfy/docs/superpowers/specs/2026-09-28-vibeeverything-architecture-spec.md)  
**Visual UI Blueprint:** [`prototype-vibe-hub.html`](file:///C:/Coding/Web%20Development/Tanstack-start/prdfy/prototype-vibe-hub.html)  

---

## Global Engineering Constraints

1. **Route Tree Synchronization:** Every time a route file in `src/routes/` is created or modified, execute `pnpm generate-routes` so `src/routeTree.gen.ts` remains strictly in sync.
2. **Visual Consistency:** Spacing, 1px hairline borders (`border-white/10` / `border-black/10`), Lucide icons, and drawer transition animations must match [`prototype-vibe-hub.html`](file:///C:/Coding/Web%20Development/Tanstack-start/prdfy/prototype-vibe-hub.html).
3. **Lazy History Fetching:** The slide-out History Drawer in the root navbar must only fetch data when `isOpen === true` using TanStack Query (`enabled: isOpen`).
4. **Zero Type Bypasses:** No `as any`, `as never`, `@ts-ignore`, or `@ts-expect-error`.
5. **No Broken Workflows:** Greenfield project creation and existing codebase sync must remain 100% operational during and after migration.

---

### Task 1: Rebrand CLI in `packages/cli`, Synchronize Web App Commands, and Setup `pnpm test`

**Files:**

- Modify: `package.json`
- Modify: `packages/cli/package.json`
- Modify: `packages/cli/src/index.ts`
- Modify: `packages/cli/src/lib/version.ts`
- Modify: `packages/cli/README.md`
- Modify: `src/lib/codebase-sync.ts:544-572`
- Modify: `src/lib/codebase-sync.test.ts`
- Test: `packages/cli/src/index.test.ts`

**Interfaces:**

- Consumes: Commander CLI primitives and codebase sync command builders.
- Produces: `@ghazynabiel/vibeeverything` npm package with binary executable `vibeeverything` (and `prdfy` alias), `"test": "vitest run"` script in root `package.json`, and updated sync command strings in the web application.

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

- [ ] **Step 3: Update `package.json`, `packages/cli`, and `src/lib/codebase-sync.ts`**

1. In root `package.json`:
 Add `"test": "vitest run"` to the `"scripts"` block:
   ```json
    "scripts": {
      "test": "vitest run",
      "dev": "node --dns-result-order=ipv4first node_modules/vite/bin/vite.js dev --port 3000",
      ...
    }
   ```
2. In `packages/cli/package.json`:
   ```json
    {
      "name": "@ghazynabiel/vibeeverything",
      "version": "3.0.0",
      "description": "CLI tool for VibeEverything — manage projects, codebases, and tasks from terminal",
      "type": "module",
      "main": "dist/index.js",
      "bin": {
        "vibeeverything": "dist/index.js",
        "vibe": "dist/index.js",
        "prdfy": "dist/index.js"
      },
      "files": ["dist"],
      "scripts": {
        "build": "tsc",
        "dev": "tsc --watch",
        "prepublishOnly": "npm run build"
      },
      "dependencies": {
        "commander": "^12.0.0",
        "chalk": "^5.3.0"
      },
      "devDependencies": {
        "typescript": "^5.0.0",
        "@types/node": "^20.0.0"
      }
    }
   ```
3. In `packages/cli/src/index.ts`:
 Update program name and description:
   ```typescript
    program
      .name("vibeeverything")
      .description("CLI tool for VibeEverything — manage projects and tasks from terminal")
      .version(CLI_VERSION);
   ```
4. In `src/lib/codebase-sync.ts`:
 Update command template functions:
   - Line 544: `return \`vibeeverything codebase sync --project-id ${projectId} --sync-token <token>\`;\`
   - Line 572: `const command = \`vibeeverything codebase sync --project-id ${payload.projectId} --sync-token ${payload.syncToken}\`;\`
5. In `src/lib/codebase-sync.test.ts`:
 Update assertion strings expecting `vibeeverything codebase sync`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test packages/cli/src/index.test.ts src/lib/codebase-sync.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add package.json packages/cli/ src/lib/codebase-sync.ts src/lib/codebase-sync.test.ts
git commit -m "feat(cli): rebrand CLI to vibeeverything, update sync strings, and add test script"
```

---

### Task 2: Layout Shell &amp; Top Navigation (Rebrand Navbar &amp; Single `Pricing` Link)

**Files:**

- Modify: `src/routes/__root.tsx`
- Modify: `src/components/layout/navbar.tsx`
- Test: `src/components/layout/navbar-integration.test.tsx`

**Interfaces:**

- Consumes: Better Auth session, theme provider, and brand tokens.
- Produces: Rebranded `<Navbar />` with hamburger icon button on the left of the logo, brand name "VibeEverything", and only `Pricing` in the top navigation.

- [ ] **Step 1: Write test for updated Navbar layout**

```typescript
// src/components/layout/navbar-integration.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Navbar } from "./navbar";

describe("Navbar Rebranding & Layout", () => {
	it("renders VibeEverything logo and only Pricing navlink", () => {
		render(<Navbar onOpenDrawer={() => {}} />);
		expect(screen.getByText("VibeEverything")).toBeInTheDocument();
		expect(screen.getByRole("link", { name: /Pricing/i })).toBeInTheDocument();
		expect(screen.queryByRole("link", { name: /VibePlan/i })).not.toBeInTheDocument();
		expect(screen.queryByRole("link", { name: /VibeDesign/i })).not.toBeInTheDocument();
	});

	it("renders hamburger menu button for history drawer", () => {
		render(<Navbar onOpenDrawer={() => {}} />);
		const hamburger = screen.getByRole("button", { name: /menu|riwayat|drawer/i });
		expect(hamburger).toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/components/layout/navbar-integration.test.tsx`
Expected: FAIL

- [ ] **Step 3: Update `src/routes/__root.tsx` and `src/components/layout/navbar.tsx`**

1. In `src/routes/__root.tsx`:
 Update document title and meta description:
   ```typescript
    title: "VibeEverything - All-in-One AI Vibe-Coding Workspace",
    description: "Workspace all-in-one untuk planning, visual design context, template prompt, dan bantuan coding AI."
   ```
2. In `src/components/layout/navbar.tsx`:
   - Add hamburger trigger button directly to the left of the logo:
   - Logo text: "VibeEverything" (linking to `/`).
   - Clean navigation links: Keep ONLY `Pricing` (`/pricing`). Remove old links to avoid duplicate routes.
   - Maintain right side actions: Credit badge with topup trigger, dark/light toggle, and user avatar.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/components/layout/navbar-integration.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/routes/__root.tsx src/components/layout/navbar.tsx src/components/layout/navbar-integration.test.tsx
git commit -m "feat(layout): rebrand navbar to VibeEverything with hamburger menu trigger"
```

---

### Task 3: Slide-out History Drawer with Lazy Fetching

**Files:**

- Create: `src/components/layout/history-drawer.tsx`
- Modify: `src/components/layout/app-layout.tsx`
- Test: `src/components/layout/history-drawer.test.tsx`

**Interfaces:**

- Consumes: Project history loader (`/history`), TanStack Query, and layout blueprint from `prototype-vibe-hub.html`.
- Produces: Slide-out `<HistoryDrawer isOpen={boolean} onClose={() => void} />` that loads project and scrape items on-demand.

- [ ] **Step 1: Write test for History Drawer filtering and lazy query behavior**

```typescript
// src/components/layout/history-drawer.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HistoryDrawer } from "./history-drawer";

describe("HistoryDrawer", () => {
	const mockItems = [
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
	];

	it("renders search bar, category tabs, and items when open", () => {
		const onClose = vi.fn();
		render(
			<HistoryDrawer
				isOpen={true}
				onClose={onClose}
				items={mockItems}
				isLoading={false}
			/>
		);

		expect(screen.getByPlaceholderText(/Cari riwayat/i)).toBeInTheDocument();
		expect(screen.getByText("Semua")).toBeInTheDocument();
		expect(screen.getByText("VibePlan")).toBeInTheDocument();
		expect(screen.getByText("Scrap")).toBeInTheDocument();
		expect(screen.getByText("E-Commerce SIMRS")).toBeInTheDocument();
		expect(screen.getByText("Airbnb Landing Scrap")).toBeInTheDocument();
	});

	it("filters list based on search query", () => {
		render(
			<HistoryDrawer
				isOpen={true}
				onClose={() => {}}
				items={mockItems}
				isLoading={false}
			/>
		);

		const searchInput = screen.getByPlaceholderText(/Cari riwayat/i);
		fireEvent.change(searchInput, { target: { value: "SIMRS" } });

		expect(screen.getByText("E-Commerce SIMRS")).toBeInTheDocument();
		expect(screen.queryByText("Airbnb Landing Scrap")).not.toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/components/layout/history-drawer.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement `HistoryDrawer` and wire into `AppLayout`**

1. In `src/components/layout/history-drawer.tsx`:
   - Follow `prototype-vibe-hub.html`: Sheet container sliding from left with backdrop overlay.
   - Header: "Riwayat Projek" with item count and close button (`X`).
   - Search input for fast client-side query matching.
   - Category filter pills: `Semua`, `VibePlan`, `VibeDesign`, `Scrap`.
   - List rendering with icon, title, relative time, status badge, and click action to the target route.
   - Footer link to `/history` ("Lihat Semua Riwayat").
   - Query integration: Use `useQuery({ queryKey: ["drawer-history"], queryFn: fetchHistoryItems, enabled: isOpen, staleTime: 30_000 })`.
2. In `src/components/layout/app-layout.tsx`:
   - Manage `isDrawerOpen` state and pass trigger to `Navbar` and `HistoryDrawer`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/components/layout/history-drawer.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/history-drawer.tsx src/components/layout/history-drawer.test.tsx src/components/layout/app-layout.tsx
git commit -m "feat(layout): implement slide-out history drawer with lazy fetching"
```

---

### Task 4: Migrate Greenfield Chat to `/plan/new` and Build 4-Bento Hub on `/`

**Files:**

- Create: `src/routes/plan/new.tsx`
- Create: `src/components/home/bento-hub.tsx`
- Modify: `src/routes/index.tsx`
- Test: `src/components/home/bento-hub.test.tsx`

**Interfaces:**

- Consumes: Blueprint layout from `prototype-vibe-hub.html`, existing `HeroContent` and `ChatInput`.
- Produces: 4-card interactive bento navigation hub on `/` and full working PRD creation screen on `/plan/new`.

- [ ] **Step 1: Write test for Bento Hub navigation cards**

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

Run: `pnpm test src/components/home/bento-hub.test.tsx`
Expected: FAIL

- [ ] **Step 3: Create `/plan/new.tsx`, `bento-hub.tsx`, and update `src/routes/index.tsx`**

1. Create `src/routes/plan/new.tsx`:
   ```tsx
    import { createFileRoute } from "@tanstack/react-router";
    import { GridBackground, HeroContent } from "@/components/layout";
   
    export const Route = createFileRoute("/plan/new")({ component: PlanNewPage });
   
    function PlanNewPage() {
      return (
   ```

       <main className="flex flex-col">

```
     [[ORCA_RICH_MD:ad447efa485087ab7157c50cd8046060:inline-html:%3Csection%0A%20%20%20%20%20%20%20%20%20%20%20className%3D%22relative%20flex%20min-h-%5Bcalc(100vh-3.5rem)%5D%20flex-col%20items-center%20justify-center%20overflow-hidden%20pb-32%20md%3Apb-40%22%0A%20%20%20%20%20%20%20%20%20%20%20style%3D%7B%7B%20background%3A%20%22var(--bg-page)%22%20%7D%7D%0A%20%20%20%20%20%20%20%20%20%3E]]
```

           <GridBackground />

           <HeroContent />

         </section>

       </main>

```
 );
```

   }

---

### Task 5: Route Tree Sync &amp; Full Verification for Phase 1

**Files:**

- Modify: `src/routeTree.gen.ts` (regenerated)

- [ ] **Step 1: Regenerate route tree**

Run: `pnpm generate-routes`
Expected: Clean generation with `/plan/new` registered.

- [ ] **Step 2: Run full TypeScript check**

Run: `pnpm exec tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Run linter and formatting check**

Run: `pnpm check`
Expected: 0 errors.

- [ ] **Step 4: Run all unit &amp; integration tests**

Run: `pnpm test`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/routeTree.gen.ts
git commit -m "chore: synchronize route tree and verify phase 1 rebrand"
```

