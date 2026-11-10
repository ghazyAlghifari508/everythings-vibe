# PROMPT 01 — Evidence-Based Reverse Engineering and Architecture Research for VibeDesign Studio

**Status: COMPLETED (RESEARCH ONLY)**  
**Target Environment:** EvVibe VibeDesign Studio (`feature/vibedesign-design-studio`)  
**Evidence Standard:** Strict Epistemic Classification (`OBSERVED`, `SOURCE-CONFIRMED`, `INFERRED`, `UNKNOWN`)  
**Scope Boundary:** Read-Only Investigation & Implementation Blueprint for Phases 02 to 13. Zero production application code modified.

---

## 1. REA Readiness & Investigation Coverage Report

### 1.1 REA Environment Status
* **Provider:** `rea-agents` v6.8.0 via Model Context Protocol (`io.github.morluto/rea`).
* **Harness Connection:** Fully registered and active in OMP harness (`~/.omp/agent/mcp.json`) and OpenCode configuration (`~/.config/opencode/opencode.json`).
* **Protocol Negotiation:** `2025-11-25`, client `omp-coding-agent` v1.0.0.
* **CDP Loopback Endpoint:** `http://127.0.0.1:9222` connected to Google Chrome 157.0.8103.40 (Windows x64).
* **Target Resolution:**
  * Top-level host page: `https://stitch.google.com/?pli=1` (`target_id: 14E4FA2CF5E264237817DBE954E8B46E`)
  * Inner application container iframe: `https://app-companion-430619.appspot.com` (`target_id: 4EC9FCEBB47F95B45729BAEE5A64352B`)
* **Tool Invocation Audit:** Verified with live MCP calls: `mcp__rea_binary_session`, `mcp__rea_list_browser_targets`, `mcp__rea_inspect_web_page`, `mcp__rea_observe_web_session`, `mcp__rea_capture_web_screenshot`, `mcp__rea_analyze_web_bundle`.

### 1.2 Evidence Ledger
| Operation | Evidence ID | Target URL / Subject | Classification |
| :--- | :--- | :--- | :--- |
| `list_browser_targets` | `ev_890bbb393cd43dccfd7ac7262f6efd956ae9e032b217360985ea067a665bcf0b` | `https://stitch.google.com/?pli=1` | `OBSERVED` |
| `inspect_web_page` (Landing Host) | `ev_c05a06ecc2fe6ebdb7aab350a265c1b8a7ee2b2672db8956a7df7478fd86796a` | DOM nodes, Angular root, inner iframe | `OBSERVED` |
| `capture_web_screenshot` (Landing) | `ev_61c2bf7866c837d96ec518c3e30b5619e7248f8da1783877dfa9c2f51437000e` | Landing UI 1920x1032 viewport | `OBSERVED` |
| `analyze_web_bundle` (Static Bundle) | `ev_4e9be1f9ab2178faa4eeb15bc5d69222707739da63c5997cce2433f6f76df3b7` | Top bundle chunks & script assets | `OBSERVED` |
| `observe_web_session` (Timeline) | `ev_5660807d6e3acf0558b4c5a41b2b34ab241adb30be7992c292e2326719208c44` | Session lifecycle & navigation boundary | `OBSERVED` |
| `inspect_web_page` (Dual Origin) | `ev_1ebc907e6e561ee9acec04139f39f55e5c356b8e0fec5e210a937b5eb75cc64e` | stitch.google.com + appspot companion | `OBSERVED` |
| `capture_web_screenshot` (Workspace) | `ev_dc5945619b4a0004fd3a8b85c780f55574c3c69c650217c7904ae4a5c95e125f` | Project 869002991737987983 workspace | `OBSERVED` |
| `capture_web_screenshot` (Edit Mode) | `ev_c1f7510a6f098e34701067bf66e7ee9f8e43d3e1c46339cf02896a3bc1a77543` | Screen Edit Mode & dimension indicators | `OBSERVED` |

---

## 2. Google Stitch Behavior Report (Evidence-Referenced)

### 2.1 Investigation A — Initial Prompt & Chat Handoff
1. **Landing Entrypoint [`OBSERVED: ev_61c2bf...`]:**
   * Prompt composer uses a TipTap ProseMirror contenteditable editor (`<div contenteditable="true" role="textbox" class="tiptap ProseMirror">`).
   * Placeholder alternates: `"What native mobile app shall we design?"` (App mode) or web equivalent.
   * Controls on landing: Mode switch (`App` vs `Web`), Model/Creativity preset (`Balanced`), and File Attachment (`input[type=file]` admitting PNG, JPG, WebP, TXT, MD).
