# VibeDesign Studio — Component-First Prototype Quality & Reusable UI Strategy

## 1. Executive Summary & Context

VibeDesign Studio generates high-fidelity, standalone, single-file HTML/Tailwind CSS prototypes for web and mobile applications.
Recent prototype generations (such as the Metriq SaaS finance application) exhibited several recurring layout and visual quality defects:
- Wide data tables (e.g. Transaction history) clipped off the right side of desktop frames.
- Content clipping and overflow due to fixed pixel widths and unconstrained flex/grid containers.
- Cramped forms and data tables lacking structural separation.
- Generic "cookie-cutter" dashboard layouts applied indiscriminately across diverse product domains.
- Lack of visual hierarchy and proper typographic contrast.

This document establishes the **Component-First Design Strategy** and domain-aware architecture for generated prototypes, investigating industry-standard component registries and adapting their best patterns into zero-runtime, standalone HTML/CSS components.

---

## 2. Evaluation of External UI Libraries & Component Systems

The original six-system review is retained below. P5 covers navigation in [p5-implementation.md](prompt-design-studio/p5-implementation.md); P6 updates component selection, current licenses and quality boundaries in [p6-implementation.md](prompt-design-studio/p6-implementation.md). Use the current review for adoption decisions, not historical license assumptions.

