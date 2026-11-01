/**
 * Component-first design patterns adapted for standalone HTML/Tailwind prototypes.
 * Derived from shadcn/ui, HeroUI, and Affect UI architectures.
 *
 * Ensures generated frames have bounded overflow, robust typography,
 * consistent visual density, and domain-appropriate layout composition.
 */

export const STUDIO_COMPONENT_FIRST_GUIDANCE = `COMPONENT-FIRST DESIGN PATTERNS (STANDALONE HTML/TAILWIND):
- Bounded Data Table: ALWAYS wrap any <table> in an overflow container:
  <div class="overflow-x-auto w-full max-w-full" data-table-container="1">
    <table class="w-full text-left text-sm border-collapse min-w-[560px]">
  Never allow wide tables to expand flex/grid parents or clip at the screen edge.
- Two-Column Layout on Desktop: For management/transaction views on web, arrange form and table side-by-side:
  <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
    <div class="lg:col-span-5" data-card>...Form...</div>
    <div class="lg:col-span-7 min-w-0">...Table with data-table-container...</div>
  </div>
  On mobile (< 1024px), columns naturally stack vertically (1 column).
- Form Controls & Groups: Keep form inputs, selects, and textareas constrained:
  <div class="space-y-1.5">
    <label for="id" class="text-xs font-medium text-[var(--app-ink)]">Label</label>
    <input id="id" class="w-full text-sm rounded-lg border border-[var(--app-border)] p-2.5 bg-transparent" />
  </div>
  Always pair <label for="id"> with <input id="id"> for accessibility.
- Metric / KPI Cards: Group metrics into structured cards with label, formatted value, and change badge:
  <div class="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-4" data-card>
    <div class="text-xs text-[var(--app-muted)] flex justify-between"><span>Total Inflow</span><span class="text-emerald-600 font-semibold">+12%</span></div>
    <div class="text-2xl font-bold font-mono text-[var(--app-ink)] mt-1 whitespace-nowrap">Rp 45.000.000</div>
  </div>
- Long Text & Currency:
  - Format currency cleanly with digit grouping (e.g. "Rp 125.500.000"), using whitespace-nowrap and tabular numbers.
  - Apply truncate or break-words on customer names, descriptions, or long labels so they never push columns out.
- Empty States: When a list or table is empty, render an informative box with an icon, Indonesian explanation, and action button:
  <div class="text-center py-10 px-4 border border-dashed border-[var(--app-border)] rounded-xl" data-card>
    <p class="font-medium text-sm text-[var(--app-ink)]">Belum ada data transaksi</p>
    <p class="text-xs text-[var(--app-muted)] mt-1">Mulai dengan mencatat pemasukan atau pengeluaran pertama.</p>
  </div>`;

export function getDomainQualityContract(prompt?: string): string {
	const lower = (prompt ?? "").toLowerCase();
	if (
		lower.includes("transaksi") ||
		lower.includes("uang") ||
		lower.includes("keuangan") ||
		lower.includes("finansial") ||
		lower.includes("finance") ||
		lower.includes("kas") ||
		lower.includes("anggaran")
	) {
		return `DOMAIN-SPECIFIC UX (Finance / Accounting SaaS):
- Primary focus: Net cash flow, balance clarity, recent transactions, and category breakdown.
- Desktop layout: Summary KPI cards at top, followed by two-column workspace (Transaction Entry Form on left, Filterable Transaction History Table on right).
- Currency presentation: Formatted rupiah/currency values with digit separators and font-mono.
- Status badges: Distinguish 'Berhasil' (emerald), 'Tertunda' (amber), 'Gagal' (rose).`;
	}
	if (
		lower.includes("toko") ||
		lower.includes("katalog") ||
		lower.includes("produk") ||
		lower.includes("belanja") ||
		lower.includes("ecommerce") ||
		lower.includes("shop")
	) {
		return `DOMAIN-SPECIFIC UX (E-Commerce / Catalog):
- Primary focus: Product discovery, clear pricing, category navigation, and cart affordances.
- Layout: Filter/category bar, balanced responsive grid of product cards with clean image placeholders, price, and primary action button.`;
	}
	if (
		lower.includes("travel") ||
		lower.includes("tiket") ||
		lower.includes("hotel") ||
		lower.includes("pesawat") ||
		lower.includes("itinerary")
	) {
		return `DOMAIN-SPECIFIC UX (Travel & Hospitality):
- Primary focus: Search parameters (origin, destination, date range), slot/flight comparison cards, and itinerary timelines.`;
	}
	if (
		lower.includes("portfolio") ||
		lower.includes("portofolio") ||
		lower.includes("cv") ||
		lower.includes("karya")
	) {
		return `DOMAIN-SPECIFIC UX (Portfolio / Creative Showcase):
- Primary focus: Featured works, case study highlights, technical capabilities, and direct contact callouts.
- Visual rhythm: Prominent media showcase cards with tag pills rather than heavy data tables.`;
	}
	return `DOMAIN-SPECIFIC UX (Professional Web Application):
- Tailor components strictly to user journey: clear screen title, high-utility cards, contextual actions, and appropriate data density.`;
}
