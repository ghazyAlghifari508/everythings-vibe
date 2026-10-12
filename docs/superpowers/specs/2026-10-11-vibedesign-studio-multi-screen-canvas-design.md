# Technical Design Specification: VibeDesign Studio Multi-Screen AI Design Canvas

**Document ID:** `2026-10-11-vibedesign-studio-multi-screen-canvas-design`  
**Target Branch:** `feature/vibedesign-design-studio`  
**Status:** Approved for Implementation Planning  
**Author:** Antigravity Engineering  

---

## 1. Executive Summary & Objective

VibeDesign Studio is transitioning from a single-page HTML generator displayed in a standard preview container into a **professional multi-screen AI design canvas inspired by Google Stitch**. 

### Core Product Experience
1. **Instant Canvas Navigation:** User describes their application idea (e.g. *"Buatkan prototype aplikasi finance dengan halaman Dashboard, Transactions, Analytics, dan Settings"*) and submits. The server validates, creates the project and background generation job immediately (<200ms), and navigates directly to `/design/studio/$id`.
2. **Honest Skeleton Frames:** The full-screen dotted canvas opens immediately. As soon as the AI planning phase identifies the required screens, canvas placeholders (skeletons) appear matching the exact count, names, and viewport dimensions of the planned screens.
3. **Multi-Screen Generation with Shared Visual Consistency:** Screens are generated independently using a shared design context (`DESIGN.md`, official logo, color scheme, typography, component styling).
4. **Progressive Live Reveal:** Frames update from skeleton to interactive HTML live as each frame's generation finishes and is validated in PostgreSQL.
5. **Fluid Canvas Interactions:** Pan, zoom, fit-to-view, and frame selection powered by reusable Greenfield canvas primitives (`useCanvasZoom`, `getCanvasDotStyle`, `ZoomControls`).
6. **In-Canvas Floating AI Composer:** A persistent floating prompt bar at the bottom allowing the user to add new screens (*"Tambahkan halaman Budget Planning"*), revise a selected screen (*"Buat tabel transaksi lebih compact"*), or apply project-wide styling adjustments without leaving the canvas.
7. **Multi-Screen Export:** Export individual frame HTML or the entire project bundled as a clean ZIP archive (`dashboard.html`, `transactions.html`, etc.).
8. **100% Backwards Compatibility:** Legacy single-HTML studio projects load gracefully as a single ready frame on the new canvas with zero data loss or breaking changes.

---

## 2. Architecture & System Flow

```
[Client: Studio Home / Composer]
       │
       ▼ (1) POST /api/studio/generate { prompt, designMode, designMd, logo }
[Server API Handler]
       │
       ├──► Validates prompt & inputs (Zod, length, sanitization)
       ├──► Inserts into `studio_projects` (title, designMode, designMd, logoAssetId)
       ├──► Inserts into `studio_jobs` (status = "queued", jobType = "initial")
       ├──► Returns { projectId, jobId } immediately (HTTP 201, <200ms)
       │
[Client Browser] ──► (2) Navigates immediately to /design/studio/:projectId
       │
       ├──► Mounts Fullscreen Canvas & begins polling /api/studio/project?id=:projectId (1.5s interval)
       │
[Server Background Worker / Pipeline Runner]
       │
       ├──► (3) Phase 1: Planning (Job status = "planning")
       │         Calls AI with structured output schema to plan screens:
       │         Plan: [{ name: "Dashboard", description: "...", viewport: "mobile", order: 0 }, ...]
       │         Persists records into `studio_frames` with status = "queued"
       │         Updates job status = "generating"
       │
       ├──► (4) Phase 2: Frame Generation (Sequential/Concurrent per frame)
       │         For each frame:
       │           Sets frame status = "generating"
       │           Compiles prompt: User prompt + Screen role + Shared Design Tokens + Logo URL
       │           Streams/calls AI HTML generation (Tailwind CSS CDN, Lucide CDN, Vanilla JS)
       │           Validates & sanitizes HTML (extractCleanHtml, sandbox safe)
       │           Updates frame with htmlCode, status = "ready"
       │
       └──► (5) Completion:
                 When all frames reach "ready", updates `studio_jobs` status = "completed"
                 Inserts snapshot into `studio_revisions` (version tracking)

[Client Canvas Viewport]
       │
       ├──► After (3): Renders exact skeleton cards for Dashboard, Transactions, Analytics, Settings
       ├──► During (4): As each frame finishes in DB, its skeleton transitions to live interactive iframe
       └──► After (5): Full multi-screen prototype ready for inspection, pan/zoom, revision & export
```