| Component System | Source & License | Nature & Tech Stack | Applicability to Studio Prototypes | Adopted Patterns / Decisions |
| :--- | :--- | :--- | :--- | :--- |
| **shadcn/ui** | [ui.shadcn.com](https://ui.shadcn.com/) (MIT) | React 19, Radix Primitives, Tailwind CSS | **High (Structural & CSS)**. Studio application already uses shadcn primitives (`src/components/ui/`). For generated prototypes, Radix runtime cannot execute in static HTML, but its Tailwind utility combinations and accessible DOM structures map 1:1. | Data table layout with bounded scroll wrapper, Card with Header/Title/Content structure, input field groups with floating/stacked labels, badge variants. |
| **HeroUI v3** | [heroui.com](https://www.heroui.com/) ([Apache-2.0](https://github.com/heroui-inc/heroui/blob/v3/LICENSE)) | React Aria components; installed in the host application | **High (Composition)**. React state stays outside standalone frames. | Native choice rows adopt separate control, label, description and price tracks with associated descriptions; no automatic semantic tint or indicator dot. |
| **Magic UI** | [magicui.design](https://magicui.design/) (free library MIT; Pro separate) | React, Tailwind, optional Motion | Layout reference only; no source or runtime adopted in P6. | Unequal grids only when the content needs them; no default bento mosaic or KPI quota. |
| **React Bits** | [reactbits.dev](https://reactbits.dev/) ([MIT + Commons Clause](https://github.com/DavidHDev/react-bits/blob/main/LICENSE.md)) | React, CSS animations, Canvas | No P5 source adoption. Redistribution restrictions require separate review for reusable generated component/template products. | No animation or visual-effect runtime added. |
| **Thinking Orbs** | [thinkingorbs.com](https://www.thinkingorbs.com/) ([MIT](https://github.com/yogesharc/thinking-orbs/blob/main/packages/thinkingorbs/LICENSE)) | React, dependency-free JS and SwiftUI AI-status indicators | No matching navigation/layout need in P5. The catalog is not WebGL-only. | No animated status indicator added. |
| **affectUI** | [affectui.com](https://www.affectui.com/) ([license](https://www.affectui.com/license)) | Self-contained React/TSX components with inline styles | Mixed catalog: free MIT items and commercial Pro items. Not a blanket-MIT Tailwind library. | No P5 source adoption; no Pro source copied or redistributed. |

---

## 3. Technical Constraints: Standalone HTML vs React Runtime

**Critical Architecture Invariant:**
Generated Studio frames are rendered inside an isolated, sandboxed iframe or captured via Playwright as standalone HTML documents.
- React components, JSX runtime, Radix headless state hooks, and client-side bundlers **DO NOT RUN** inside the generated HTML.
- Introducing a React/bundler build step into the iframe preview would introduce massive latency, bundle overhead, hydration mismatches, and fragile failure points.
- **Solution:** Reuse semantic native HTML and component-owned inline CSS. P6 adapts shadcn Field/RadioGroup, Alert and media anatomy plus HeroUI choice hierarchy without copying runtime-dependent component source.

---

## 4. Authoritative Reusable Component Patterns (HTML/CSS)

### 4.1 Bounded Data Table (Anti-Clipping Pattern)
*Root Cause:* Tables with 6+ columns inside flex or grid containers without `min-w-0` expand parent containers or clip on the right.
*Solution Pattern:* Always wrap tables in a container with `overflow-x-auto` and `min-w-0`.

```html
<div class="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] overflow-hidden" data-card>
  <div class="p-4 sm:p-6 border-b border-[var(--app-border)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
    <div>
      <h3 class="font-semibold text-base text-[var(--app-ink)]">Transaksi Terbaru</h3>
      <p class="text-xs text-[var(--app-muted)] mt-0.5">Daftar arus kas masuk dan keluar periode ini.</p>
    </div>
    <div class="flex items-center gap-2">
      <input type="search" placeholder="Cari transaksi..." aria-label="Cari transaksi"
             class="text-xs px-3 py-1.5 rounded-lg border border-[var(--app-border)] bg-transparent text-[var(--app-ink)] focus:outline-none focus:ring-1 focus:ring-[var(--app-primary)]" />
    </div>
  </div>
  <!-- BOUNDED TABLE CONTAINER -->
  <div class="overflow-x-auto w-full max-w-full" data-table-container="1">
    <table class="w-full text-left text-sm border-collapse min-w-[560px]">
      <caption>Data contoh; ganti dengan data brief/PRD atau tampilkan keadaan kosong yang jujur.</caption>
      <thead>
        <tr class="border-b border-[var(--app-border)] bg-[var(--app-canvas)]/50 text-xs font-semibold text-[var(--app-muted)]">
          <th class="py-3 px-4">Tanggal</th>
          <th class="py-3 px-4">Kategori / Keterangan</th>
          <th class="py-3 px-4">Metode</th>
          <th class="py-3 px-4 text-right">Nominal</th>
          <th class="py-3 px-4 text-center">Status</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-[var(--app-border)] text-xs text-[var(--app-ink)]">
        <tr class="hover:bg-[var(--app-canvas)]/30 transition-colors">
          <td class="py-3 px-4 whitespace-nowrap text-[var(--app-muted)]">24 Mar 2026</td>
          <td class="py-3 px-4">
            <div class="font-medium text-[var(--app-ink)] truncate max-w-[200px]" title="Langganan Server Cloud">Langganan Server Cloud</div>
            <div class="text-[10px] text-[var(--app-muted)]">Operasional IT</div>
          </td>
          <td class="py-3 px-4 whitespace-nowrap text-[var(--app-muted)]">BCA Transfer</td>
          <td class="py-3 px-4 text-right font-mono font-medium whitespace-nowrap text-rose-600">- Rp 2.450.000</td>
          <td class="py-3 px-4 text-center whitespace-nowrap">
            <span class="text-sm">Contoh: Berhasil</span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</div>
```

### 4.2 Two-Column Desktop Form & Table Layout
Use this composition only when data entry and comparison belong on the same screen. On desktop (`lg:` $\ge$ 1024px), they may share a 12-column grid; narrower screens stack. A history screen, checkout or public website needs its own composition, not this default.

```html
<div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
  <!-- Form Column (5 cols) -->
  <div class="lg:col-span-5 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-5 sm:p-6" data-card>
    <h3 class="font-semibold text-base text-[var(--app-ink)]">Catat Transaksi Baru</h3>
    <form class="mt-4 space-y-4">
      <div class="space-y-1.5">
        <label for="trx-type" class="text-xs font-medium text-[var(--app-ink)]">Jenis Transaksi</label>
        <select id="trx-type" class="w-full text-sm rounded-lg border border-[var(--app-border)] p-2.5 bg-transparent">
          <option value="expense">Pengeluaran</option>
          <option value="income">Pemasukan</option>
        </select>
      </div>
      <div class="space-y-1.5">
        <label for="trx-amount" class="text-xs font-medium text-[var(--app-ink)]">Nominal (Rp)</label>
        <input id="trx-amount" type="text" placeholder="Contoh: 150.000" class="w-full text-sm font-mono rounded-lg border border-[var(--app-border)] p-2.5 bg-transparent" />
      </div>
      <button type="submit" data-primary class="w-full py-2.5 px-4 rounded-lg font-medium text-sm transition-opacity">Simpan Transaksi</button>
    </form>
  </div>

  <!-- Table Column (7 cols) -->
  <div class="lg:col-span-7 min-w-0">
    <!-- Bounded Table component here -->
  </div>
</div>
```

### 4.3 Task-Specific Summary Content

Metrics are optional, not a mandatory row. Brief/PRD facts determine which summaries exist. Explicitly illustrative values remain visibly labeled as sample data; missing evidence produces a useful empty state, never invented growth, satisfaction or performance claims. Shared tokens do not imply identical card grids across discovery, customization, tracking and case studies.

---

## 5. Domain-Aware Quality Contract

Different application domains have distinct UX and visual composition models:

| Application Domain | Primary Focal Point | Typical Layout Structure | Recommended Components | Anti-Patterns to Avoid |
| :--- | :--- | :--- | :--- | :--- |
| **Finance / Accounting SaaS** | Task-relevant balance, entry or history | Summary, form, comparison table or payment detail by task | Atomic formatted currency, bounded tables, grounded payment states | Mandatory KPI quota, unwrapped tables, invented growth metrics |
| **E-Commerce / Retail** | Discovery, customization, checkout or tracking | Relevant list/grid, readable full-width choice rows, price/action tracks, timeline | Whole-product media, descriptions associated with controls, nonshrinking recommendation tracks | Cropped product silhouettes, prices hiding option labels, invented availability |
| **Creative Portfolio** | Featured work, case studies and contact | Editorial hero, readable project media, narrative blocks | Purposeful public navigation, direct contact action | Financial dashboard filler, invented client credentials or testimonials |
| **Travel & Booking** | Destination search, itinerary, trips or profile | Search fields, contained horizontal cards, ordered schedules or personal settings | Readable dates, atomic price/unit, intentional photography crop | Shrinking wide cards, unrelated charts or placeholder map holes |
| **Developer Tools / Admin** | Relevant operations and records | Task-specific workspace with useful density | Bounded logs/tables, contextual controls, evidence-backed statuses | Fake live dots, empty toolbar controls, decorative terminal hero |

---

## 6. Shared Shell and Layout Boundaries

```
┌─────────────────────────────────────────────────────────────┐
│ SHARED CANONICAL SHELL (Deterministic Studio Assembly)       │
│ - Header: public brand + navbar; app brand; mobile title    │
│ - Navigation: public top menu; app sidebar/top; mobile tabs │
│ - Design Tokens: CSS Variables (--app-primary, etc.)        │
├─────────────────────────────────────────────────────────────┤
│ AI-GENERATED SCREEN BODY (<main data-studio-content>)       │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Task-specific hierarchy: discovery, form, narrative, etc.│ │
│ │ Primary action and relevant supporting content          │ │
│ │ Component-owned controls, media and contained scrolling │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

The AI generator is instructed to produce strictly the contents of `<main data-studio-content>`.
The deterministic assembly service (`studio-canonical-shell.ts`) guarantees that global headers and navigation are never duplicated or corrupted.
