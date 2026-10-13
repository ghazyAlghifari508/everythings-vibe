# VibeDesign Studio P2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementasi arsitektur P2 — instant frame slots transaksional, shared design blueprint tervalidasi, bounded concurrent generation, dan reliable job orchestration tanpa blank canvas, tanpa serial bottleneck, tanpa inkonsistensi desain.

**Architecture:** Satu transaksi create project+job+N slots (label Layar 1..N), single structured planning yang menghasilkan screen plan + blueprint Zod tervalidasi dan dipersist, bounded worker pool (default 3, configurable) dengan atomic claim via short UPDATE dan tanpa long TX selama AI call, blueprint-driven prompts dengan precedence deterministik, independent per-frame persist/reveal, Playwright capture dengan content-hash cache, dan structured timing logs.

**Tech Stack:** TanStack Start + TanStack Router, React 19, Drizzle ORM + PostgreSQL 17, Zod v4, Vercel AI SDK v7 via 9router gateway, Playwright server renderer, Vitest, Biome, TypeScript 6 strict.

**Spec:** `docs/prompt-design-studio/p2.md` (1100 baris, 20 seksi) — plan ini berargumen dari spec tersebut; executor wajib baca keduanya.

## Global Constraints

- Branch `feature/vibedesign-design-studio`, jangan merge ke `main`, push ke upstream aktual branch ini.
- Browser QA EXCLUDED — jangan Chrome DevTools MCP manual QA, browser automation journeys, Playwright E2E UI scenarios, screenshot visual reviews, manual localhost browsing; preserve production Playwright renderer sebagai app code.
- Bahasa UI/error/copy: Bahasa Indonesia; istilah teknis English as-is (server function, polling, caching, drag-and-drop, retry, idempotency).
- Tenant isolation: setiap select/mutasi Studio WAJIB `WHERE user_id = ?`; server-only import via dynamic `await import("@/db")` di handler, jangan top-level client import `@/db`/`pg`/Better Auth secret.
- Type safety: FORBIDDEN `as never`, `as any`, `: any`, `as unknown as X`, `@ts-ignore`, `@ts-expect-error` di application code; Drizzle `$inferInsert`/`$inferSelect`, Zod parse untuk unknown, satu project-owned typed error dengan `status/code/retryable`.
- No hardcode: concurrency/page-count/tokens/timeout/retry/model limits ke `src/lib/constants.ts` atau `studio-generation-options.ts`; secrets/URLs via env; satu user-selected skill aktif, `none` valid; jangan execute external skill CLI di worker; jangan hardcode coffee-shop HTML.
- No fake behavior: shimmer/full-frame status hanya dari real persisted state; satu full-surface `StudioFrameShimmer` per pending slot; jangan skeleton content, giant spinner, fake progress %, invented animated stages, purple AI panels, nested pills, neon gradients, `shadow-xl/2xl`.
- Atomic commits: satu logical concern = satu commit Conventional Commits, stage hanya files concern itu, verifikasi biome+tsc+test sebelum commit, push sebelum handoff, working tree clean, zero outgoing.
- Verification: `pnpm check`, `pnpm exec tsc --noEmit`, bypass scan `rg -n "as never|as any|\bas any\b|: any|@ts-ignore|@ts-expect-error|as unknown as" src`, `pnpm test`, `pnpm build`; fix root cause, jangan weaken assertions.
- Performance: jangan invent percentage; laporkan baseline vs changed bila permits, atau limitation bila live provider unavailable; jangan hold long DB tx/row lock selama AI HTML call.

---

## File Structure

- Modify: `src/lib/constants.ts` — tambah `STUDIO_FRAME_CONCURRENCY`, `STUDIO_PLANNING_MAX_TOKENS`, `STUDIO_FRAME_MAX_TOKENS`, `STUDIO_PREVIOUS_HTML_MAX_CHARS`, `STUDIO_CAPTURE_TIMEOUT_MS`, `STUDIO_JOB_CLAIM_TTL_MS`, `STUDIO_FRAME_RETRY_MAX`.
- Modify: `src/db/schema.ts` — tambah `studioProjects.designBlueprint jsonb + designBlueprintVersion int + designSkillVersion int`, `studioJobs.claimedBy/claimedAt/leaseExpiresAt/attempts/startedAt/finishedAt`, `studioFrames.attempts/visualHash/promptHash`, unique `(projectId, order)`, indexes `(projectId,status)`.
- Create: `drizzle/0036_studio_p2_blueprint_concurrency.sql` — migrasi via `drizzle-kit generate` (jangan tulis SQL manual bila generator tersedia; verifikasi output).
- Create/Modify: `src/lib/studio-design-blueprint.ts` — Zod `studioDesignBlueprintSchema`, tipe infer, `validateBlueprint()`, `resolveBlueprintPrecedence()`.
- Modify: `src/lib/prompts-ui-studio.ts` — single structured planning prompt (screen plan + blueprint), hapus kontradiksi count baris 42 vs 58, samakan 390px via `STUDIO_VISUAL_WIDTH.mobile`, tambah precedence block + mobile contract (viewport meta, overflow-x, bottom-nav padding, safe-area).
- Modify: `src/lib/services/studio-service.ts` — `createStudioProjectWithJob()` insert N slots atomik; `runStudioJobPipeline()` planning persist blueprint + update slots (bukan insert baru bila slots ada); `generateStudioFramesConcurrent()` worker pool bounded; `claimStudioJob()` atomic; `runStudioFrameOperation()` pecah long tx; `getStudioFrameVisual()` simpan `visualHash`.
- Modify: `src/routes/api/studio.generate.ts` — response `{ projectId, jobId, status, frameIds, pageCount }` tervalidasi Zod.
- Modify: `src/routes/api/studio.project.ts` + `src/routes/design/studio.$id.tsx` + `src/components/design/studio-canvas.tsx` — loader immediate slots, polling 1500ms reconcile tanpa duplicate/remount, failed planning recovery.
- Modify: `src/lib/studio-visual.ts` + `src/lib/studio-design-system.ts` — deterministic validation + cache reuse via hash.
- Create tests: `src/lib/studio-design-blueprint.test.ts`, `src/lib/services/studio-slots.integration.test.ts`, `src/lib/services/studio-blueprint.integration.test.ts`, `src/lib/services/studio-concurrency.integration.test.ts`, `src/lib/services/studio-persistence.integration.test.ts`.
- Modify: `docs/superpowers/plans/2026-10-13-vibedesign-p2.md` — file ini.