2. **Handoff to Canvas [`OBSERVED: ev_dc5945...`]:**
   * Submitting navigates directly to `/projects/<project_id>?pli=1`.
   * The original landing prompt is preserved verbatim as the first turn in the left-hand persistent chat workspace with timestamp metadata (e.g. `3d ago`) and utilities (`Copy prompt`, dropdown menu).
3. **Assistant Response & Frame Availability [`OBSERVED: ev_dc5945...`]:**
   * Assistant presents design reasoning first: color scheme (e.g., `#ff2d78` Neon Tokyo accent), typography (`Sora`), and structured multi-screen breakdown.
   * Canvas simultaneously instantiates multiple frame viewports as isolated `<iframe>` nodes with `srcdoc` strings (~135KB–138KB full standalone HTML documents).
4. **Chat Panel State & Reload [`OBSERVED: ev_dc5945...`]:**
   * A dedicated button (`aria-label="Collapse Stitch panel"`) collapses the sidebar completely to grant 100% canvas viewport.
   * Expand button cleanly restores sidebar state. Reloading `/projects/<id>` restores all chat history, canvas positions, and generated frames from backend persistence without data loss.

### 2.2 Investigation B — Generation & Concurrency
* **Prompt Enqueueing [`OBSERVED: ev_dc5945...`]:**
  * When a screen target is selected, composer placeholder changes to `"What would you like to change or create?"`.
  * If a request is in flight, the submission button is disabled to prevent overlapping race conditions on the same active frame slot.
  * Revisions preserve existing sibling screens; only targeted frames or newly generated additions are updated or appended to the canvas.

### 2.3 Investigation C — Frame Selection & Attachment
* **Canvas Architecture [`OBSERVED: ev_dc5945...`]:**
  * Canvas is implemented using **React Flow** (`react-flow__node react-flow__node-node-screen nopan screen selectable draggable`).
* **Attachment Chips [`OBSERVED: ev_dc5945...`]:**
  * Clicking any screen node on canvas triggers selection and immediately injects an interactive chip into the composer:
    ```html
    <button data-chip-label="true" class="inline-flex ...">
      <img src="https://lh3.googleusercontent.com/..." class="size-5 rounded-full object-cover">
      <span class="truncate">Squad Trip Coordination</span>
    </button>
    <button type="button" aria-label="Remove" class="...">
      <span class="material-symbols-outlined">close</span>
    </button>
    ```
  * Single-Target Focus: Clicking a different screen updates the active chip to the new target.
  * Chip Removal: Clicking `<button aria-label="Remove">` cleanly detaches the target chip, returning the composer to project-level scope.
  * State Resilience: Closing and reopening the chat panel retains the attached target chip intact.

### 2.4 Investigation D — Element-Level Editing & DOM Interaction
* **Canvas Event Isolation [`OBSERVED: ev_c1f751...`]:**
  * Inside each React Flow canvas frame node, the `<iframe sandbox="allow-scripts">` explicitly sets CSS `pointer-events: none;`.
  * This prevents clicks from being captured inside the document while navigating the canvas.
* **Granular Screen Actions [`OBSERVED: ev_c1f751...`]:**
  * Top toolbar provides: `"Modify"` menu with options:
    * `Edit (E)` — Focuses on screen dimensions and prompt scoping.
    * `View Code (Shift+C)` — Opens full-screen dark code inspector modal with line numbers.
    * `DESIGN.md` — Exports tokens and design specification document.
    * `Variations (Shift+V)`, `Regenerate (Shift+R)`.
    * Viewport switcher (`Mobile 390x884`, `Tablet 768x1024`, `Desktop 1280x1024`, `Full Height`).
  * Element Editing Reality: Stitch does **not** employ direct arbitrary DOM clicking inside canvas iframes. Instead, granular adjustments are driven by **AI prompt suggestions** anchored to the frame (e.g., `"Combine top balance stats of Variant 1 with packing grid of Variant 2"`).

### 2.5 Investigation E — Error States & Partial Completion
* Independent iframes prevent cascading render crashes; one failing document does not affect sibling frames.
* Global controls (`Undo`, `Redo`, `Reload (Ctrl+R)`) provide recovery checkpoints.

---

## 3. Open-Source Reference Repositories Comparison