---

## 3. Database Schema & Persistence

Database tables defined in `src/db/schema.ts` (PostgreSQL 17 with Drizzle ORM):

### 3.1. `studio_projects` (Existing - Preserved)
```typescript
export const studioProjects = pgTable("studio_projects", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  designMode: text("design_mode").notNull().default("web"), // "web" | "mobile"
  designMd: text("design_md"),
  logoAssetId: text("logo_asset_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
```

### 3.2. `studio_jobs` (New Table)
Authoritative tracking for asynchronous generation jobs:
```typescript
export const studioJobs = pgTable(
  "studio_jobs",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    projectId: text("project_id").notNull().references(() => studioProjects.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    prompt: text("prompt").notNull(),
    jobType: text("job_type").notNull().default("initial"), // "initial" | "add_frame" | "revise_frame" | "revise_project"
    targetFrameId: text("target_frame_id"),
    status: text("status").notNull().default("queued"), // "queued" | "planning" | "generating" | "completed" | "failed"
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("studio_jobs_project_id_idx").on(t.projectId),
    index("studio_jobs_user_id_idx").on(t.userId),
  ],
);
```

### 3.3. `studio_frames` (New Table)
Authoritative model for individual screens on the canvas:
```typescript
export const studioFrames = pgTable(
  "studio_frames",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    projectId: text("project_id").notNull().references(() => studioProjects.id, { onDelete: "cascade" }),
    name: text("name").notNull(), // e.g. "Dashboard", "Transactions"
    description: text("description"), // purpose of this screen
    viewport: text("viewport").notNull().default("web"), // "web" | "mobile"
    htmlCode: text("html_code"), // validated standalone HTML
    status: text("status").notNull().default("queued"), // "queued" | "generating" | "ready" | "failed"
    order: integer("order").notNull().default(0),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("studio_frames_project_id_idx").on(t.projectId),
    index("studio_frames_order_idx").on(t.order),
  ],
);
```

### 3.4. `studio_revisions` & `studio_assets` (Existing - Preserved)
- `studio_revisions` stores revision prompt history and project version numbers.
- `studio_assets` stores uploaded logos with secure HMAC capabilities.

### 3.5. Legacy Project Backwards Compatibility
When `getStudioProject(projectId, userId)` is called:
1. If project has rows in `studio_frames`, return them ordered by `order asc`.
2. If project has **0 rows** in `studio_frames` but has an existing `latest` revision in `studio_revisions` with `htmlCode`:
   - Lazily synthesize/insert a default frame:
     - `name`: `project.title`
     - `description`: "Main screen"
     - `viewport`: `project.designMode`
     - `htmlCode`: `latest.htmlCode`
     - `status`: `"ready"`
     - `order`: `0`
3. This guarantees legacy projects seamlessly open in the multi-screen canvas, can be zoomed/panned, and can receive additional screens without breakage.

---

## 4. AI Generation Engine & Prompt Contracts

### 4.1. Phase 1: Adaptive Screen Planning
The planning prompt instructs the model to analyze the user's prompt and generate a focused, coherent set of screens (typically 3 to 5 screens depending on user requirements).

**Output Schema:**
```json
{
  "projectTitle": "Finance Mobile App",
  "screens": [
    {
      "name": "Dashboard",
      "description": "Ringkasan saldo, pengeluaran bulanan, kartu cepat transfer, dan statistik utama",
      "viewport": "mobile",
      "order": 0
    },
    {
      "name": "Transactions",
      "description": "Daftar riwayat transaksi dengan filter kategori, pencarian, dan status",
      "viewport": "mobile",
      "order": 1
    },
    {
      "name": "Analytics",
      "description": "Grafik tren arus kas, perbandingan bulanan, dan breakdown kategori",
      "viewport": "mobile",
      "order": 2
    },
    {
      "name": "Settings",
      "description": "Profil pengguna, pengaturan notifikasi, preferensi tema, dan keamanan akun",
      "viewport": "mobile",
      "order": 3
    }
  ]
}
```

The server parses this response with Zod:
```typescript
export const studioScreenPlanSchema = z.object({
  projectTitle: z.string().min(1).max(200),
  screens: z.array(
    z.object({
      name: z.string().min(1).max(100),
      description: z.string().max(500).optional(),
      viewport: z.enum(["web", "mobile"]),
      order: z.number().int(),
    })
  ).min(1).max(8),
});
```