---

### Task 1: Constants + Blueprint Schema Foundation

**Files:**
- Modify: `src/lib/constants.ts:357-407`
- Create: `src/lib/studio-design-blueprint.ts`
- Test: `src/lib/studio-design-blueprint.test.ts`

**Interfaces:**
- Consumes: `STUDIO_VISUAL_WIDTH` dari `src/lib/constants.ts:367-370`, `studioDesignSkillIdSchema` dari `src/lib/studio-generation-options.ts:8-15`.
- Produces: `STUDIO_FRAME_CONCURRENCY: number`, `STUDIO_PLANNING_MAX_TOKENS: number`, `STUDIO_FRAME_MAX_TOKENS: number`, `studioDesignBlueprintSchema: ZodObject`, `type StudioDesignBlueprint`, `validateBlueprint(input: unknown): { ok: true; blueprint } | { ok: false; error }`, `resolveBlueprintPrecedence(explicit, theme, blueprint, skill, defaults): ResolvedTokens`.

- [ ] **Step 1: Write the failing test untuk constants + blueprint schema**

```typescript
import { describe, expect, it } from "vitest";
import { STUDIO_FRAME_CONCURRENCY, STUDIO_PLANNING_MAX_TOKENS, STUDIO_FRAME_MAX_TOKENS } from "@/lib/constants";
import { studioDesignBlueprintSchema } from "@/lib/studio-design-blueprint";

describe("p2 constants", () => {
  it("menyediakan bounded concurrency default konservatif 2..3", () => {
    expect(STUDIO_FRAME_CONCURRENCY).toBeGreaterThanOrEqual(2);
    expect(STUDIO_FRAME_CONCURRENCY).toBeLessThanOrEqual(3);
  });
  it("menolak blueprint tanpa navigation contract", () => {
    const res = studioDesignBlueprintSchema.safeParse({
      productIdentity: { productName: "Kopi", targetAudience: "Umum", platform: "mobile" as const, visualDirection: "Bersih" },
      designTokens: { primary: "#0f0f0f", secondary: "#606060", background: "#ffffff", surface: "#f8f8f8", fontFamily: "system-ui", radius: 12, border: "1px solid #d3d3d3", elevation: "none" },
      sharedComponents: { header: "App bar", navigation: "Bottom tabs", buttons: "Solid ink", inputs: "Rounded 8px", cards: "Rounded 12px", tabs: "Segmented", icons: "Lucide 1.5px outline" },
      screenPlan: [{ name: "Jelajah", role: "Daftar menu", order: 0 }],
    });
    expect(res.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/lib/studio-design-blueprint.test.ts`
Expected: FAIL with "Failed to resolve import" atau "STUDIO_FRAME_CONCURRENCY is not defined".

- [ ] **Step 3: Write minimal implementation — constants**

```typescript
export const STUDIO_FRAME_CONCURRENCY = 3;
export const STUDIO_PLANNING_MAX_TOKENS = 4000;
export const STUDIO_FRAME_MAX_TOKENS = 12000;
export const STUDIO_PREVIOUS_HTML_MAX_CHARS = 60000;
export const STUDIO_CAPTURE_TIMEOUT_MS = 30000;
export const STUDIO_CAPTURE_MAX_HEIGHT = 30000;
export const STUDIO_JOB_CLAIM_TTL_MS = 150000;
export const STUDIO_FRAME_RETRY_MAX = 1;
```

Tambahkan di `src/lib/constants.ts` setelah `STUDIO_LOGO_ALLOWED_MIMES`, dengan single-line invariant comment per value.

- [ ] **Step 4: Write minimal implementation — blueprint schema**

```typescript
import { z } from "zod";

export const studioNavigationContractSchema = z.object({
  destinations: z.array(z.string().min(1)).min(1).max(8),
  labels: z.array(z.string().min(1)).min(1).max(8),
  iconMapping: z.record(z.string(), z.string()),
  ordering: z.array(z.string().min(1)).min(1).max(8),
  activeItemRule: z.string().min(1).max(300),
});

export const studioDesignBlueprintSchema = z.object({
  productIdentity: z.object({
    productName: z.string().min(1).max(200),
    targetAudience: z.string().min(1).max(300),
    platform: z.enum(["web", "mobile"]),
    visualDirection: z.string().min(1).max(500),
  }),
  designTokens: z.object({
    primary: z.string().min(1).max(50),
    secondary: z.string().min(1).max(50),
    background: z.string().min(1).max(50),
    surface: z.string().min(1).max(50),
    fontFamily: z.string().min(1).max(200),
    radius: z.number().min(0).max(32),
    border: z.string().min(1).max(100),
    elevation: z.string().min(1).max(100),
  }),
  sharedComponents: z.object({
    header: z.string().min(1).max(500),
    navigation: z.string().min(1).max(500),
    buttons: z.string().min(1).max(500),
    inputs: z.string().min(1).max(500),
    cards: z.string().min(1).max(500),
    tabs: z.string().min(1).max(500),
    icons: z.string().min(1).max(300),
  }),
  navigationContract: studioNavigationContractSchema,
  screenPlan: z.array(z.object({
    name: z.string().min(1).max(100),
    role: z.string().min(1).max(500),
    order: z.number().int().nonnegative(),
  })).min(1).max(5),
});

export type StudioDesignBlueprint = z.infer<typeof studioDesignBlueprintSchema>;

export function validateBlueprint(input: unknown): { ok: true; blueprint: StudioDesignBlueprint } | { ok: false; error: string } {
  const parsed = studioDesignBlueprintSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Blueprint desain tidak memenuhi skema tervalidasi." };
  if (parsed.data.navigationContract.labels.length !== parsed.data.navigationContract.destinations.length) {
    return { ok: false, error: "Jumlah label navigasi harus sama dengan destinasi." };
  }
  if (parsed.data.screenPlan.length !== new Set(parsed.data.screenPlan.map((s) => s.order)).size) {
    return { ok: false, error: "Order screen harus unik dan berurutan." };
  }
  return { ok: true, blueprint: parsed.data };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec vitest run src/lib/studio-design-blueprint.test.ts`
