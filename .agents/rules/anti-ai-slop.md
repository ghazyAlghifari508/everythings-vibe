# Comprehensive Directive: Anti-AI-Slop & High-Utility Product Design

> **MANDATORY SYSTEM DIRECTIVE FOR ALL AI AGENTS, ENGINEERS, AND REVIEWERS**
>
> This document is the authoritative rulebook for all user interface, layout, typography, interaction, and visual styling work in **everythings-vibe** (formerly PRDFY).
> For page family layout contracts, container sizing, breadcrumb rules, and structural consistency across sibling views, see the complementary mandatory rule [.agents/rules/design-layout-consistency.md](design-layout-consistency.md).
>
> ### Core Synthesis:
> 1. **PRODUCT CONCEPT & FEATURE VALUE: everythings-vibe**
>    everythings-vibe is an AI vibe-coding and product development ecosystem that transforms initial product ideas into complete, professional PRDs (8 sections), acceptance criteria (AC), task trees, and interactive Kanban boards, alongside VibeDesign Studio, VibeScrape, and Existing Codebase synchronization. It delivers guided clarifying questions, depth directives, live section revision patches, Mermaid diagrams, and real-time SSE generation.
>
> 2. **VISUAL DESIGN LANGUAGE & TOKENS: Clean Developer Workspace Console (`DESIGN.md`)**
>    The interface embodies the clean, content-first, utilitarian aesthetic of developer-grade tools (Linear, GitHub, Vercel):
>    - Primary canvas: Clean white (`#ffffff` / `--color-canvas-white`) or deep obsidian in dark theme
>    - Dominant typography: Deep ink black (`#0f0f0f` / `--color-ink`) or crisp white
>    - Secondary metadata: Muted graphite (`#606060` / `--color-graphite`)
>    - Structural hairline borders: Fine silver/mist (`#d3d3d3` / `border-border`)
>    - Primary actions: Solid ink black (`#0f0f0f`) with white text, or clean outlined pills
>    - Focused accent: Signal blue (`#065fd4`) / brand accent for links, interactive highlights, and focus states
>    - Elevation: Flat utility with razor-sharp 1px structural borders instead of heavy drop shadows
>
> ### The Core Mandate: Eradicating "Scared AI Syndrome"
> There are two equal and opposite failures in AI-generated software:
> - **Failure Mode A ("Cheap AI Slop"):** Tacky multi-color neon rainbow gradients, murky cartoonish 3D drop-shadows, nested capsule pills, pastel icon circles, and gratuitous emoji spam.
> - **Failure Mode B ("Scared AI Wireframe"):** Stripping the page down to a bare, sterile, white void with two lines of 12px text, empty boxes, and zero visual hierarchy out of fear of making a mistake.
>
> **BOTH MODES ARE UNACCEPTABLE FAILURES.**
> You are expected to design with **craft, courage, density, and discipline** — building rich, confident, fully formed SaaS surfaces that creator teams and business owners trust.

---

## 1. Complete Catalog of Prohibited AI Slop (Negative Constraints)

Any pull request, commit, or generated component containing the following patterns will be rejected immediately:

### 1.1 No "Pill-upon-Pill" Nesting (Nested Capsules)
- **The Slop:** Nesting rounded-full pill badges inside rounded-full pill buttons inside rounded-full cards, turning the entire screen into an amorphous cluster of lozenges.
- **The Rule:**
  - Cards and structural containers MUST use rectangular geometry with disciplined corner rounding: `rounded-xl` (`10px`–`12px`).
  - Form inputs and text fields use `rounded-md` or `rounded-lg` (`8px`–`10px`).
  - Standalone category filter chips or primary action pills use `rounded-full` (`18px`), but they must NEVER contain nested pill badges within themselves.
  - Geometry must convey structural hierarchy: outer containers are stable boxes; only discrete, clickable items take pill forms.

### 1.2 No Muddy, Exaggerated 3D Shadows
- **The Slop:** Applying massive, dark, blurry box-shadows (such as `shadow-xl`, `shadow-2xl`, or `shadow-[0_25px_50px_rgba(0,0,0,0.5)]`) to make flat UI cards appear to float off the screen like glossy stickers.
- **The Rule:**
  - Elevation is flat and architectural. Depth is established through **1px hairline borders** (`border border-[#d3d3d3]` or `border border-border`), background value contrast (e.g. `#ffffff` cards against `#f8f8f8` canvas), and disciplined whitespace.
  - Drop shadows are prohibited on cards, list items, hero banners, and inline elements.
  - Exception: High-priority floating overlays (dropdown menus, popover dialogs, modal dialogs) may use a subtle, tight, professional shadow (`shadow-sm` or `shadow-md` with low opacity `rgba(0,0,0,0.06)`).