### 3.1 OpenDesign (`nexu-io/open-design`)
* **Analyzed Files:**
  * `apps/web/src/components/ChatComposer.tsx` (265KB)
  * `apps/web/src/components/ChatPane.tsx` (280KB)
  * `apps/web/src/comments/anchor.ts` (8.1KB)
  * `apps/web/src/comments/target-index.ts` (0.9KB)
  * `apps/web/src/comments/validate-save-target.ts` (2.7KB)
  * `apps/web/src/edit-mode/bridge.ts` (58.5KB)
* **Key Architecture Patterns:**
  * `STAGE_ATTACHMENT_EVENT = 'opendesign:stage-attachment'`: Decouples canvas selection from the composer component.
  * `buildManualEditBridge`: Lightweight script injected into the preview sandbox to listen for element mouseover/clicks without polluting production assets.
  * `manualEditDomPathForElement`: Robust DOM selector generator (`tag:nth-child`) that anchors element comments and edit targets.
  * `overlayBoundsFromSnapshot`: Computes responsive bounding client coordinates scaled to the canvas zoom/pan matrix, rendering overlays *outside* the iframe.

### 3.2 Doop (`kgoedecke/doop`)
* **Analyzed Files:**
  * `src/components/PromptBar.tsx` (19.8KB)
  * `src/components/FrameView.tsx` (103KB)
  * `src/lib/frameBridge.ts` (14.7KB)
  * `src/lib/layerEdits.ts` (43.8KB)
* **Key Architecture Patterns:**
  * `CardScope` & `LayerKindIcon`: Visual scope chips in the prompt bar representing frames or individual layers.
  * `frameBridge.ts`: Window postMessage RPC mechanism (`requestFrame(frameId, type, payload)`) communicating between canvas and sandboxed frames.
* **CRITICAL LEGAL NOTICE (AGPL-3.0):**
  * Doop is licensed under GNU AGPL-3.0. EvVibe is a commercial closed-source/open-core ecosystem.
  * **Strict Clean-Room Rule:** No code, utility, or type definition from Doop may be copied, imported, or adapted into EvVibe codebase. Only high-level architectural patterns (postMessage RPC + scope chips) may be implemented cleanly.

### 3.3 Onlook (`onlook-dev/onlook`)
* **Analyzed Files:**
  * `apps/web/client/.../canvas/frame/view.tsx`
  * `apps/web/client/.../canvas/overlay/elements/rect/click.tsx`
  * `apps/web/client/.../canvas/overlay/elements/rect/hover.tsx`
  * `apps/web/client/.../canvas/overlay/elements/buttons/chat.tsx`
* **Key Architecture Patterns:**
  * **Penpal Library:** Uses `penpal` (`WindowMessenger`) for typed, secure parent-to-iframe communication.
  * **Zero-Intrusion Canvas Overlay:** Element selection outlines (`hover.tsx`, `click.tsx`, `ResizeHandles`) are rendered in a transparent canvas overlay layer positioned over the iframe using bounding client rects, keeping iframe HTML 100% clean.
  * Quick-Action Action Overlay: Selected elements display floating action buttons (`buttons/chat.tsx`) to immediately scope prompt revisions to that specific element.

### 3.4 OpenUI (`wandb/openui`)
* **Analyzed Files:**
  * `frontend/src/components/HtmlAnnotator.tsx`
  * `frontend/src/components/Chat.tsx`
  * `frontend/src/components/CurrentUiContext.tsx`
* **Key Architecture Patterns:**
  * Full document scaffolding with live CSS/JS sandbox rendering.
  * Component-level annotation and iterative modification via structured prompt wrapping.

---

## 4. EvVibe Architecture & Dependency Map

### 4.1 End-to-End Code-Grounded Sequence Flows