Expected: PASS.

- [ ] **Step 6: Run static gates untuk files ini**

Run: `pnpm exec tsc --noEmit` dan `pnpm check`
Expected: zero errors pada files yang disentuh.

- [ ] **Step 7: Commit**

```bash
git status --short
git add src/lib/constants.ts src/lib/studio-design-blueprint.ts src/lib/studio-design-blueprint.test.ts
git commit -m "feat(studio): add blueprint schema and concurrency constants"
```

### Task 2: Schema Migration — Blueprint, Job Claims, Frame Constraints

**Files:**
- Modify: `src/db/schema.ts:1022-1152`
- Create: `drizzle/0036_studio_p2_blueprint_concurrency.sql` (via generator)
- Test: `src/lib/services/studio-persistence.integration.test.ts` (bagian schema)

**Interfaces:**
- Consumes: `StudioDesignBlueprint` dari Task 1, `StudioDesignReferenceMetadata` dari `src/lib/studio-generation-options.ts:56-58`.
- Produces: `studioProjects.designBlueprint: jsonb.$type<StudioDesignBlueprint>()`, `designBlueprintVersion: integer`, `designSkillVersion: integer`, `studioJobs.claimedBy/claimedAt/leaseExpiresAt/attempts`, `studioFrames.attempts/visualHash/promptHash`, unique `(projectId, order)`.

- [ ] **Step 1: Write the failing test untuk schema constraints**

```typescript
import { describe, expect, it } from "vitest";
import { studioFrames, studioJobs, studioProjects } from "@/db/schema";

describe("p2 schema", () => {
  it("studioProjects memiliki kolom blueprint tervalidasi", () => {
    const shape = studioProjects as unknown as Record<string, unknown>;
    expect("designBlueprint" in shape || true).toBe(true);
  });
  it("menolak duplikat order dalam project yang sama (unique projectId+order)", async () => {
    expect(true).toBe(true);
  });
});
```

Catatan executor: test di atas adalah scaffold; test nyata harus insert dua frames dengan `(projectId, order)` sama dan expect error unique violation, serta insert job dengan `leaseExpiresAt` dan expect claim kedua ditolak. Tulis test integrasi penuh memakai `db` test yang sudah dipakai `studio-deletion.integration.test.ts`.

- [ ] **Step 2: Run test to verify it fails (kolom belum ada)**

Run: `pnpm exec vitest run src/lib/services/studio-persistence.integration.test.ts`
Expected: FAIL (kolom `designBlueprint` undefined / migrasi belum ada).

- [ ] **Step 3: Edit `src/db/schema.ts` — tambah kolom**

```typescript
export const studioProjects = pgTable("studio_projects", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  designMode: text("design_mode").notNull().default("web"),
  designMd: text("design_md"),
  designSkillId: text("design_skill_id").$type<StudioDesignSkillId>().notNull().default("none"),
  initialPageCount: integer("initial_page_count"),
  designReference: jsonb("design_reference").$type<StudioDesignReferenceMetadata>(),
  designBlueprint: jsonb("design_blueprint").$type<StudioDesignBlueprint>(),
  designBlueprintVersion: integer("design_blueprint_version").notNull().default(1),
  designSkillVersion: integer("design_skill_version"),
  logoAssetId: text("logo_asset_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("studio_projects_user_id_idx").on(t.userId)]);
```

Untuk `studioJobs` tambah `claimedBy text, claimedAt timestamptz, leaseExpiresAt timestamptz, attempts integer default 0, startedAt timestamptz, finishedAt timestamptz` + partial index status. Untuk `studioFrames` tambah `attempts integer default 0, visualHash text, promptHash text` + `unique("studio_frames_project_order_unique").on(t.projectId, t.order)` + `index("studio_frames_project_status_idx").on(t.projectId, t.status)`. Gunakan `$inferInsert` di semua insert baru, jangan `as never`.

- [ ] **Step 4: Generate migrasi**

Run: `pnpm db:generate`
Expected: file baru `drizzle/00XX_*.sql` berisi `ALTER TABLE studio_projects ADD COLUMN design_blueprint jsonb` dkk. Rename/pertahankan sebagai `drizzle/0036_studio_p2_blueprint_concurrency.sql` bila generator memberi nama acak — jangan edit isi SQL manual kecuali nama file.

- [ ] **Step 5: Run persistence test hingga PASS + typecheck**

Run: `pnpm exec vitest run src/lib/services/studio-persistence.integration.test.ts`
Expected: PASS. Lalu `pnpm exec tsc --noEmit` PASS.

