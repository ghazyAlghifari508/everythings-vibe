import { STUDIO_COMPONENT_PATTERNS } from "./studio-component-patterns";

/**
 * Component-first design patterns adapted for standalone HTML/Tailwind prototypes.
 * Derived from shadcn/ui, HeroUI, and Affect UI architectures.
 *
 * Ensures generated frames have bounded overflow, robust typography,
 * consistent visual density, and domain-appropriate layout composition.
 */

export const STUDIO_COMPONENT_FIRST_GUIDANCE = `COMPONENT-FIRST DESIGN PATTERNS (STANDALONE HTML/CSS):
- The following data-ui patterns receive shared inline CSS from Studio. Adapt content to the brief; do not copy sample records or add controls without a user need:
${STUDIO_COMPONENT_PATTERNS.map((pattern) => `${pattern.name}: ${pattern.html}`).join("\n")}
- Search: keep clear action in its own 44px flex track, never absolute over input text. The visible glyph stays small.
- Control sizing belongs to the component you write. Studio does not resize every button, input and select: it guarantees a touch target only for the screen's single primary action (data-primary or button[type=submit]). Style the rest yourself, and keep a small control small: a quantity stepper stays ~36px square with a 40px value track, a radio stays a native radio, an icon button stays square. Mark the screen's one main action with data-primary; leave every other action quiet. A control you keep visually small still needs a real hit area: keep it at least 24px tall (the stepper pattern's buttons are 36px), and let the primary action carry the 44px touch target.
- Media declares its role instead of inheriting a shared ratio: data-media="product" and "thumb" (4/3), "banner" (16/9), "promo" (21/9), "avatar" (1/1), "logo" (contain, no ratio), "photo" (your own ratio, object-fit:cover). A product container you designed as 16/10 stays 16/10: declare the ratio on the component and do not let a global rule decide for it.
- A horizontal carousel keeps its own track: data-ui="carousel" children are flex:0 0 auto and scroll inside the track. A card inside a carousel keeps the width its component declares; it is never squeezed to the column.
- The outer gutter is var(--app-gutter) (16px on compact density, 24px on comfortable). The canonical content region already applies it: do not wrap the screen in a second padded container.
- Segments: preserve full labels in nonshrinking buttons with contained horizontal scrolling; never squeeze them into narrow tracks.
- Dropdown: prefer a labeled native select; custom chevrons need a separate nonshrinking track and right inset.
- Group contextual actions together near the section heading; allow wrapping or stacking on narrow screens.
- Short control labels and badges stay unbroken; descriptions wrap naturally. Long values use a contained scroll region or responsive type, not forced break-all.
- Studio owns body margin, outer gutter, app header and navigation. Mark exactly one content region without another outer padding, fixed-width app wrapper or viewport-height spacer. Contextual headings/tabs remain inside it.
- Cards need meaningful grouping and consistent gaps, not decorative nested boxes. No skeletons unless the requested screen represents loading; no redundant badges, placeholder prose or decorative cursor.
- Use product-specific hierarchy, not an obligatory KPI/card count or two-column template. Mobile payment details may use stacked definition lists; complex desktop tables use contained scrolling.

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
- Real Media (destinations, products, people, places):
  - Where a domain naturally demands photography, use genuine photos from a verified public HTTPS source (e.g. images.unsplash.com), never inline SVG landscapes or gradient shapes acting as a photo, and never base64 blobs or scraped hotlinked sites.
  - Keep media honest and licensed: prefer Unsplash hotlinks (free license, source attribution optional) over arbitrary hotlinked Pinterest/personal CDNs; do not fabricate a provider key or claim an API integration that is not wired up.
  - Media is a design element with bounded geometry: every image element gets width:100%, height:auto, aspect-ratio, and object-fit:cover; no fixed pixel heights that phone-crop into a sliver, no layout dependence on any single external file.
  - Always supply a graceful fallback so an unavailable photo cannot break frame generation: wrap the photo in a container with the surface background and a muted caption of what is shown, and keep the rest of the card meaningful without the image. Never let a missing image leave an empty hole the size of the gallery.
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
- Layout: Filter/category bar, balanced responsive grid of product cards with real product photos, price, and primary action button.
- Real product photography is required for a catalog surface: every product card leads with an actual product photo (verified public HTTPS source), not a placeholder box, inline SVG, or CSS-gradient stand-in. Keep each price line atomic on one line ("Rp 22.000", never split "Rp" from the amount).`;
	}
	if (
		lower.includes("travel") ||
		lower.includes("tiket") ||
		lower.includes("hotel") ||
		lower.includes("pesawat") ||
		lower.includes("itinerary")
	) {
		return `DOMAIN-SPECIFIC UX (Travel & Hospitality):
- Primary focus: Search parameters (origin, destination, date range), slot/flight comparison cards, and itinerary timelines.
- Real destination photography is required for a travel booking surface: every destination card leads with a genuine candid location photo (verified public HTTPS source), not an inline SVG mountain/beach illustration or a CSS-gradient stand-in.
- Keep the price row atomic on one line: "Mulai dari", then "Rp 3.900.000 / orang" as a single non-wrapping group, then the primary CTA. Never let "Rp", the amount, or "/ orang" wrap onto separate lines.`;
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