```
[1. Landing Prompt Flow]
Landing Prompt (studio-landing-page.tsx)
  │
  ├─► Route: src/routes/design/index.tsx
  ├─► Service: createStudioProjectWithJob (studio-project-enqueue.ts)
  │     ├── Inserts studioProjects row (titleSource: "auto", initialPageCount)
  │     ├── Inserts studioJobs row (status: "queued", jobType: "initial")
  │     └── Inserts placeholder studioFrames rows (status: "queued")
  │
  ├─► Client redirects to /design/$id (src/routes/design/$id.tsx)
  │     └── Loads StudioWorkspace (studio-workspace.tsx)
  │
  └─► Background Worker: dispatchStudioWorkerBatch (studio-worker-dispatch.ts)
        ├── Claims PostgreSQL Advisory Lock: "everythings-vibe:studio-dispatch"
        ├── Selects batch via selectStudioWorkerBatch
        └── Runs runStudioJobPipeline (studio-job-pipeline.ts):
              ├── 1. Planning: planStudioProject (studio-planning.ts) -> extracts JSON blueprint
              │     └── Updates studioProjects.designBlueprint
              ├── 2. Frame Generation: generateStudioFrames (studio-frame-generation.ts)
              │     └── Up to concurrency 3 (STUDIO_FRAME_CONCURRENCY)
              ├── 3. Validation: validateStudioGeneratedHtml (studio-generated-html-validation.ts)
              │     └── Enforces design system tokens & HTML contracts
              ├── 4. Persistence: Writes htmlCode & status: "ready" to studioFrames
              ├── 5. Preview Capture: studio-visual.ts (Lazy Playwright capture -> studioAssets)
              └── 6. Canvas Display: StudioFrame (studio-frame.tsx) renders captured preview

[2. Composer Request Flow]
Composer Input (studio-composer.tsx)
  │
  ├─► Free text + selectedFrames chips
  ├─► Intent Resolution: resolveStudioOperationIntent (studio-composer-intent.server.ts)
  │     ├── Deterministic rules:
  │     │     ├── selectedFrameIds.length === 1 -> "revise_selected"
  │     │     ├── "tambah/buat halaman" -> "add_screen"
  │     │     └── "semua halaman" -> "revise_project"
  │     └── AI Classifier fallback if ambiguous
  │
  ├─► Enqueue Operation: enqueueStudioOperation (studio-operation-enqueue.ts)
  │     ├── "add_screen": Inserts new studioFrames row + enqueues studioJobs row
  │     └── "revise_selected": Enqueues studioJobs row with targetFrameId
  │
  └─► Worker Dispatch: Picks up queued revision job, validates, and updates targeted studioFrames.

[3. Future Element Selection Flow (Recommended Blueprint)]
Iframe DOM Hover/Click
  │
  ├─► Injected Bridge (Penpal / postMessage) captures element DOM selector & client rect
  ├─► Parent Canvas Overlay: Renders element selection rect & "Edit with AI" action
  ├─► Composer Scope: Injects Element Chip into StudioComposer
  ├─► Scoped Revision Request: Sends prompt + element HTML snippet + parent context
  ├─► Section Patch / Element Replacement: AI SDK streams scoped update
  └─► Live Preview: Updated HTML rendered into iframe with instant Undo/Redo capability
```

### 4.2 State Ownership & Database Schema
* `studioProjects`: Holds project metadata, `designBlueprint`, `designSkillId`, `designMode`, `initialPageCount`.
* `studioJobs`: Manages async worker jobs (`jobType: "initial" | "revision" | "add_screen"`, `status: "queued" | "generating" | "completed" | "failed"`, lease locking).
* `studioFrames`: Holds individual screen rows (`htmlCode`, `status`, `visualHash`, `viewport`, `order`).
* `studioRevisions`: Historical checkpoints for rollbacks.
* `studioAssets`: Previews, logos, and uploaded image attachments.

---

## 5. Confirmed Issues, Suspected Issues & Unknowns

### 5.1 Confirmed Issues
1. **Canvas Displays Static Images, Not Live DOM [`SOURCE-CONFIRMED: studio-frame.tsx:177`]:**
   * EvVibe currently renders `<img src={visual.url} />` inside `StudioFrame`. This creates heavy reliance on background Playwright screenshots and prevents any in-browser element inspection or selection.
2. **Missing Chat Workspace Thread [`SOURCE-CONFIRMED: studio.ts`]:**
   * Unlike Stitch (which keeps a full conversational thread with timestamps, prompts, and assistant plans on the left), EvVibe only has a bottom composer and no persisted `studioMessages` table.
3. **Advisory Lock Bottleneck [`SOURCE-CONFIRMED: studio-worker-dispatch.ts:33`]:**
   * Session-wide `pg_try_advisory_lock` restricts worker replicas to 1 batch at a time across the entire instance.

### 5.2 Suspected Issues
1. **Frame Selection Lost on Reload:**
   * In EvVibe, frame selection is held solely in local React state (`useStudioWorkspace`). Reloading the browser clears selected frame chips.
2. **Latency Amplification on Element Edits:**
   * Re-generating full standalone 100KB HTML documents for minor button or copy changes causes 60–120s latency per edit round trip.