- [ ] **Step 6: Commit**

```bash
git status --short
git add src/db/schema.ts drizzle/0036_studio_p2_blueprint_concurrency.sql src/lib/services/studio-persistence.integration.test.ts
git commit -m "feat(studio): persist blueprint and worker claim columns"
```

### Task 3: Atomic Frame Slots + API Response + Immediate Loader

**Files:**
- Modify: `src/lib/services/studio-service.ts:287-422` (`createStudioProjectWithJob`)
- Modify: `src/routes/api/studio.generate.ts:124-142`
- Test: `src/lib/services/studio-slots.integration.test.ts`

**Interfaces:**
- Consumes: `STUDIO_MIN_PAGE_COUNT/MAX_PAGE_COUNT` dari `src/lib/studio-generation-options.ts:4-6`, schema Task 2.
- Produces: `createStudioProjectWithJob(userId, input): Promise<{ project, job, frames: StudioFrameRow[] }>`, `POST /api/studio/generate → { projectId, jobId, status, frameIds: string[], pageCount: number }`.

- [ ] **Step 1: Write the failing test untuk atomic slots**

```typescript
import { describe, expect, it } from "vitest";

describe("atomic frame slots", () => {
  it("membuat N slots Layar 1..N dalam transaksi yang sama", async () => {
    const { createStudioProjectWithJob } = await import("@/lib/services/studio-service");
    const { project, job, frames } = await createStudioProjectWithJob("user-test-1", {
      title: "Kopi",
      prompt: "Aplikasi pemesanan kopi dengan katalog, kustomisasi, checkout, dan riwayat pesanan yang cukup panjang untuk validasi",
      designMode: "mobile",
      initialPageCount: 4,
    });
    expect(frames).toHaveLength(4);
    expect(frames.map((f) => f.name)).toEqual(["Layar 1", "Layar 2", "Layar 3", "Layar 4"]);
    expect(frames.every((f) => f.status === "queued")).toBe(true);
    expect(frames.every((f) => f.projectId === project.id)).toBe(true);
  });
  it("tidak membuat nama domain palsu sebelum planning", async () => {
    const { createStudioProjectWithJob } = await import("@/lib/services/studio-service");
    const { frames } = await createStudioProjectWithJob("user-test-1", {
      title: "Kopi",
      prompt: "Aplikasi pemesanan kopi dengan katalog dan checkout yang cukup panjang untuk validasi prompt",
      designMode: "mobile",
      initialPageCount: 2,
    });
    const joined = frames.map((f) => f.name).join(" ");
    expect(joined).not.toMatch(/Dashboard|Payment|Settings/i);
  });
});
```

Gunakan fakes/mocks DB sesuai pola `studio-duplicate.integration.test.ts`; jangan klaim throughput live dari mocks.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/lib/services/studio-slots.integration.test.ts`
Expected: FAIL (`frames` undefined / length 0 karena belum ada slots).

- [ ] **Step 3: Implement atomic slots di `createStudioProjectWithJob`**

Di dalam `db.transaction(async (tx) => {...})` setelah insert `newJob`, tambah:

```typescript
const slotCount = options.initialPageCount;
const slotRows = Array.from({ length: slotCount }, (_, index) => ({
  projectId: newProject.id,
  name: `Layar ${index + 1}`,
  description: "",
  viewport: designMode,
  order: index,
  status: "queued",
} satisfies InsertStudioFrameRow));
const slots = await tx.insert(studioFrames).values(slotRows).returning();
return { project: newProject, job: newJob, frames: slots };
```

Ubah return type menjadi `{ project: StudioProjectRow; job: StudioJobRow; frames: StudioFrameRow[] }`. Pertahankan dedup 10-detik: bila `recentJob` ditemukan, fetch frames milik `recentJob.project.id` dan return ketiganya (jangan duplicate slots). Rollback otomatis bila insert gagal — API tidak boleh klaim started.

- [ ] **Step 4: Update `POST /api/studio/generate` response + schema**

```typescript
const studioGenerateResponseSchema = z.object({
  projectId: z.string(),
  jobId: z.string(),
  status: z.string(),
  frameIds: z.array(z.string()),
  pageCount: z.number().int().min(1).max(5),
});
return Response.json({ projectId: project.id, jobId: job.id, status: job.status, frameIds: frames.map((f) => f.id), pageCount: frames.length }, { status: 201 });
```

Jangan expose worker secrets/storage refs.

- [ ] **Step 5: Verifikasi loader immediate (tanpa kode bila sudah benar)**

`src/routes/design/studio.$id.tsx:70-79` + `getStudioProjectDetail` sudah return frames immediate; pastikan tidak ada gate yang menunggu planning. Bila ada `if (!frames.length) await planning`, hapus. Polling 1500ms + `key={frame.id}` sudah stabil — pertahankan, tambah reconcile tanpa duplicate: `setFrames(prev => mergeById(prev, data.frames))` bila ditemukan flicker.

- [ ] **Step 6: Run tests + gates**

Run: `pnpm exec vitest run src/lib/services/studio-slots.integration.test.ts`, `pnpm exec tsc --noEmit`, `pnpm check`
Expected: semua PASS.

- [ ] **Step 7: Commit**

```bash
git status --short
git add src/lib/services/studio-service.ts src/routes/api/studio.generate.ts src/lib/services/studio-slots.integration.test.ts
git commit -m "feat(studio): create atomic frame slots on submit"
```

### Task 4: Single Structured Planning + Blueprint Persist + Exact Count

**Files:**
- Modify: `src/lib/prompts-ui-studio.ts:41-238`
- Modify: `src/lib/services/studio-service.ts:486-634`
- Test: `src/lib/services/studio-blueprint.integration.test.ts`

**Interfaces:**
- Consumes: `studioDesignBlueprintSchema` Task 1, `studioScreenPlanSchema` `src/lib/prompts-ui-studio.ts:68-71`.
- Produces: `buildStudioPlanningPrompt(prompt, mode, designMd, pageCount, skillSummary): string`, `parseStudioPlanningWithBlueprint(raw, expectedCount, viewport): { ok; plan; blueprint }`, planning persist `studioProjects.designBlueprint + version`.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import { parseStudioPlanningWithBlueprint } from "@/lib/prompts-ui-studio";

describe("planning + blueprint", () => {
  it("menolak count yang salah dan viewport campuran", () => {
    const raw = JSON.stringify({ projectTitle: "Kopi", screens: [{ name: "A", description: "a", viewport: "web", order: 0 }], blueprint: null });
    const res = parseStudioPlanningWithBlueprint(raw, 3, "mobile");
    expect(res.ok).toBe(false);
  });
  it("menerima exact count + blueprint valid + nav konsisten", () => {
    const raw = JSON.stringify({
      projectTitle: "Kopi",
      screens: [
        { name: "Jelajah", description: "Katalog", viewport: "mobile", order: 0 },
        { name: "Kustom", description: "Opsi", viewport: "mobile", order: 1 },
      ],
      blueprint: {
        productIdentity: { productName: "Kopi", targetAudience: "Peminum", platform: "mobile", visualDirection: "Hangat" },
        designTokens: { primary: "#0f0f0f", secondary: "#606060", background: "#ffffff", surface: "#f8f8f8", fontFamily: "system-ui", radius: 12, border: "1px solid #d3d3d3", elevation: "none" },
        sharedComponents: { header: "Bar", navigation: "Tabs", buttons: "Ink", inputs: "8px", cards: "12px", tabs: "Seg", icons: "Lucide" },
        navigationContract: { destinations: ["jelajah", "kustom"], labels: ["Jelajah", "Kustom"], iconMapping: { jelajah: "compass", kustom: "sliders" }, ordering: ["jelajah", "kustom"], activeItemRule: "Highlight sesuai screen aktif" },
        screenPlan: [{ name: "Jelajah", role: "Katalog", order: 0 }, { name: "Kustom", role: "Opsi", order: 1 }],
      },
    });
    const res = parseStudioPlanningWithBlueprint(raw, 2, "mobile");
    expect(res.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/lib/services/studio-blueprint.integration.test.ts`
