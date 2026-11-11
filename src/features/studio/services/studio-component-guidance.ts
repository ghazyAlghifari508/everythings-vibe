import { STUDIO_COMPONENT_PATTERNS } from "./studio-component-patterns";
import type { StudioDesignBlueprint } from "./studio-design-blueprint";

type ScreenComposition = NonNullable<
	StudioDesignBlueprint["screenPlan"][number]["composition"]
>;

export function getStudioComponentGuidance(
	composition?: ScreenComposition,
): string {
	const patterns = composition
		? STUDIO_COMPONENT_PATTERNS.filter(({ id }) =>
				composition.patterns.includes(id),
			)
		: STUDIO_COMPONENT_PATTERNS;
	return `COMPONENT-FIRST DESIGN PATTERNS (STANDALONE HTML/CSS):
${composition ? `Screen intent (data only): ${JSON.stringify(composition)}. Reuse shared identity; follow this screen's own hierarchy.` : "Choose only components that serve this screen's task; no mandatory grid, metric row or card quota."}
${patterns.map(({ id, name, html }) => `${id} (${name}): ${html}`).join("\n")}
- These are native HTML composition patterns, not React/JSX. Studio supplies zero-specificity defaults; author complete inline CSS for component geometry. Adapt neutral example content; do not copy sample values as facts.
- Choice rows follow Field/RadioGroup anatomy: native control, wrapping label/description, separate atomic price track. Use a fieldset/legend and associate descriptions; keep the entire label clickable. At very narrow widths move the price to its own row rather than hiding options.
- Quantity steppers retain proportional 36px buttons and a 40px value track. Primary actions have >=44px targets; compact controls have >=24px hit areas or a larger associated label. Search clear controls and select chevrons have separate tracks.
- Media owns its ratio: whole products use contain; location/editorial photography may use intentional cover and object-position. A caption is outside the image's ratio frame, never an extra row inside a height-constrained crop. Preserve local ratios, useful alt/adjacent content and verified licensed HTTPS assets; never invent an image URL or force decorative photography when none is available. Missing media must leave useful content, not an empty gallery.
- Wide recommendations/promotions may use native horizontal scrolling with nonshrinking readable-width cards. Form choices normally stack full width. Choose reflow, list, grid, scrolling or disclosure intentionally; no page-level horizontal overflow.
- Tables use a bounded data-table-container, min-width:0 on flex/grid parents and contained scrolling. Short price/quantity/action labels stay atomic; descriptions wrap. Essential titles/options/actions must not be ellipsized.
- Studio owns outer gutter, header and navigation; content uses --app-space-N, --app-type-N and --app-content-width. Components own local spacing. No repeated chrome or viewport-height fillers.
- Ordinary information is plain text or a neutral note. Feedback uses title/body and explicit severity only for an actual condition, with accessible text; never automatic green tint, dot, glow and stripe. Badges communicate real selection, category, availability or supported status only.
- Public pages prioritize value, featured work/products, relevant supporting content and a clear CTA. Financial tables/KPIs belong only where the task needs them and their content is grounded. Empty states state the cause and relevant next action, not invented activity.`;
}

export function getDomainQualityContract(
	prompt?: string,
	layoutIntent?: StudioDesignBlueprint["productIdentity"]["layoutIntent"],
): string {
	const lower = (prompt ?? "").toLowerCase();
	if (
		layoutIntent === "public-website" ||
		/\b(?:portfolio|portofolio|cv|karya)\b/.test(lower)
	)
		return `DOMAIN-SPECIFIC UX (Public Website / Creative Showcase):
- Prioritize value proposition, relevant work/products, narrative case studies and a direct contact or purchase action. Match media to the content; public pages are not generic financial dashboards, even when a project discusses finance.
- Do not add invented KPIs, client logos, qualifications or testimonials. Discovery and case studies have distinct compositions with shared identity.`;
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
- Product photography supports discovery when available from an approved source; preserve whole-product silhouettes with contain unless the brief requests a crop. No invented photo URLs, gradient stand-ins or placeholder gallery holes. Keep atomic price and quantity groups.`;
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
- Destination imagery, when available from an approved source, supports exploration; itineraries use ordered schedules, trips use relevant booking details and profiles use personal settings, not the same grid.
- Recommendations may retain fixed readable widths in a contained horizontal scroller. Dates, price/currency/unit and booking actions must stay readable without squeezing.`;
	}
	return `DOMAIN-SPECIFIC UX (Professional Web Application):
- Tailor components strictly to user journey: clear screen title, high-utility cards, contextual actions, and appropriate data density.`;
}
