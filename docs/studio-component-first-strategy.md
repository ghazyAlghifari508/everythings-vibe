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

Per task requirements, six component ecosystems were investigated to determine applicable architectural patterns and implementation boundaries:

| Component System | Source & License | Nature & Tech Stack | Applicability to Studio Prototypes | Adopted Patterns / Decisions |
| :--- | :--- | :--- | :--- | :--- |
| **shadcn/ui** | [ui.shadcn.com](https://ui.shadcn.com/) (MIT) | React 19, Radix Primitives, Tailwind CSS | **High (Structural & CSS)**. Studio application already uses shadcn primitives (`src/components/ui/`). For generated prototypes, Radix runtime cannot execute in static HTML, but its Tailwind utility combinations and accessible DOM structures map 1:1. | Data table layout with bounded scroll wrapper, Card with Header/Title/Content structure, input field groups with floating/stacked labels, badge variants. |
| **HeroUI** (NextUI) | [heroui.com](https://www.heroui.com/) (MIT) | React, Tailwind Variants, Framer Motion | **High (Visual & Chips)**. Runtime dependencies (Framer Motion) excluded from static frames, but visual aesthetics (soft surface contrast, status chips with indicator dots, rounded stat cards) adapted directly. | Status chips (`Berhasil`, `Tertunda`, `Gagal`) with semantic indicator pips; modern segmented stats cards. |
| **Magic UI** | [magicui.design](https://magicui.design/) (MIT) | React, Tailwind, Framer Motion | **Medium (Layout Only)**. Heavy JS animations and canvas components excluded to prevent runtime errors in static iframes. Bento-grid layout structures (`grid-cols-1 md:grid-cols-3`) adopted. | Structural bento grid containers for high-density overview cards. Pure CSS transitions only. |
| **React Bits** | [reactbits.dev](https://reactbits.dev/) (MIT) | React, CSS animations, Canvas | **Low-Medium**. Creative micro-interactions and CSS gradient utilities. Interactive canvas scripts excluded. | Pure CSS hover transitions, hairline divider accents. |
| **Thinking Orbs** | [thinkingorbs.com](https://www.thinkingorbs.com/) | WebGL / Canvas interactive orbs | **Inapplicable**. Requires WebGL/canvas JavaScript runtime that violates static prototype stability and triggers "AI slop" (distracting background glowing spheres). | Explicitly rejected for utility SaaS. Replaced by restrained CSS background tints if needed. |
| **Affect UI** | [affectui.com](https://www.affectui.com/) (MIT) | Tailwind CSS enterprise components | **High (Dashboard & Data UX)**. Rich enterprise data tables, faceted filter bars, metric trend cards with delta badges, and audit log list patterns. | Metric cards with percentage delta badges, two-column form-and-table management views, search/filter toolbars. |

---

## 3. Technical Constraints: Standalone HTML vs React Runtime

**Critical Architecture Invariant:**
Generated Studio frames are rendered inside an isolated, sandboxed iframe or captured via Playwright as standalone HTML documents.
- React components, JSX runtime, Radix headless state hooks, and client-side bundlers **DO NOT RUN** inside the generated HTML.
- Introducing a React/bundler build step into the iframe preview would introduce massive latency, bundle overhead, hydration mismatches, and fragile failure points.
- **Solution:** Establish pre-tested, semantic HTML + Tailwind CSS component patterns that embody the ergonomics, accessibility, and visual polish of shadcn/ui and Affect UI without requiring any JavaScript runtime.

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
            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
              <span class="h-1 w-1 rounded-full bg-emerald-500"></span>Berhasil
            </span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</div>
```

### 4.2 Two-Column Desktop Form & Table Layout
*Structure:* On desktop (`lg:` $\ge$ 1024px), place the data entry form and the summary table side-by-side using a 12-column grid (`lg:grid-cols-12`). On narrower screens, stack vertically.

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

### 4.3 Summary Metric Cards Row
```html
<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
  <div class="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-4 sm:p-5" data-card>
    <div class="flex items-center justify-between text-xs text-[var(--app-muted)] font-medium">
      <span>Total Pemasukan</span>
      <span class="inline-flex items-center text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded text-[10px] font-semibold">+12.5%</span>
    </div>
    <div class="mt-2 text-2xl font-bold font-mono tracking-tight text-[var(--app-ink)] whitespace-nowrap">Rp 48.250.000</div>
    <p class="mt-1 text-[11px] text-[var(--app-muted)]">34 transaksi bulan ini</p>
  </div>
</div>
```

---

## 5. Domain-Aware Quality Contract

Different application domains have distinct UX and visual composition models:

| Application Domain | Primary Focal Point | Typical Layout Structure | Recommended Components | Anti-Patterns to Avoid |
| :--- | :--- | :--- | :--- | :--- |
| **Finance / Accounting SaaS** | Net Cash Flow & recent activity | Two-column desktop (Form + Table) with top KPI metrics bar | Formatted currency, delta chips, bounded transaction table, category breakdown | Unwrapped wide table, tiny unreadable inputs, purple neon glow |
| **E-Commerce / Retail** | Product visual & checkout flow | Filter sidebar + multi-column product card grid | Product cards with price tags, cart drawer summary, stock badge | Plain data table with no images, cramped product listings |
| **Creative Portfolio** | Featured projects & case studies | Asymmetric hero grid, visual media showcase, narrative blocks | Project showcase cards, clean tag chips, direct contact action | Heavy enterprise data tables, generic SaaS metrics |
| **Travel & Booking** | Search / destination selector & dates | Date-range input bar + itinerary cards + booking summary | Slot picker, price breakdown list, itinerary timeline, map placeholder | Overcrowded tables, lack of date/price prominence |
| **Developer Tools / Admin** | System health & deployment logs | Monospaced status metrics, audit table, action bars | Code snippets (`<pre><code>`), terminal output box, status indicators | Unrestrained decorative gradients, missing search filters |

---

## 6. Shared Shell and Layout Boundaries

```
┌─────────────────────────────────────────────────────────────┐
│ SHARED CANONICAL SHELL (Deterministic Studio Assembly)       │
│ - Global Header: Brand Logo, Application Title, Screen Name │
│ - Global Navigation: Sidebar (Web) or Bottom Tabs (Mobile)  │
│ - Design Tokens: CSS Variables (--app-primary, etc.)        │
├─────────────────────────────────────────────────────────────┤
│ AI-GENERATED SCREEN BODY (<main data-studio-content>)       │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Screen Title & Action Bar (e.g. Catat Transaksi, Export)│ │
│ ├─────────────────────────────────────────────────────────┤ │
│ │ Summary Metrics Cards                                   │ │
│ ├─────────────────────────────────────────────────────────┤ │
│ │ Feature Content: Two-column Form & Bounded Table        │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

The AI generator is instructed to produce strictly the contents of `<main data-studio-content>`.
The deterministic assembly service (`studio-canonical-shell.ts`) guarantees that global headers and navigation are never duplicated or corrupted.