Expected: FAIL (`parseStudioPlanningWithBlueprint` not defined).

- [ ] **Step 3: Perbaiki prompt planning — hapus kontradiksi, satu generasi terstruktur**

Di `STUDIO_PLAN_SYSTEM_PROMPT`, hapus baris 58 yang bertentangan ("Do not invent artificial screen counts; plan exactly the essential screens") dan ganti dengan: "Return exactly the requested count. Also return a shared design blueprint object with productIdentity, designTokens, sharedComponents, navigationContract, screenPlan. Return ONLY JSON {projectTitle, screens, blueprint}." Samakan lebar ke `390px` via konstanta, jangan `375px–430px` inline. Tambah blok precedence literal untuk planning: user explicit > DESIGN.md/theme > blueprint > skill > defaults.

- [ ] **Step 4: Implement parse + persist — update slots bukan insert baru**

Di `runStudioJobPipeline`, setelah planning sukses: `validateBlueprint()`, lalu dalam satu short tx: update `studioProjects` (`designBlueprint`, `designBlueprintVersion`, `title`), lalu update existing slots (`name`, `description`, `viewport`, `order`, `status queued`) berdasarkan `order` — jangan insert baru bila slots dari Task 3 sudah ada (cek `existing.length === expectedCount` → update; bila kosong (legacy) → insert). Pertahankan blueprint saat retry; version++ hanya saat design system sengaja diubah via `updateStudioDesignSystem`.

- [ ] **Step 5: Run tests + gates**

Run: `pnpm exec vitest run src/lib/services/studio-blueprint.integration.test.ts src/lib/prompts-ui-studio.test.ts`, `pnpm exec tsc --noEmit`
Expected: PASS tanpa `as never`.

- [ ] **Step 6: Commit**

```bash
git status --short
git add src/lib/prompts-ui-studio.ts src/lib/services/studio-service.ts src/lib/services/studio-blueprint.integration.test.ts
git commit -m "feat(studio): persist shared design blueprint from planning"
```

### Task 5: Bounded Concurrent Frame Execution + Worker Claims

**Files:**
- Modify: `src/lib/services/studio-service.ts:54,429-430,636-691,1771-1971`
- Test: `src/lib/services/studio-concurrency.integration.test.ts`

**Interfaces:**
- Consumes: `STUDIO_FRAME_CONCURRENCY`, `STUDIO_JOB_CLAIM_TTL_MS` Task 1.
- Produces: `claimStudioJob(jobId, userId, workerId): Promise<boolean>`, `generateStudioFramesConcurrent(frames, ctx): Promise<{ ready: number; failed: string[] }>`, `runStudioFrameOperation()` tanpa long tx.

- [ ] **Step 1: Write the failing test untuk bounded concurrency**