### 1.3 No Neon Rainbow Gradients & Glowing Borders
- **The Slop:** Using garish multi-colored gradient text (e.g. purple-to-pink-to-cyan), pulsating glowing outline rings (`ring-2 ring-cyan-400 shadow-[0_0_20px_...]`), or multi-colored card backgrounds.
- **The Rule:**
  - The palette is strictly disciplined: solid white, ink `#0f0f0f`, graphite `#606060`, and silver `#d3d3d3`.
  - Gradient text is completely forbidden. Headlines are rendered in solid `#0f0f0f` or dark-mode text-snow.
  - Buttons use solid fills (solid ink `#0f0f0f` with crisp white text) or clean outlined borders (`border border-[#d3d3d3] hover:bg-[#f2f2f2]`).
  - Borders are static, razor-sharp, and neutral.

### 1.4 No Emoji Littering in UI Chrome
- **The Slop:** Prepending or appending emojis to navigation items, action buttons, table column headers, and status badges (e.g. `🚀 Start Free`, `✨ AI Magic`, `🔥 98 Score`, `💡 Pro Tip`).
- **The Rule:**
  - UI chrome must be 100% free of emojis.
  - Use monochromatic, crisp, hairline SVG line icons via the canonical Hugeicons primitive (`src/components/ui/icon.tsx`). `lucide-react` is deprecated across the codebase.
  - Icons must be functional indicators, sized strictly at `16px` to `20px` (default `18px`) with a `1.5px` hairline stroke weight, inheriting the color of the adjacent text (`#0f0f0f`, `#606060`, or `text-fog`/`text-snow`).

### 1.5 No Pastel Icon Circle Blobs
- **The Slop:** Wrapping every single SVG icon inside a rounded pastel-colored circle or square (e.g. a light-purple circle with a purple icon, a light-green circle with a green icon) stacked across a feature grid.
- **The Rule:**
  - Icons should sit cleanly and naturally alongside typography or inside a neutral, monochromatic container.
  - If a dedicated icon container is required, it must use a crisp hairline border (`border border-[#d3d3d3] bg-[#f8f8f8]` or `border-graphite bg-obsidian`) with an ink `#0f0f0f` or graphite `#606060` icon stroke.

### 1.6 No "Hospital Wireframe" Laziness (The Empty Void)
- **The Slop:** Rendering a page as a lone input box or two lines of plain text centered in an ocean of blank white space, calling it "minimalism".
- **The Rule:**
  - Minimalism means purposeful density and ruthless utility, NOT lack of content.
  - Every page must feature balanced layout composition: structured headers, informative secondary metadata, rich data presentation, clear action zones, and comprehensive contextual copy.

### 1.7 No "Functional Slop" & Spurious Control Bloat
- **The Slop:** Adding buttons, extra toolbars, redundant tabs, search inputs, filters, or technical labels simply to make a screen look busy, "feature-rich", or "complete", when the actions are already accessible or irrelevant to the user's immediate task.
- **The Rule:**
  - Every UI control must solve an established, genuine user need.
  - Never duplicate an action that is already available in the same contextual view (e.g. adding a "Lihat HTML Source" button directly beneath a preview pane when an "HTML Source" tab is already active and visible above it).
  - Never add controls (Search, Filter, Sort, Retry, Refresh, Export) speculatively. If there is no real dataset to search or filter, or if the screen is already in a success state, adding the control is forbidden functional slop.

---

## 2. Creative Architecture: How to Build Rich everythings-vibe Utility Surfaces

When designing any screen in everythings-vibe, apply the following design engineering principles to achieve density, confidence, and authority:

### 2.1 Confident Typographic Scale & Hierarchy
Do NOT let timid rules restrict your text sizes. Establish clear, bold contrast across information levels:
- **Hero Title (Landing Page):** Bold, prominent, and commanding. `text-4xl sm:text-5xl lg:text-6xl` (`36px`–`56px`), `font-bold` to `font-extrabold`, tracking `tracking-tight`, line-height `1.15`. It must clearly state the product's primary value proposition.
- **Section Headers:** `text-2xl sm:text-3xl` (`24px`–`30px`), `font-bold`, color `#0f0f0f` or `text-snow`.
- **Panel & Subsection Headers:** `text-lg sm:text-xl` (`18px`–`20px`), `font-semibold` (`--text-heading`).
- **Standard Body & Interface Labels:** `text-sm sm:text-base` (`14px`–`16px`), font weight `400` or `500`.
- **Secondary Metadata, Metrics, & Timestamps:** `text-xs` (`11px`–`12px`), font weight `500` in graphite `#606060` or `text-fog`, using tabular numbers (`font-mono` or `tabular-nums`) for timestamps, credits, and version numbers.

### 2.2 Rich Layout Composition & Visual Density
- **Global Header (Workspace Navigation):**
  - Height: `56px` fixed, background `#ffffff` or `bg-charcoal`, border-bottom `1px solid #e5e5e5` or `border-graphite`.
  - Left: Clean wordmark logo (`everythings-vibe` with crisp modern mark).
  - Center/Nav: Structured stage links (`Ask -> PRD -> AC -> Task -> Kanban`) with crisp hover states (`hover:text-[#0f0f0f]` or `hover:text-snow`).
  - Right: Quick CTA buttons, credit balance counter (e.g. tabular badge `Kredit: 10/10`), and Google/GitHub profile avatar.