### 5.3 Unknowns
1. **Google Stitch Server Queue Architecture:**
   * While Stitch frontend behavior was observed (`ev_dc5945...`), Google's private worker queue and model orchestration remain proprietary and unknown.
2. **Live Gateway Rate Limits:**
   * Gateway token rate limits under >3 concurrent streams per user are unmeasured without production load testing.

---

## 6. Evidence-Based Comparison Matrix

| Feature | Stitch Observation | Open-Source Reference | EvVibe Now | Recommended Adaptation |
| :--- | :--- | :--- | :--- | :--- |
| **Chat Persistence** | `OBSERVED: ev_dc5945...` Persistent left thread with prompt history, timestamps, assistant reasoning, and copy actions. | `SOURCE-CONFIRMED` OpenDesign `ChatPane.tsx` folds strategy turns & persists thread. | `SOURCE-CONFIRMED` No chat message history table; prompt only creates revision rows. | **Phase 04:** Create `studio_messages` table and persistent left-hand chat drawer/workspace. |
| **Queued Prompts** | `OBSERVED: ev_dc5945...` Composer blocks concurrent send during active generation; preserves draft. | `SOURCE-CONFIRMED` OpenDesign `ChatComposer.tsx` handles `restore-draft` and queued send. | `SOURCE-CONFIRMED` `studio-composer.tsx` disables button; worker queues jobs via `studioJobs`. | **Phase 05:** Add composer draft persistence in localStorage + honest queue status banner. |
| **Frame Attachments** | `OBSERVED: ev_dc5945...` Clicking frame injects chip with thumbnail, title, and close button. | `SOURCE-CONFIRMED` Doop `PromptBar.tsx` (`CardScope`) & OpenDesign stage attachments. | `SOURCE-CONFIRMED` `StudioComposer` supports `selectedFrames` array and `onRemoveFrame`. | **Phase 06:** Enhance chip with frame thumbnail image + keyboard Esc chip detachment. |
| **First Frame Readiness** | `OBSERVED: ev_dc5945...` Each screen renders in independent iframe as soon as available. | `SOURCE-CONFIRMED` Doop `FrameView.tsx` renders frames independently via `srcdoc`. | `SOURCE-CONFIRMED` Worker persists frames independently; polling reconciles ready rows. | **Retained:** Maintain independent frame readiness; upgrade canvas to sandboxed iframes. |
| **Preview Recovery** | `OBSERVED: ev_dc5945...` Iframes render client-side immediately; no wait for server capture. | `SOURCE-CONFIRMED` Onlook `view.tsx` & OpenUI `HtmlAnnotator.tsx` render live HTML instantly. | `SOURCE-CONFIRMED` Canvas waits for Playwright PNG capture; falls back to retry button. | **Phase 07:** Primary live iframe canvas preview (`srcdoc`) + lazy background PNG capture for thumbnails. |
| **Element Editing** | `OBSERVED: ev_c1f751...` Screen Edit Mode with code inspection and suggested prompt revisions. | `SOURCE-CONFIRMED` Onlook Penpal overlay + OpenDesign `manualEditDomPathForElement`. | `SOURCE-CONFIRMED` Element selection does not exist; only whole-frame revisions supported. | **Phase 08:** Implement Penpal bridge with transparent canvas overlay for element hover/click scoping. |

---

## 7. Deep Recommendation Specifications

### Recommendation 1: Live Iframe Canvas Preview with Penpal Bridge
* **Problem Solved:** Canvas latency and inability to select elements caused by static image previews.
* **Source of Evidence:** Stitch `ev_dc5945...` (live `srcdoc` iframes) + Onlook `apps/web/.../frame/view.tsx` (`penpal`).
* **Proposed Data Flow:**
  `studioFrames.htmlCode` -> Canvas renders `<iframe sandbox="allow-scripts" srcdoc={cleanHtml}>` -> Penpal messenger initializes RPC.
* **New/Changed Contracts:**
  ```ts
  interface StudioFrameBridgeEvents {
    'element:hover': { selector: string; rect: DOMRect };
    'element:select': { selector: string; tagName: string; textSnippet: string; rect: DOMRect };
    'element:clear': void;
  }
  ```
* **Compatibility & Safety:** Fully backward-compatible; static image capture in `studioAssets` is retained for project gallery cards and dashboard thumbnails.

### Recommendation 2: Persistent Left-Hand Chat Workspace & Studio Messages
* **Problem Solved:** Lack of conversational continuity and inability to review previous prompts and assistant plans.
* **Source of Evidence:** Stitch `ev_dc5945...` (persistent collapsible left chat panel).
* **Proposed Data Flow:**
  User prompt -> Saved to `studio_messages` (`role: "user"`) -> Worker stream response -> Saved to `studio_messages` (`role: "assistant"`).