### 4.2. Phase 2: Frame Generation with Shared Design Context
Each screen is generated independently, but shares a strict design context to ensure visual continuity:
- **Shared Color Palette:** Defined by `DESIGN.md` if supplied, or synthesized by primary brand theme.
- **Shared Typography:** Consistent font stacks and typographic scale.
- **Shared Components & Header/Navigation:**
  - In Mobile mode: Matching bottom navigation bar across all screens (active tab corresponds to the current screen name).
  - In Web mode: Matching top navigation bar across all screens (active nav item corresponds to the current screen name).
- **Application Logo Continuity:** Injected as exact image tag `<img src="${logoUrl}" ...>` into the top bar of every screen.
- **Standalone HTML Contract:**
  - Tailwind CSS via CDN: `<script src="https://cdn.tailwindcss.com"></script>`
  - Lucide Icons via CDN: `<script src="https://unpkg.com/lucide@latest"></script>`
  - Responsive layout: Mobile dimensions (375px–430px) or Desktop dimensions (1280px–1440px)
  - Realistic Indonesian copy with believable dummy data.

---

## 5. API Routes Specification

### 5.1. `POST /api/studio/generate`
Creates a project and dispatches the generation job.
- **Request Body:**
  ```typescript
  {
    prompt: string,               // min 10, max 4000 chars
    title?: string,
    designMode?: "web" | "mobile",
    designMd?: string | null,
    logo?: { filename: string, mimeType: string, data: string } | null
  }
  ```
- **Response (201 Created):**
  ```typescript
  {
    projectId: string,
    jobId: string,
    status: "queued"
  }
  ```

### 5.2. `GET /api/studio/project?id=:id`
Returns authoritative project state, frames, and active job.
- **Response (200 OK):**
  ```typescript
  {
    project: {
      id: string,
      title: string,
      designMode: "web" | "mobile",
      hasDesignMd: boolean,
      hasLogo: boolean,
      logoUrl: string | null,
      createdAt: string,
      updatedAt: string
    },
    frames: Array<{
      id: string,
      name: string,
      description: string | null,
      viewport: "web" | "mobile",
      htmlCode: string | null,
      status: "queued" | "generating" | "ready" | "failed",
      order: number,
      error: string | null
    }>,
    activeJob: {
      id: string,
      jobType: string,
      status: "queued" | "planning" | "generating" | "completed" | "failed",
      error: string | null
    } | null
  }
  ```

### 5.3. `POST /api/studio/frame`
Allows in-canvas AI actions:
- `action: "add_frame"`: Prompts AI to add a new screen (e.g. "Tambahkan halaman Budget Planning").
- `action: "revise_frame"`: Prompts AI to revise a specific `frameId`.
- `action: "revise_project"`: Prompts AI to apply a project-wide change (e.g. "Ubah semua warna tombol jadi biru gelap").
- `action: "retry_frame"`: Retries generation of a failed frame.

---

## 6. Workspace UI & Full-Screen Canvas Experience

### 6.1. Layout Structure (`src/routes/design/studio.$id.tsx`)
Replaces the old narrow stacked container (`max-w-6xl`) with an unconstrained fullscreen design workspace:
- **Top Bar (h-14, fixed):**
  - Left: Back button to Studio list, Project Name with edit affordance, Design Mode badge ("Mobile" / "Web").
  - Center: Live Job Status Indicator (e.g. *"Menyusun 4 layar..."* or *"Siap"*).
  - Right: "Salin Frame", "Download ZIP", Frame count badge, View options.
- **Main Viewport (flex-1, relative, overflow-hidden):**
  - Dot-grid background driven by `getCanvasDotStyle(zoom, pan)`.
  - Pointer pan and wheel zoom gestures driven by `useCanvasZoom()`.
  - Frame container: An absolute container transformed by `translate(pan.x, pan.y) scale(zoom)`.
- **Floating Controls:**
  - Bottom-right: `ZoomControls` (Perkecil, Zoom %, Perbesar, Reset tampilan, Fit to view).
  - Bottom-center: Floating AI Prompt Composer.

### 6.2. Frame Presentation (`StudioFrame`)
Frames are positioned side-by-side in a horizontal row (or 2-column grid for 4+ desktop screens) with generous 48px–64px gap:
- **Title Bar (above frame):**
  - Screen name (e.g. `Dashboard`, `Transactions`) in bold, clear font.
  - Status indicator (spinner while generating, green dot when ready, red with retry button when failed).
  - Quick action buttons on hover: Copy HTML, Expand/Inspect, Re-generate.