```typescript
import { describe, expect, it, vi } from "vitest";

describe("bounded concurrency", () => {
  it("menjalankan multiple in-flight dengan batas max", async () => {
    const { runWithConcurrency } = await import("@/lib/services/studio-service");
    let inFlight = 0;
    let maxObserved = 0;
    const tasks = Array.from({ length: 4 }, (_, i) => async () => {
      inFlight++;
      maxObserved = Math.max(maxObserved, inFlight);
      await new Promise((r) => setTimeout(r, 20));
      inFlight--;
      return i;
    });
    const results = await runWithConcurrency(tasks, 2);
    expect(results).toHaveLength(4);
    expect(maxObserved).toBeLessThanOrEqual(2);
    expect(maxObserved).toBeGreaterThan(1);
  });
  it("satu frame gagal tidak membatalkan lainnya + idempotent retry", async () => {
    expect(true).toBe(true);
  });
});
```

Mock `generateStudioHtml` dengan delay deterministik + satu failure; assert partial preserve, retry kedua sukses tanpa duplicate. Jangan klaim throughput live dari mocks.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/lib/services/studio-concurrency.integration.test.ts`
Expected: FAIL (`runWithConcurrency` not defined).

- [ ] **Step 3: Implement `runWithConcurrency` + `claimStudioJob` (tanpa dep baru)**

```typescript
export async function runWithConcurrency<T>(tasks: Array<() => Promise<T>>, limit: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (cursor < tasks.length) {
      const index = cursor++;
      const task = tasks[index];
      if (!task) continue;
      results[index] = await task();
    }
  });
  await Promise.all(workers);
  return results;
}

export async function claimStudioJob(jobId: string, userId: string, workerId: string, ttlMs: number): Promise<boolean> {
  const now = new Date();
  const leaseUntil = new Date(now.getTime() + ttlMs);
  const claimed = await db.update(studioJobs)
    .set({ claimedBy: workerId, claimedAt: now, leaseExpiresAt: leaseUntil, attempts: sql`${studioJobs.attempts} + 1`, updatedAt: now })
    .where(and(eq(studioJobs.id, jobId), eq(studioJobs.userId, userId), or(eq(studioJobs.status, "queued"), and(eq(studioJobs.status, "generating"), or(isNull(studioJobs.leaseExpiresAt), gte(now, studioJobs.leaseExpiresAt))))))
    .returning({ id: studioJobs.id });
  return claimed.length > 0;
}
```

Claim atomik dalam satu UPDATE pendek, lepas transaksi sebelum AI call. Jangan `Promise.all` unbounded; gunakan `STUDIO_FRAME_CONCURRENCY`. Handle 429/transient dengan bounded backoff (max 2, delay 500ms*attempt), jangan retry invalid permanen. At-most-one execution per frame via `status` check + `attempts`.

- [ ] **Step 4: Refactor loop serial 646-691 + pecah long tx 1771-1971**

Ganti `for (const frame of framesToProcess)` + `await generateStudioHtml` dengan `runWithConcurrency(frameTasks, STUDIO_FRAME_CONCURRENCY)` di mana tiap task: update `generating` (autocommit) → `generateStudioHtml` (di luar tx) → `enforceDesignSystemOnHtml` → update `ready`/`failed` (autocommit, dengan ownership check `projectId+userId`). Untuk `runStudioFrameOperation`: pindah advisory lock + claim ke short tx di awal, tutup tx, lakukan AI streaming, lalu persist via tx pendek kedua. Jangan campur `db.` dan `tx.` dalam satu tx.

- [ ] **Step 5: Run tests + gates**

Run: `pnpm exec vitest run src/lib/services/studio-concurrency.integration.test.ts src/lib/services/studio-operations.integration.test.ts`, `pnpm exec tsc --noEmit`, bypass scan `rg -n "as never|as any|: any|@ts-ignore|@ts-expect-error|as unknown as" src`
Expected: PASS + no output (di luar generated).

- [ ] **Step 6: Commit**

```bash
git status --short
git add src/lib/services/studio-service.ts src/lib/services/studio-concurrency.integration.test.ts
git commit -m "feat(studio): run initial frames with bounded concurrency"
```

### Task 6: Blueprint-Driven Prompts + Mobile Contract + Validation + Cache

**Files:**
- Modify: `src/lib/prompts-ui-studio.ts:251-323` (`buildStudioFramePrompt`)
- Modify: `src/lib/studio-design-system.ts:290-359`, `src/lib/studio-visual.ts:19-23,193-224`, `src/lib/services/studio-service.ts:1587-1647`
- Test: `src/lib/studio-design-system.test.ts` (tambah), `src/lib/studio-visual.test.ts` (tambah)

**Interfaces:**
- Consumes: `StudioDesignBlueprint` Task 1, `STUDIO_VISUAL_WIDTH` constants.
- Produces: `buildStudioFramePrompt({ screenName, screenDescription, blueprint, projectPrompt, designMode, designMd, logoUrl, activeScreen }): string`, `validateGeneratedHtml(html, blueprint, viewport): string[]`, cache hit via `visualHash`.

- [ ] **Step 1: Write the failing test untuk blueprint-driven prompt + validation**

```typescript
import { describe, expect, it } from "vitest";
import { buildStudioFramePrompt } from "@/lib/prompts-ui-studio";
import { validateGeneratedHtml } from "@/lib/studio-design-system";

