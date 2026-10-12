# VibeDesign Studio Multi-Screen Canvas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform VibeDesign Studio into a professional Stitch-inspired multi-screen AI design canvas with instant navigation, honest progressive skeletons, shared design system consistency, fluid pan/zoom, floating composer, and multi-screen export.

**Architecture:** Two-phase decoupled pipeline (adaptive screen planning -> per-frame HTML generation) backed by persistent `studio_jobs` and `studio_frames` in PostgreSQL. Server creates project and job immediately (<200ms) allowing instant client canvas navigation. Fullscreen canvas renders dot grid and frames using Greenfield `useCanvasZoom` and `getCanvasDotStyle`.

**Tech Stack:** TanStack Start, TanStack Router, React 19, Drizzle ORM, PostgreSQL 17, Tailwind CSS 4, Vercel AI SDK v7 (`tryStreamWithFallback` + 9router), JSZip, Lucide React, Biome, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-11-vibedesign-studio-multi-screen-canvas-design.md`

## Global Constraints

- Never fake progress or invent timers; indicators and skeletons must strictly derive from real DB state (`studio_jobs.status`, `studio_frames.status`).
- Zero type-safety bypasses (`as never`, `as any`, `@ts-ignore` are forbidden).
- Every query must enforce tenant isolation (`WHERE user_id = ?`).
- Legacy single-HTML studio projects must seamlessly open as 1 ready frame without data loss or breaking changes.
- Generated HTML in iframes must use `sandbox="allow-scripts"` without `allow-same-origin`.
- UI copy in Bahasa Indonesia; technical terms preserved in English.

---

### Task 1: Database Schema & Migration for Multi-Screen Studio

**Files:**
- Modify: `src/db/schema.ts`
- Create: `drizzle/0034_studio_multi_screen_canvas.sql`
- Test: `src/db/vibe-design-schema.test.ts`

**Interfaces:**
- Produces: `studioJobs`, `studioFrames`, `StudioJobRow`, `InsertStudioJobRow`, `StudioFrameRow`, `InsertStudioFrameRow`

- [ ] **Step 1: Write tests for `studio_jobs` and `studio_frames` schema definitions**

```typescript
// in src/db/vibe-design-schema.test.ts
import { studioFrames, studioJobs } from "./schema";