- **Frame Body:**
  - Mobile frame dimensions: Width `390px`, Height `844px`, corner radius `24px`, 1px hairline border `border-graphite`, subtle dark container shadow.
  - Web frame dimensions: Width `1280px`, Height `800px`, corner radius `12px`, 1px hairline border.
- **Skeleton State:**
  - When status is `"queued"` or `"generating"`:
    - Renders a clean structural wireframe placeholder with restrained shimmer animation.
    - Mobile skeleton has phone notch/status bar, hero card skeleton, list row skeletons, and bottom nav skeleton.
    - Desktop skeleton has navbar skeleton, sidebar skeleton, and bento grid skeletons.
- **Ready State:**
  - Sandboxed iframe with `sandbox="allow-scripts"` (strictly isolated, no `allow-same-origin`).
  - Seamless responsive scaling inside the frame container.
  - Pointer events passthrough prevention during canvas drag/pan so dragging over an iframe does not drop mouse events.
- **Selection State:**
  - Clicking a frame selects it.
  - Selected frame receives a prominent 2px indigo outline (`ring-2 ring-indigo`).
  - Informs the floating prompt composer: *"Editing: [Frame Name]"*.

### 6.3. Floating AI Prompt Composer
Positioned at bottom center (`fixed bottom-6 left-1/2 -translate-x-1/2 z-30`):
- Clean pill/capsule-like container with dark obsidian/charcoal background and 1px hairline border.
- Shows current target pill:
  - If a frame is selected: `[Target: Dashboard ×]` (clicking × switches to Project-wide).
  - If no frame is selected: `[Target: Seluruh Project]`.
- Input field: *"Ketik perintah revisi atau minta tambah halaman..."*
- Quick action pills:
  - `+ Tambah Halaman`
  - `Ubah Tema / Warna`
  - `Perbaiki Navigasi`
- Submit button with spinner while job is processing.

---

## 7. Export & Security Architecture

1. **ZIP Export (`jszip`):**
   - Bundles all ready frames into a clean archive:
     - `index.html` (First/main screen)
     - `screen-1-dashboard.html`
     - `screen-2-transactions.html`
     - `screen-3-analytics.html`
     - `screen-4-settings.html`
     - `README.txt` (Project summary & design notes)
2. **Single Frame Export:**
   - One-click copy HTML to clipboard with visual toast confirmation.
   - One-click single `.html` download.
3. **Iframe Sandboxing & Security:**
   - Iframe uses `sandbox="allow-scripts"` without `allow-same-origin`.
   - Prevents untrusted generated scripts from reading host cookies, local storage, or interacting with the parent window DOM.
4. **Tenant Isolation:**
   - All database queries filter strictly with `WHERE user_id = ?` and verify project ownership before any job, frame, or asset manipulation.

---

## 8. Verification Strategy & Test Plan

1. **Unit Tests:**
   - `src/lib/services/studio-service.test.ts`: Test `createStudioProject` immediate job creation, screen planning parser, frame insertion, frame revision, and legacy single-HTML fallback.
   - `src/lib/prompts-ui-studio.test.ts`: Validate prompt sanitization, screen planning prompt compilation, frame prompt compilation with `DESIGN.md` and logo.
   - `src/db/vibe-design-schema.test.ts`: Verify Drizzle table schemas for `studio_jobs` and `studio_frames`.
2. **API Integration Tests:**
   - `src/routes/api/-studio.generate.test.ts`: Test POST `/api/studio/generate` returns 201 with `{ projectId, jobId, status: "queued" }`.
   - `src/routes/api/-studio.project.test.ts`: Test GET `/api/studio/project` returns project, frames, and active job.
   - `src/routes/api/-studio.frame.test.ts`: Test frame revision, add frame, and retry actions.
3. **Component & Canvas Tests:**
   - `src/routes/design/-studio.detail.test.tsx`: Test full-screen canvas rendering, pan/zoom integration, skeleton frame rendering, live frame reveal, and frame selection.
   - `src/components/design/studio-composer.test.tsx`: Test target frame toggle, prompt submission, and loading states.
4. **Live Browser QA (Chrome DevTools):**
   - Execute Flow 1: Create mobile finance app with 4 screens → verify immediate navigation → verify 4 skeletons with real names → verify progressive rendering to live frames → verify pan/zoom & selection → test adding a screen → test export.
   - Execute Flow 2: Test legacy single-page studio project backwards compatibility.