- **Hero Ideation & Generation Showcase (Show, Don't Tell):**
  - Instead of abstract illustrations, display the real product mechanism: an interactive prompt input paired with a live, streaming 8-section PRD preview and Mermaid architecture diagram.
  - The preview must show dynamic section headers, revision patch indicators, and an interactive Table of Contents.
- **Direct Idea Ingress (The Generation Dropzone):**
  - Position an unmistakable, high-affordance input zone directly in the user's flow.
  - Styling: Border `2px dashed #c6c6c6`, hover state `border-[#0f0f0f] bg-[#f9f9f9]`, corner radius `12px`.
  - Clear guidance: Prompt icon, primary text *"Ketik ide produk atau upload brief di sini"*, secondary text *"AI akan menganalisis dan membuat PRD 8 seksi dalam hitungan menit"*, and an explicit *"Generate PRD"* pill button.
- **Bento Feature Grid (Solid Utility Cards):**
  - Asymmetrical or balanced 2x2 / 3-column grid.
  - Background: Flat `#ffffff`, border `1px solid #d3d3d3`, corner radius `12px`, padding `24px`.
  - Visual focal point: Each card must include a concrete visual demonstration of the feature (e.g. mini Mermaid diagram, live section diff patch, Kanban task card drag, export bundle preview).

### 2.3 Document Cards & Kanban Presentation
- **Canvas & Surface Fidelity:**
  - PRD Document: Standard clean readable prose width with sticky Table of Contents.
  - Kanban Board: Multi-column responsive board with clean task status columns (Backlog, Todo, In Progress, Review, Done).
- **Card Metadata Layering:**
  - Task card with feature tag pill in top corner (`bg-[#0f0f0f]/90 text-white text-xs px-1.5 py-0.5 rounded`).
  - Top badge for Generation Step: Solid, clean badge with step status, colored with high-contrast semantic green `#107c41` or ink `#0f0f0f`.
  - Card content: Task title (2 lines max with truncation), subtask checklist progress, priority indicator in `#606060`, and one-click action buttons (*"Detail Task"*, *"Status"*).

### 2.4 Exhaustive State Engineering (Never Leave a Broken State)
Every interactive surface must be explicitly designed for four fundamental states, while strictly preserving **state isolation** (controls belonging to one state must NEVER leak into another):
1. **Interactive / Active State:** Full data loaded, high visual hierarchy, clear hover and keyboard focus rings (`focus-visible:ring-2 focus-visible:ring-[#065fd4]`).
2. **Empty State:** When no projects or tasks exist:
   - Provide an informative, welcoming container.
   - Prominently feature the ideation input/prompt box.
   - Include a 3-step checklist explaining how the workflow operates (Ketik Ide -> Clarifying Questions -> Generate PRD & Task).
3. **Loading / Processing State:**
   - Skeleton screens MUST strictly match the geometry of the target content (title bar, section headers, text lines).
   - Display a deterministic multi-stage progress bar showing current operation: *Analyzing Brief -> Clarifying Questions -> Streaming PRD Sections -> Ready*.
4. **Error / Recovery State:**
   - Structured error banner with a neutral, helpful message in Indonesian.
   - Distinct, accessible *"Coba Lagi"* (Retry) button with keyboard support.
   - Clear recovery path (e.g. credit exhaustion modal with upgrade option).
   - **State Isolation Invariant:** Recovery actions (such as "Coba Lagi" / Retry) must appear **ONLY** in an actual error/failed state. They must NEVER be displayed when the operation has completed successfully or in a normal idle state.

---

## 3. Anti-Functional-Slop & UI Necessity Contract

> **MANDATORY ENFORCEMENT CONTRACT FOR ALL SURFACES**
>
> Functional slop occurs when UI is overloaded with buttons, nested toolbars, redundant tabs, search inputs, speculative filters, and technical debug prose that do not solve an established user need, are already available in the same context, or actively degrade user experience.
>
> All agents and developers must strictly adhere to the ten core tenets below:

### 3.1 Aturan Pokok (Core Tenets)
1. **Jangan membuat UI baru tanpa kebutuhan pengguna yang jelas.**
2. **Jangan menduplikasi tindakan yang sudah tersedia dalam konteks yang sama.**
3. **Jangan menambahkan tab hanya karena terdapat dua bentuk data internal yang berbeda.**
4. **Jangan menambahkan toolbar berlapis tanpa navigational hierarchy yang nyata.**
5. **Jangan menampilkan recovery action pada state sukses kecuali ada alasan yang terbukti.**
6. **Jangan menjadikan informasi teknis internal sebagai copy utama user-facing.**
7. **Jangan menambahkan Search, Filter, Sort, Retry, Refresh, Export, atau CTA secara otomatis hanya agar tampilan terlihat lebih lengkap.**
8. **Jangan menampilkan output analisis/internal reference sebagai konten produk yang sedang dibangun kecuali pengguna memintanya.**
9. **Jangan membuat dua komponen independen yang mengontrol aksi identik tanpa justification yang dapat diuji.**
10. **Jangan membuat abstraksi, dependency, state atau hook baru apabila solusi existing lebih sederhana dan memadai.**

### 3.2 Mandatory Existing-Action Audit

Sebelum menambahkan atau mengusulkan kontrol UI baru, agen **WAJIB** mengevaluasi alur keputusan audit berikut:

```
          PROPOSED UI CONTROL
                  │
                  ▼
        User need established?
                  │
          ┌───────┴────────┐
          │                │
         NO               YES
          │                │
          ▼                ▼
       REJECT       Existing action?
                           │
                   ┌───────┴─────────┐
                   │                 │
                  YES                NO
                   │                 │
                   ▼                 ▼
             REUSE EXISTING    Is it essential
             OR FIX EXISTING   in this state?
                                     │
                              ┌──────┴──────┐
                              │             │
                             NO            YES
                              │             │
                              ▼             ▼
                          OMIT /        IMPLEMENT
                          CONTEXTUAL     MINIMALLY
```

Sebelum implementasi, jawab secara internal 5 pertanyaan wajib ini:
- **Kebutuhan user apa yang diselesaikan?**
- **Apakah aksi ini sudah tersedia?**
- **Apakah kontrol harus selalu terlihat atau hanya pada state tertentu?**
- **Apakah penambahan ini meningkatkan clarity atau justru menambah decision burden?**
- **Bisakah masalah diselesaikan dengan memperbaiki komponen existing, bukan menambah komponen?**

> **Rule of Thumb:** Jika jawabannya tidak membenarkan keberadaan kontrol baru, **JANGAN DIBUAT**.

### 3.3 Navigation and Toolbar Density

Setiap surface harus memiliki hierarki navigasi yang jelas dan disiplin. Dilarang menumpuk toolbar tanpa struktur bertingkat.

- **Contoh Buruk (Spurious Toolbar Stacking):**
  ```
  [Visual] [HTML Source]           Toolbar A
  [DOM] [Screenshot]               Toolbar B
  [Lihat HTML Source] [Retry]      Toolbar C
  ```
- **Contoh Baik (Disciplined Hierarchical Navigation):**
  ```
  [Visual] [HTML Source]           Primary navigation
                       │
           only when Visual active
                       ▼
          [DOM] [Screenshot]       Relevant secondary mode
  ```
- **Aturan Kerapatan Toolbar:**
  - Toolbar kedua hanya dibenarkan jika pilihan tersebut benar-benar berbeda, relevan dengan mode aktif, dan bermanfaat bagi alur pengguna.
  - Toolbar ketiga tidak boleh muncul hanya untuk mengulangi tindakan existing atau menampung tombol-tombol yatim.
  - Tidak semua tampilan harus memiliki dua toolbar. Jika satu toolbar sudah cukup, gunakan **SATU SAJA**.

### 3.4 Contextual Action Discipline

Kontrol aksi harus terikat secara ketat pada state aktif dari komponen:

| State | Expected UI |
| :--- | :--- |
| **Preview normal** | Preview konten, kontrol tampilan yang relevan |
| **Preview failed** | Penjelasan kegagalan yang ramah pengguna + recovery action yang bermanfaat |
| **Screenshot successfully available** | Gambar screenshot, tanpa tombol retry yang redundant |
| **HTML Source** | Source viewer terformat, aksi khusus source (seperti Salin Kode) |
| **Image gallery** | Grid gambar dan filter yang benar-benar bermakna untuk dataset tersebut |

#### Anti-Patterns Terlarang:
- Menampilkan tombol "Retry" / "Coba Lagi" ketika komponen tidak mengalami kegagalan atau sudah sukses dimuat.
- Menampilkan tombol "Open Source" / "Lihat HTML Source" saat tab "HTML Source" sudah tersedia tepat di navigasi atasnya.
- Menampilkan banner status teknis internal yang tidak dapat ditindaklanjuti oleh pengguna akhir.
- Menambahkan tooltip sekadar untuk menjelaskan kontrol yang sebenarnya tidak perlu ada sejak awal.

> **Batasan Penting:** Jangan salah menafsirkan aturan ini sebagai larangan terhadap seluruh tombol retry, error state, accessibility alternatives, atau bantuan kontekstual. Aksi-aksi tersebut **tetap valid dan wajib ada** apabila kebutuhan dan kondisi state-nya memang mendukung secara riil.

### 3.5 Human-Centered Copywriting

Bahasa antarmuka mencerminkan profesionalisme dan kejelasan produk bagi pengguna akhir:

- **Larangan Copywriting:**
  - Istilah teknis internal, nama variabel backend, atau error code yang tidak membantu pengguna.
  - Penjelasan panjang lebar tentang pipeline crawling, worker queue, atau implementation details pada antarmuka utama.
  - Status dramatis, generik, atau hiperbolis untuk proses operasional sederhana.
  - Label tombol atau kartu yang menjelaskan cara kerja mesin sistem alih-alih manfaat langsung bagi pengguna.
  - Keterangan teks panjang yang ditambahkan hanya demi mengisi ruang kosong agar layout terlihat "penuh".
- **Aturan Copywriting:**
  - Copy ditulis singkat, jelas, padat, dan natural dalam **Bahasa Indonesia**.
  - Tampilkan secara transparan apa yang sedang terjadi dan apa tindakan konkret yang dapat diambil oleh pengguna.
  - Technical details tetap diperbolehkan, namun ditempatkan pada area detail/inspeksi sekunder yang relevan (misal accordion metadata atau raw response viewer), bukan pada hero atau action bar utama.

### 3.6 Agent Design Handoff Boundaries

Agen sering kali keliru menafsirkan aset referensi desain dan menyulapnya menjadi konten produk:

- **Referensi Desain vs Konten Produk:** Design references (`DESIGN.md`, screenshot panduan, brand guidelines) berfungsi murni untuk mengatur token styling (warna, tipografi, radius, border, spacing), **BUKAN otomatis menjadi konten halaman produk**.
- **Tanpa Izin Penambahan Fitur:** Screenshot, `DESIGN.md`, dan brand reference **TIDAK** memberikan izin kepada agen untuk menambah seksi halaman baru, tombol baru, atau fitur baru yang tidak diminta dalam spesifikasi.
- **Dilarang Membocorkan Artefak Internal:** Dilarang keras memindahkan palette inspector, token tables, debug panels, atau dokumentasi desain internal ke dalam website/aplikasi end-user kecuali pengguna memintanya secara eksplisit.
- **Preserve Scope:** Selalu pertahankan batasan ruang lingkup produk (*product scope*) dan functional requirements yang sudah disepakati.

---

## 4. Concrete Design Tokens Reference

When writing CSS / Tailwind classes, map strictly to these authoritative values:

| Element | Token / Value | Tailwind Equivalent | Purpose |
|---|---|---|---|
| **Canvas** | `#ffffff` | `bg-white` | Default background for pages, cards, sidebars |
| **Surface Alt** | `#f8f8f8` | `bg-[#f8f8f8]` | Table headers, secondary containers, input backgrounds |
| **Hover Fill** | `#f2f2f2` | `hover:bg-[#f2f2f2]` | Hover state for buttons, list items, nav links |
| **Text Primary** | `#0f0f0f` | `text-[#0f0f0f]` | All headlines, card titles, active icons, primary button text |
| **Text Secondary**| `#606060` | `text-[#606060]` | Subtitles, descriptive copy, metadata, inactive nav labels |
| **Text Tertiary** | `#909090` | `text-[#909090]` | Micro-copy, disabled states, placeholder text |
| **Hairline Border**| `#d3d3d3` | `border-[#d3d3d3]` | Primary card borders, input borders, button outlines |
| **Divider Line**  | `#e5e5e5` | `border-[#e5e5e5]` | Nav dividers, table borders, section split lines |
| **Accent Action** | `#065fd4` | `text-[#065fd4]` | Hyperlinks, focus rings, outlined authentication buttons |
| **Metric Success**| `#107c41` | `text-[#107c41]` | Completed progress, credit balance, success checks |
| **Card Radius**   | `10px`–`12px` | `rounded-xl` | All cards, document containers, bento boxes |
| **Button Radius** | `18px` | `rounded-full` | Pills, chips, primary CTA buttons |
| **Input Radius**  | `8px` | `rounded-lg` | Text inputs, dropdown selects, textareas |

---

## 5. Verification & QA Checklist

Before finalizing any frontend work or opening a PR, verify every item across both checklists:

### 5.1 PR Self-Review Checklist (Anti-Functional-Slop & UI Necessity)
- [ ] **Existing action audit completed** (Evaluated with the 5 mandatory audit questions)
- [ ] **No duplicate user actions** (No action repeated in the same view or toolbar)
- [ ] **No unnecessary new controls** (No speculative search, filters, or buttons added without need)
- [ ] **No more navigation layers than necessary** (Single toolbar where sufficient; secondary only when strictly justified)
- [ ] **Every state-specific control appears in the right state** (Recovery actions isolated to error states; no retry on success)
- [ ] **No internal/debug copy in primary UI** (User-facing copy is natural Indonesian, devoid of backend jargon)
- [ ] **No invented product features or sections** (Scope strictly bounded; design tokens are styles, not page content)
- [ ] **Existing components reused where appropriate** (No duplicate wrappers or custom buttons when primitives exist)
- [ ] **Mobile and desktop interaction considered** (Touch targets $\ge$ 44px, no horizontal overflow)
- [ ] **Keyboard/a11y behavior preserved** (Focus rings visible, semantic roles, aria-labels on icon buttons)
- [ ] **No needless abstraction or code expansion** (Simple, idiomatic solutions over complex hooks/state)

### 5.2 Visual & Structural Verification Checklist
- [ ] **No AI Slop Check:** Are there zero 3D drop-shadows, zero pastel icon circles, zero emoji in UI chrome, zero nested pills, and zero functional slop bloat?
- [ ] **No Scared Minimalist Check:** Does the screen look like a real, rich, finished commercial SaaS product rather than an abandoned wireframe?
- [ ] **Typography Check:** Is the headline clear and properly scaled? Is there strong visual hierarchy between title, body, and metadata?
- [ ] **Console Styling Check:** Are borders hairline 1px? Is the background clean white/dark-obsidian and text deep ink black/crisp snow?
- [ ] **everythings-vibe Value Check:** Is the AI product generation concept or workspace tool prominently and cleanly displayed?
- [ ] **Layout Consistency Check:** Does the page respect its design family shell, container constraints, and breadcrumb rules in [.agents/rules/design-layout-consistency.md](design-layout-consistency.md)?
- [ ] **State Completeness Check:** Are loading, empty, and error states fully designed with actionable next steps while respecting state isolation?
- [ ] **Responsive Verification:** Does the interface adapt seamlessly from 320px mobile up to 1440px desktop without horizontal scrolling?