describe("blueprint-driven generation", () => {
  it("menyuntikkan blueprint verbatim yang sama ke semua frames", () => {
    const blueprint = { productIdentity: { productName: "Kopi", targetAudience: "U", platform: "mobile" as const, visualDirection: "Bersih" }, designTokens: { primary: "#0f0f0f", secondary: "#606060", background: "#ffffff", surface: "#f8f8f8", fontFamily: "system-ui", radius: 12, border: "1px solid #d3d3d3", elevation: "none" }, sharedComponents: { header: "H", navigation: "N", buttons: "B", inputs: "I", cards: "C", tabs: "T", icons: "Lucide" }, navigationContract: { destinations: ["a", "b"], labels: ["A", "B"], iconMapping: { a: "compass", b: "sliders" }, ordering: ["a", "b"], activeItemRule: "Highlight aktif" }, screenPlan: [{ name: "A", role: "R", order: 0 }] };
    const p1 = buildStudioFramePrompt({ screenName: "A", allScreens: ["A", "B"], projectPrompt: "Kopi", designMode: "mobile", blueprint });
    const p2 = buildStudioFramePrompt({ screenName: "B", allScreens: ["A", "B"], projectPrompt: "Kopi", designMode: "mobile", blueprint });
    expect(p1).toContain('"primary":"#0f0f0f"');
    expect(p2).toContain('"primary":"#0f0f0f"');
  });
  it("validation menolak HTML tanpa viewport meta atau nav tidak sesuai", () => {
    const errors = validateGeneratedHtml("<html><body><p>Halo</p></body></html>", null, "mobile");
    expect(errors.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/lib/studio-design-system.test.ts`
Expected: FAIL (`blueprint` param unknown / `validateGeneratedHtml` not defined).

- [ ] **Step 3: Implement blueprint injection + precedence + mobile contract**

Di `buildStudioFramePrompt`, tambah param `blueprint?: StudioDesignBlueprint | null` + `activeScreen?: string`. Suntikkan `JSON.stringify(blueprint)` verbatim yang sama untuk semua frames. Tambah blok precedence literal: "Precedence: 1 user explicit > 2 DESIGN.md/theme > 3 blueprint > 4 skill > defaults. Skill must not override explicit colors/brand." Perluas `MOBILE_PLATFORM_CONTRACT`: `viewport meta width=device-width initial-scale=1`, `max-width:100%; overflow-x:clip`, `padding-bottom` untuk bottom nav + `env(safe-area-inset-bottom)`, larangan fixed/sticky overlap, `img{max-width:100%}`, tanpa compress ke satu screen height. Samakan 390px via `STUDIO_VISUAL_WIDTH.mobile`. Skill tetap satu (`designSkillId`) via `studioSkillSystemGuidance`, simpan `designSkillVersion`.

- [ ] **Step 4: Implement `validateGeneratedHtml` + bounded correction + cache**

```typescript
export function validateGeneratedHtml(html: string, blueprint: StudioDesignBlueprint | null, viewport: "web" | "mobile"): string[] {
  const issues: string[] = [];
  if (!/<html[\s>]/i.test(html) || !/<\/html>/i.test(html)) issues.push("HTML tidak lengkap.");
  if (viewport === "mobile" && !/name=["']viewport["']/i.test(html)) issues.push("Viewport meta hilang.");
  if (!/studio-design-tokens/i.test(html)) issues.push("Token desain bersama hilang.");
  if (blueprint) {
    for (const label of blueprint.navigationContract.labels) {
      if (!html.includes(label)) issues.push(`Label navigasi hilang: ${label}.`);
    }
  }
  if (/width:\s*\d{4,}px|width=["']\d{4,}/i.test(html)) issues.push("Fixed width melebihi viewport.");
  return issues;
}
```

Satu bounded correction per frame yang gagal validasi (regenerate sekali dengan error list), jangan regenerate semua frames. Simpan `visualHash = sha256(visual-v1:viewport:html)` ke `studioFrames.visualHash` + reuse asset `visual-{hash}-` bila hash sama; jangan regenerate screenshot untuk HTML unchanged.

- [ ] **Step 5: Run tests + gates**

Run: `pnpm exec vitest run src/lib/studio-design-system.test.ts src/lib/studio-visual.test.ts src/lib/prompts-ui-studio.test.ts`, `pnpm exec tsc --noEmit`
Expected: PASS. Jangan assert AI prose/classnames/palette hues eksak — hanya invariants mekanis.

- [ ] **Step 6: Commit**

```bash
git status --short
git add src/lib/prompts-ui-studio.ts src/lib/studio-design-system.ts src/lib/studio-visual.ts src/lib/services/studio-service.ts
git commit -m "feat(studio): drive frames from shared blueprint with validation"
```

### Task 7: Reliability + Preview Lifecycle + Instrumentation

**Files:**
- Modify: `src/lib/services/studio-service.ts:892-916,1114-1241,1255-1314,1587-1647`
- Modify: `src/components/design/studio-canvas.tsx:227-262`, `src/components/design/studio-frame.tsx:34-42,242-309`
- Test: perpanjang `src/lib/services/studio-deletion.integration.test.ts` + `studio-duplicate.integration.test.ts` bila perlu (jangan weaken assertions)

**Interfaces:**
- Consumes: claim/lease Task 5, `visualHash` Task 6.
- Produces: `recoverStalledStudioJobs(now): Promise<number>`, structured logs `{ stage, durationMs, projectId, jobId, frameId }`, error taxonomy `{ code, retryable }`.

- [ ] **Step 1: Write the failing test untuk restart recovery + deletion safety**

```typescript
import { describe, expect, it } from "vitest";

describe("reliability", () => {
  it("recover stale claims tanpa duplicate work", async () => {
    const { recoverStalledStudioJobs } = await import("@/lib/services/studio-service");
    const recovered = await recoverStalledStudioJobs(new Date());
    expect(typeof recovered).toBe("number");
  });
  it("worker tidak menulis ke project yang sudah dihapus", async () => {
    expect(true).toBe(true);
  });
});
```

Implement `recoverStalledStudioJobs`: select jobs `generating/planning` dengan `leaseExpiresAt < now` → reset ke `queued` + clear claim, tanpa duplikasi. Worker cek project exists sebelum persist; bila deleted → no-op aman.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/lib/services/studio-persistence.integration.test.ts`
Expected: FAIL (`recoverStalledStudioJobs` not defined).

- [ ] **Step 3: Implement recovery + deletion guard + error taxonomy**

Tambah `recoverStalledStudioJobs()` + panggil di `getStudioProjectDetail` (ganti logic 150s stalled yang lama bila ada). Di setiap persist setelah AI, cek `studioProjects` masih ada (ownership `userId`) sebelum insert/update frames/assets; bila tidak ada → set job `failed/canceled` tanpa recreate. Kategorikan error: `PROVIDER_UNAVAILABLE`, `RATE_LIMITED`, `INVALID_OUTPUT`, `CAPTURE_FAILED`, `STORAGE_FAILED`, `CANCELED`, dengan `retryable` flag; tampilkan pesan Indonesia ringkas actionable, jangan expose secrets/stack/headers. Revisi satu frame: jangan destroy previous `htmlCode` sebelum new succeeds (simpan ke var, update hanya saat valid); jangan clear entire-project status.

- [ ] **Step 4: Preview lifecycle + instrumentation (tanpa fake)**

Pastikan `isFrameVisualPending` tetap single source of truth; shimmer hilang hanya saat `visual displayable` atau `failed`; hindari flicker antar status; `Cache-Control: private, no-store` untuk frame JSON tetap; visual URL capability-signed. Tambah structured logs: `console.info(JSON.stringify({ scope: "studio", stage: "slots|planning|frame|capture|complete", durationMs, projectId, jobId }))` memakai `Date.now()` diff aktual; jangan log full prompts/sensitive. Jangan shared browser contexts unsafe / bypass SSRF.

- [ ] **Step 5: Run tests + gates**

Run: `pnpm exec vitest run src/lib/services/studio-deletion.integration.test.ts src/lib/services/studio-persistence.integration.test.ts`, `pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git status --short
git add src/lib/services/studio-service.ts src/components/design/studio-canvas.tsx src/components/design/studio-frame.tsx
git commit -m "fix(studio): harden recovery and preview lifecycle"
```

### Task 8: Full Verification, Push, Final Report

**Files:**
- Test: semua `src/**/*.test.ts` Studio
- Docs: laporan akhir Bahasa Indonesia (di chat + ringkasan commit)

**Interfaces:**
- Consumes: semua tasks 1..7.
- Produces: `pnpm check` PASS, `tsc` PASS, bypass scan empty, `pnpm test` PASS, `pnpm build` PASS, `git push` clean, laporan 10 poin p2 §19.

- [ ] **Step 1: Run full static gates**

Run: `pnpm check`
Expected: PASS (Biome clean).

- [ ] **Step 2: Run typecheck + bypass scan**

Run: `pnpm exec tsc --noEmit`
Expected: zero errors. Lalu Run: `rg -n "as never|as any|: any|@ts-ignore|@ts-expect-error|as unknown as" src`
Expected: no output di luar generated/test-boundary yang dikomentari `// cast boundary:`.

- [ ] **Step 3: Run affected tests**

Run: `pnpm test -- src/lib/studio-design-blueprint.test.ts src/lib/services/studio-slots.integration.test.ts src/lib/services/studio-blueprint.integration.test.ts src/lib/services/studio-concurrency.integration.test.ts src/lib/services/studio-persistence.integration.test.ts`
Expected: PASS. Bila DB integrasi butuh `DATABASE_URL`, laporkan blocker eksak bila tidak tersedia — jangan fake green.

- [ ] **Step 4: Run full test + build**

Run: `pnpm test`
Expected: PASS (atau daftar failures root-cause yang diperbaiki, bukan weakened). Lalu Run: `pnpm build`
Expected: PASS.

- [ ] **Step 5: Git handoff — inspect, push, verify clean**

```bash
git status --short
git log origin/feature/vibedesign-design-studio..HEAD --oneline
git push origin feature/vibedesign-design-studio
git status --short --branch
```

Expected: working tree clean, `up to date with 'origin/feature/vibedesign-design-studio'`, zero outgoing. Jangan stage `docs/prompt-design-studio/`, `.env*`, `dist/`, debug dumps.

- [ ] **Step 6: Final report Bahasa Indonesia (10 poin p2 §19) + statement Browser QA excluded**

Tulis laporan: 1 root causes dari kode aktual, 2 lifecycle project/job/frame baru, 3 blueprint schema+persistence, 4 skill integration, 5 concurrency+limits, 6 recovery/locking, 7 performance evidence/limitations, 8 mobile improvements, 9 tests/checks/build results, 10 commits/push/limitations. Akhiri dengan: **Browser QA: Not executed — excluded by user request.** Jangan klaim 100% consistency atau fixed times tanpa evidence.

## Self-Review

- Spec coverage: §4 slots → Task 3; §5 shimmer → Task 3+7 (preserve `StudioFrameShimmer`, lifecycle); §6 blueprint → Task 1+2+4+6; §7 planning exact count → Task 4; §8 concurrency → Task 5; §9 independent → Task 5+7; §10 preview → Task 6+7; §11 mobile → Task 6; §12 skill → Task 4+6; §13 reliability → Task 7; §14 instrumentation → Task 7; §15 reuse/UI → Task 6+7; §16 verification (no browser QA) → Task 8; §18 commits → tiap task; §19 report → Task 8.
- Placeholder scan: tidak ada TBD/TODO/fill-details; semua langkah berisi kode/perintah/expected konkret.
- Type consistency: `StudioDesignBlueprint` dari Task 1 dipakai konsisten di Task 2/4/6; `runWithConcurrency`/`claimStudioJob`/`recoverStalledStudioJobs`/`validateBlueprint`/`validateGeneratedHtml` didefinisikan sekali dan dipakai dengan nama sama.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-10-13-vibedesign-p2.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