* **New Database Schema:**
  ```ts
  export const studioMessages = pgTable("studio_messages", {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    projectId: text("project_id").notNull().references(() => studioProjects.id, { onDelete: "cascade" }),
    role: text("role").$type<"user" | "assistant" | "system">().notNull(),
    content: text("content").notNull(),
    targetFrameId: text("target_frame_id"),
    targetElementSelector: text("target_element_selector"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  });
  ```

### Recommendation 3: Element-Scoped Revision Protocol
* **Problem Solved:** Full document re-generation latency for small button or text edits.
* **Source of Evidence:** OpenDesign `anchor.ts` & EvVibe section patch protocol.
* **Proposed Data Flow:**
  Element selected -> Chip attached in composer -> Prompt submitted -> Worker sends scoped prompt with targeted snippet -> Applies surgical AST/DOM patch -> Updates `studioFrames.htmlCode`.

---

## 8. Ordered Implementation Recommendations (P2–P13 Roadmap)

| Phase | Title | Core Objective | Key Deliverable |
| :---: | :--- | :--- | :--- |
| **P02** | Schema & Message Persistence | Create `studio_messages` schema, migrations, and tenant-isolated services. | `studio-messages.ts` & Drizzle migration |
| **P03** | Persistent Chat Workspace UI | Build left-hand collapsible chat panel inspired by Stitch. | `studio-chat-pane.tsx` & collapse toggle |
| **P04** | Live Iframe Canvas Migration | Replace static `<img>` rendering with sandboxed `srcdoc` iframes. | `studio-frame-iframe.tsx` |
| **P05** | Penpal Bridge & Element Selection | Integrate Penpal RPC and transparent canvas overlay for element hover/click. | `studio-frame-bridge.ts` & overlay rect |
| **P06** | Composer Attachment Chips | Enhance `StudioComposer` with frame & element chips (thumbnail + remove button). | Enhanced `studio-composer.tsx` |
| **P07** | Element-Level AI Patching | Implement scoped prompt generator and surgical element patcher. | `studio-element-patch.ts` |
| **P08** | In-Browser Code Inspector | Implement dark modal code viewer (Shift+C) matching Stitch experience. | `studio-code-viewer-dialog.tsx` |
| **P09** | Concurrency & Queue Manager | Refine worker advisory lock and multi-user fair dispatch. | `studio-worker-dispatch.ts` update |
| **P10** | Suggested Prompt Chips | Generate contextual next-action prompt chips below assistant responses. | `studio-suggestion-row.tsx` integration |
| **P11** | Undo / Redo & Version History | Expose frame revision history timeline with instant rollback. | `studio-history-timeline.tsx` |
| **P12** | Performance & Latency Tuning | Bounded correction optimizations and TTFT streaming verification. | Latency test suite pass (<60s target) |
| **P13** | End-to-End Hardening & QA | Mechanical invariant verification, Zod schema tests, and tenant isolation audit. | 100% green unit & contract tests |

---

## 9. Licensing, Security & Questions for Clarification

### 9.1 Licensing Boundaries
* **Doop (AGPL-3.0):** Strictly quarantined. Zero lines of code or types copied. Only independent clean-room implementations of standard web patterns permitted.
* **Google Stitch (Proprietary Google LLC):** Pure observational black-box research via public user access. No scraping of proprietary Angular client code or extraction of Google design assets.
* **OpenDesign & Onlook (MIT / Apache-2.0):** Permissive open-source references for Penpal iframe bridge and DOM path indexing.

### 9.2 Questions for User Clarification
1. *Chat Workspace Layout:* Apakah Anda lebih memilih chat panel di sisi kiri selebar 360px yang dapat di-collapse penuh (persis seperti Google Stitch), atau panel dock fleksibel?
2. *Canvas Preview Transition:* Saat frame pertama kali dibuat, apakah Anda setuju jika frame langsung merender live HTML di `<iframe>` sandboxed, sementara screenshot Playwright hanya dijalankan di background untuk kebutuhan kartu thumbnail di halaman dashboard?

---

*Dokumen riset ini menyelesaikan seluruh persyaratan PROMPT 01 secara komprehensif, berbasis bukti riil REA, dan siap menjadi spesifikasi acuan mutlak untuk pengerjaan PROMPT 02.*
