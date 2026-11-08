import { STUDIO_COMPONENT_PATTERNS } from "./studio-component-patterns";

// Pattern composition is documented in docs/studio-fix03-quality-pipeline.md.

export const STUDIO_COMPONENT_FIRST_GUIDANCE = `COMPONENT-FIRST DESIGN PATTERNS (STANDALONE HTML/CSS):
- The following data-ui patterns receive shared inline CSS from Studio. Adapt content to the brief; do not copy sample records or add controls without a user need:
${STUDIO_COMPONENT_PATTERNS.map((pattern) => `${pattern.name}: ${pattern.html}`).join("\n")}
- Search: keep clear action in its own 44px flex track, never absolute over input text. The visible glyph stays small.
- Control sizing belongs to the component you write. Studio does not resize every button, input and select: it guarantees a touch target only for the screen's single primary action (data-primary or button[type=submit]). Style the rest yourself, and keep a small control small: a quantity stepper stays ~36px square with a 40px value track, a radio stays a native radio, an icon button stays square. Mark the screen's one main action with data-primary; leave every other action quiet. A control you keep visually small still needs a real hit area: keep it at least 24px tall (the stepper pattern's buttons are 36px), and let the primary action carry the 44px touch target.
- Media declares its role instead of inheriting a shared ratio: data-media="product" and "thumb" (4/3), "banner" (16/9), "promo" (21/9), "avatar" (1/1), "logo" (contain, no ratio), "photo" (your own ratio, object-fit:cover). A product container you designed as 16/10 stays 16/10: declare the ratio on the component and do not let a global rule decide for it.
- A horizontal carousel keeps its own track: data-ui="carousel" children are flex:0 0 auto and scroll inside the track. A card inside a carousel keeps the width its component declares; it is never squeezed to the column.
- The outer gutter is var(--app-gutter), chosen once in blueprint.layout.gutter (legacy density fallback: 16px compact, 24px comfortable). The content region already applies it. Use --app-space-N and --app-type-N from shared scales when available, and --app-content-width for content bounds; never reselect them per screen.
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
- Two-Column Layout on Desktop: Optional when a screen genuinely needs simultaneous form entry and comparison; not an obligatory template:
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
- Metrics are optional, only on screens where numerical summaries serve the actual task. Do not add a verified/delta badge without meaningful supporting data.
- Long Text & Currency:
  - Format currency cleanly with digit grouping (e.g. "Rp 125.500.000"), using whitespace-nowrap and tabular numbers.
  - Wrap descriptions naturally. Truncate only optional secondary content with an accessible expansion path, never essential form options, prices or primary action labels.
- Real Media (destinations, products, people, places):
  - Where a domain naturally demands photography, use genuine photos from a verified public HTTPS source (e.g. images.unsplash.com), never inline SVG landscapes or gradient shapes acting as a photo, and never base64 blobs or scraped hotlinked sites.
  - Keep media honest and licensed: prefer Unsplash hotlinks (free license, source attribution optional) over arbitrary hotlinked Pinterest/personal CDNs; do not fabricate a provider key or claim an API integration that is not wired up.
  - Choose one frame geometry per media role. An image fills that frame (width/height 100%) with contain for a whole product or cover for intentional photo crop and a deliberate object-position; standalone intrinsic images may use height:auto. Never combine conflicting fixed parent/image heights or force every image into cover/16:9.
  - Always supply a graceful fallback so an unavailable photo cannot break frame generation: wrap the photo in a container with the surface background and a muted caption of what is shown, and keep the rest of the card meaningful without the image. Never let a missing image leave an empty hole the size of the gallery.
- Empty States: When a list or table is empty, render an informative box with an icon, Indonesian explanation, and action button:
  <div class="text-center py-10 px-4 border border-dashed border-[var(--app-border)] rounded-xl" data-card>
    <p class="font-medium text-sm text-[var(--app-ink)]">Belum ada data transaksi</p>
    <p class="text-xs text-[var(--app-muted)] mt-1">Mulai dengan mencatat pemasukan atau pengeluaran pertama.</p>
  </div>`;

export function getDomainQualityContract(prompt?: string): string {
	const lower = (prompt ?? "").toLowerCase();
	if (
		/\b(?:transaksi|uang|keuangan|finansial|finance|kas|anggaran)\b/.test(lower)
	) {
		return `DOMAIN-SPECIFIC UX (Finance / Accounting SaaS):
- Choose composition by task: balance overview, transaction entry, comparison/history table or payment detail. Side-by-side form/table only when both tasks are required together; no mandatory KPI quota.
- Currency presentation: formatted values with digit separators and atomic currency/amount/unit grouping.
- Status badges only for actual payment/transaction states, expressed in words as well as color.`;
	}
	if (
		lower.includes("toko") ||
		lower.includes("katalog") ||
		lower.includes("produk") ||
		lower.includes("belanja") ||
		lower.includes("ecommerce") ||
		lower.includes("shop") ||
		/\b(?:kopi|coffee|cafe|café)\b/.test(lower)
	) {
		return `DOMAIN-SPECIFIC UX (E-Commerce / Catalog):
- Primary focus: Product discovery, clear pricing, category navigation, and cart affordances.
- Choose a discovery list, responsive product grid or horizontal recommendation track by content density; customization uses readable option rows, checkout distinct quantity/price/action tracks, tracking ordered status steps.
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
- Primary focus: featured works, case studies, capabilities and direct contact.
- Use prominent media with useful scanning categories, not obligatory tag pills or data tables.`;
	}
	return `DOMAIN-SPECIFIC UX (Professional Web Application):
- Tailor components strictly to user journey: clear screen title, high-utility cards, contextual actions, and appropriate data density.`;
}