it("defines studio_jobs and studio_frames tables with required columns", () => {
  expect(studioJobs.id.dataType).toBe("string");
  expect(studioJobs.projectId.dataType).toBe("string");
  expect(studioJobs.userId.dataType).toBe("string");
  expect(studioJobs.status.dataType).toBe("string");
  expect(studioFrames.id.dataType).toBe("string");
  expect(studioFrames.projectId.dataType).toBe("string");
  expect(studioFrames.name.dataType).toBe("string");
  expect(studioFrames.viewport.dataType).toBe("string");
  expect(studioFrames.status.dataType).toBe("string");
  expect(studioFrames.order.dataType).toBe("number");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/db/vibe-design-schema.test.ts`
Expected: FAIL (`studioJobs` / `studioFrames` not defined)

- [ ] **Step 3: Implement schema definitions in `src/db/schema.ts`**

Add `studioJobs` and `studioFrames` tables, infer select/insert types, and create `drizzle/0034_studio_multi_screen_canvas.sql`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/db/vibe-design-schema.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/db/schema.ts drizzle/0034_studio_multi_screen_canvas.sql src/db/vibe-design-schema.test.ts
git commit -m "feat(db): add studio_jobs and studio_frames tables for multi-screen canvas"
```

---

### Task 2: AI Screen Planning & Frame Generation Prompts

**Files:**
- Modify: `src/lib/prompts-ui-studio.ts`
- Test: `src/lib/prompts-ui-studio.test.ts`

**Interfaces:**
- Produces: `STUDIO_PLAN_SYSTEM_PROMPT`, `buildStudioPlanningPrompt()`, `parseStudioScreenPlan()`, `buildStudioFramePrompt()`, `StudioScreenPlanItem`, `StudioScreenPlan`

- [ ] **Step 1: Write unit tests for screen planning and frame prompts**

```typescript
// in src/lib/prompts-ui-studio.test.ts
import { buildStudioPlanningPrompt, parseStudioScreenPlan, buildStudioFramePrompt } from "./prompts-ui-studio";

it("parses valid JSON screen plan into StudioScreenPlan", () => {
  const raw = JSON.stringify({
    projectTitle: "Finance App",
    screens: [
      { name: "Dashboard", description: "Summary card", viewport: "mobile", order: 0 },
      { name: "Transactions", description: "List of transactions", viewport: "mobile", order: 1 }
    ]
  });
  const res = parseStudioScreenPlan(raw);
  expect(res.ok).toBe(true);
  if (res.ok) {
    expect(res.plan.screens).toHaveLength(2);
    expect(res.plan.screens[0].name).toBe("Dashboard");
  }
});

it("builds frame prompt with shared tokens and logo URL", () => {
  const prompt = buildStudioFramePrompt({
    screenName: "Dashboard",
    screenDescription: "Main overview",
    projectPrompt: "Buat finance app",
    designMode: "mobile",
    designMd: "## Color\nPrimary: #000000",
    logoUrl: "/api/studio/asset?id=123",
  });
  expect(prompt).toContain("Dashboard");
  expect(prompt).toContain("/api/studio/asset?id=123");
  expect(prompt).toContain("Primary: #000000");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/prompts-ui-studio.test.ts`
Expected: FAIL (`buildStudioPlanningPrompt`, `parseStudioScreenPlan` not exported)

- [ ] **Step 3: Implement prompts and validation in `src/lib/prompts-ui-studio.ts`**

Define `STUDIO_PLAN_SYSTEM_PROMPT`, Zod schema for `StudioScreenPlan`, `parseStudioScreenPlan`, `buildStudioPlanningPrompt`, and `buildStudioFramePrompt`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/prompts-ui-studio.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/prompts-ui-studio.ts src/lib/prompts-ui-studio.test.ts
git commit -m "feat(studio): add multi-screen planning and frame prompt contracts"
```

---

### Task 3: Backend Multi-Screen Generation Service & Background Execution

**Files:**
- Modify: `src/lib/services/studio-service.ts`
- Test: `src/lib/services/studio-service.test.ts`

**Interfaces:**
- Produces: `createStudioProjectWithJob()`, `runStudioJobPipeline()`, `getStudioProjectDetail()`, `addStudioFrame()`, `reviseStudioFrame()`, `retryStudioJob()`

- [ ] **Step 1: Write unit tests for `createStudioProjectWithJob` and background pipeline**

```typescript
// in src/lib/services/studio-service.test.ts
it("creates project and queued job immediately without blocking on HTML", async () => {
  const res = await createStudioProjectWithJob("user-1", {
    prompt: "Buat aplikasi mobile kasir restoran",
    designMode: "mobile",
  });
  expect(res.project.id).toBeDefined();
  expect(res.job.status).toBe("queued");
  expect(res.job.jobType).toBe("initial");
});

it("synthesizes legacy single-HTML project into one ready frame", async () => {
  // Mock legacy row without frames
  const detail = await getStudioProjectDetail("legacy-proj", "user-1");
  expect(detail.frames).toHaveLength(1);
  expect(detail.frames[0].status).toBe("ready");
  expect(detail.frames[0].name).toBeDefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/services/studio-service.test.ts`
Expected: FAIL (`createStudioProjectWithJob` not found)

- [ ] **Step 3: Implement pipeline execution in `src/lib/services/studio-service.ts`**

Implement:
1. `createStudioProjectWithJob`: Inserts project and queued job, starts `runStudioJobPipeline` async, returns project and job immediately.
2. `runStudioJobPipeline`: Phase 1 plans screens and inserts `studio_frames` (status queued); Phase 2 generates HTML for each frame and updates status to `ready`.
3. `getStudioProjectDetail`: Fetches project, frames (with legacy fallback), and active job.
4. `addStudioFrame` and `reviseStudioFrame` for canvas iterative edits.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/services/studio-service.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/studio-service.ts src/lib/services/studio-service.test.ts
git commit -m "feat(studio): implement multi-screen generation pipeline and background execution"
```

---

### Task 4: API Routes (`generate`, `project`, `frame`)

**Files:**
- Modify: `src/routes/api/studio.generate.ts`
- Create: `src/routes/api/studio.project.ts`
- Create: `src/routes/api/studio.frame.ts`
- Test: `src/routes/api/-studio.generate.test.ts`
- Create: `src/routes/api/-studio.project.test.ts`
- Create: `src/routes/api/-studio.frame.test.ts`

**Interfaces:**
- Produces: HTTP endpoints for initial generation (`POST /api/studio/generate`), polling (`GET /api/studio/project`), and frame operations (`POST /api/studio/frame`)

- [ ] **Step 1: Write integration tests for API routes**

Verify that `POST /api/studio/generate` returns `{ projectId, jobId, status: "queued" }` with HTTP 201 immediately; `GET /api/studio/project?id=...` returns `{ project, frames, activeJob }`; `POST /api/studio/frame` handles `add_frame` and `revise_frame`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/routes/api/-studio.*.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement API route handlers**

Update `src/routes/api/studio.generate.ts`, create `src/routes/api/studio.project.ts`, create `src/routes/api/studio.frame.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/routes/api/-studio.*.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/routes/api/studio.generate.ts src/routes/api/studio.project.ts src/routes/api/studio.frame.ts src/routes/api/-studio.*.test.ts
git commit -m "feat(api): add studio project, frame, and async generation endpoints"
```

---

### Task 5: Frame Renderer, Skeletons, and Canvas Primitives

**Files:**
- Create: `src/components/design/studio-frame.tsx`
- Create: `src/components/design/studio-frame-skeleton.tsx`
- Test: `src/components/design/studio-frame.test.tsx`

**Interfaces:**
- Produces: `StudioFrame` component with title bar, sandbox iframe, error state, selection outline; `StudioFrameSkeleton` matching mobile and desktop aspect ratios.

- [ ] **Step 1: Write unit tests for `StudioFrame` and `StudioFrameSkeleton`**

Test that skeleton renders appropriate proportions for mobile vs web; test that ready frame mounts sandboxed iframe; test that failed frame displays retry button.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/components/design/studio-frame.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement `StudioFrame` and `StudioFrameSkeleton`**

Implement components with clean hairline borders, titles, selection rings, and iframe pointer-events isolation during canvas interaction.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/components/design/studio-frame.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/design/studio-frame.tsx src/components/design/studio-frame-skeleton.tsx src/components/design/studio-frame.test.tsx
git commit -m "feat(studio): add StudioFrame and StudioFrameSkeleton canvas components"
```

---

### Task 6: Fullscreen Multi-Screen Canvas Component

**Files:**
- Modify: `src/components/design/studio-canvas.tsx`
- Test: `src/components/design/studio-canvas.test.tsx`

**Interfaces:**
- Produces: Fullscreen interactive dotted canvas integrating `useCanvasZoom`, `getCanvasDotStyle`, `ZoomControls`, frame layout calculator, and frame selection.

- [ ] **Step 1: Write component tests for `StudioCanvas`**

Test that multiple frames are positioned in canvas; test that clicking a frame updates selection; test that zoom controls update canvas scale.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/components/design/studio-canvas.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement multi-screen `StudioCanvas`**

Replace single-iframe layout with fullscreen dotted grid canvas, pan/zoom container, frame array renderer, and floating zoom controls.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/components/design/studio-canvas.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/design/studio-canvas.tsx src/components/design/studio-canvas.test.tsx
git commit -m "feat(studio): transform StudioCanvas into fullscreen multi-screen workspace"
```

---

### Task 7: Floating In-Canvas AI Prompt Composer

**Files:**
- Create: `src/components/design/studio-composer.tsx`
- Test: `src/components/design/studio-composer.test.tsx`

**Interfaces:**
- Produces: `StudioComposer` component with target frame indicator, action presets, and revision submission.

- [ ] **Step 1: Write component tests for `StudioComposer`**

Test that selected frame name is shown as target; test that clicking clear target switches to project-wide; test submit triggers action.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/components/design/studio-composer.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement `StudioComposer`**

Build floating bottom composer inspired by Stitch with dark palette, subtle shadow, and quick action pills.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/components/design/studio-composer.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/design/studio-composer.tsx src/components/design/studio-composer.test.tsx
git commit -m "feat(studio): add floating AI prompt composer inside canvas"
```

---

### Task 8: Studio Detail Page (`studio.$id.tsx`) & Immediate Navigation (`studio.index.tsx`)

**Files:**
- Modify: `src/routes/design/studio.index.tsx`
- Modify: `src/routes/design/studio.$id.tsx`
- Test: `src/routes/design/-studio.detail.test.tsx`
- Test: `src/routes/design/-studio.index.test.tsx`

**Interfaces:**
- Produces: Immediate navigation on submit in homepage; fullscreen workspace route with live polling sync, top bar header, and composer integration in detail page.

- [ ] **Step 1: Write route tests for immediate navigation and canvas synchronization**

Test that homepage navigates to `$id` as soon as POST returns `{ projectId, jobId }`; test that detail page displays active job status and renders frames.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/routes/design/-studio.*.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement route updates**

Update `studio.index.tsx` submit handler to navigate immediately without waiting for generation; update `studio.$id.tsx` to load project, poll status, and mount fullscreen `StudioCanvas` with `StudioComposer`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/routes/design/-studio.*.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/routes/design/studio.index.tsx src/routes/design/studio.$id.tsx src/routes/design/-studio.*.test.tsx
git commit -m "feat(studio): wire immediate canvas navigation and live status synchronization"
```

---

### Task 9: Multi-Screen ZIP & Frame Export

**Files:**
- Create: `src/lib/studio-export.ts`
- Modify: `src/components/design/studio-canvas.tsx`
- Test: `src/lib/studio-export.test.ts`

**Interfaces:**
- Produces: `exportProjectAsZip()`, `exportFrameHtml()`, `copyFrameHtml()`

- [ ] **Step 1: Write unit tests for multi-screen ZIP generation**

Test that ZIP contains all ready frames with sanitized filenames and clean HTML; test single frame copy.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/studio-export.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement export utilities**

Implement `src/lib/studio-export.ts` using `JSZip` and integrate download buttons into top toolbar.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/studio-export.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/studio-export.ts src/lib/studio-export.test.ts src/components/design/studio-canvas.tsx
git commit -m "feat(studio): add multi-screen ZIP bundle export and frame copy"
```

---

### Task 10: End-to-End Test Suite, Typecheck, Biome Check, and Push

**Files:**
- All modified and created files

- [ ] **Step 1: Run complete test suite**

Run: `pnpm test`
Expected: All tests pass.

- [ ] **Step 2: Run Biome check and format**

Run: `pnpm check && pnpm format`
Expected: Clean with 0 errors.

- [ ] **Step 3: Run TypeScript typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: Clean with 0 errors.

- [ ] **Step 4: Scan for type bypasses**

Run: `rg -n "as never|as any|\bas any\b|: any|@ts-ignore|@ts-expect-error|as unknown as" src/components/design src/lib/services/studio-service.ts src/routes/design/studio*`
Expected: No violations.

- [ ] **Step 5: Final Git commit & push**

Push verified commits to `origin/feature/vibedesign-design-studio` and verify clean working tree.
