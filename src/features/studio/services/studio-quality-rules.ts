/**
 * Universal Studio Quality Rules (Single Source of Truth).
 *
 * These rules define Studio's own non-negotiable baseline quality standard.
 * They are always active across every generation, revision, and repair round,
 * completely independent of which design skill (if any) the user selected.
 *
 * This separates Studio's architectural invariants from upstream skill guidance:
 * No Skill still receives these baseline guarantees without pretending to run
 * upstream Anti-Slop or Impeccable.
 */

export const STUDIO_BASE_QUALITY_INVARIANTS = [
	"No page-level horizontal overflow. Choose vertical reflow, responsive grid, intentional contained horizontal scrolling, optional-content truncation or detail expansion by component function. Carousel cards retain readable width and never shrink to fit the viewport.",
	"No controls overlapping: form inputs, buttons, chevrons, and prefixes must keep distinct layout tracks and adequate clearance without collisions.",
	"Responsive controls: preserve readable option names, descriptions and extra prices in distinct tracks. Primary touch targets >=44px; compact controls need >=24px hit areas or a larger associated label, not universal button padding.",
	"Appropriate content hierarchy: clear typographic scale (title > section header > card header > body > metadata), exactly one primary focal action per screen.",
	"Consistent spacing: disciplined padding, gaps, and margins based on the shared layout scale; no random inconsistent gutters.",
	"Proper accessible names: every button, link, and input has a visible label or aria-label; form inputs pair with visible labels.",
	"No duplicated shell: Studio assembles the canonical app bar and navigation; never render a second topbar, sidebar, or bottom tab bar.",
	"No pointless skeleton: do not display skeleton loaders or placeholder wireframes unless the screen explicitly represents a loading state.",
	"Purposeful status only: badges/dots communicate selected options, availability, payment, stock, real warning/progress or useful categories. Include semantic text, never color alone. No decorative verified/live/premium labels or duplicated status within one context.",
	"No broken component structure: cards group related metrics/data with structured borders; no loose orphan text lines or fragmented cards.",
	"No randomly detached icons: icons accompany labels with proper inline spacing or serve as accessible standalone controls; no floating decorative icons.",
	"No arbitrary text splitting: words and sentences flow naturally without forced break-all, awkward letter-spacing, or artificial text fragmentation.",
	"Shared design tokens respected: use semantic CSS variables (--app-primary, --app-canvas, --app-surface, --app-ink, --app-muted, --app-border, --app-radius) consistently across every frame.",
	"Media geometry belongs to each component: use an explicit media frame, fit and position appropriate to the subject (contain for whole products, cover for intentional photography crop). Fill the frame without conflicting image/parent heights; provide alt text and meaningful content when images fail.",
	"Atomic prices and quantities: keep currency, amount, unit and short action labels in one nonbreaking group; descriptions may wrap. Let action groups reflow instead of ellipsizing essential option/button labels or hiding them behind overflow.",
	"Domain and screen role drive hierarchy: discovery, customization, checkout, tracking, finance and portfolio require different compositions with the same project tokens. No mandatory KPI row, card quota or decorative whitespace; explicit user art direction remains authoritative within safety/readability constraints.",
	"Content grounding: brief and PRD supply product facts; DESIGN.md, themes and scraped references supply visuals only, never business evidence. Never invent identifiable testimonials, certifications, credentials, verified satisfaction, exact performance improvements or unsupported live/stock/payment states. Preserve explicitly supplied illustrative numbers as visibly labeled sample content, not proof. Missing evidence means neutral copy or an honest empty state, never filler KPIs.",
	"Purposeful visual treatment: ordinary information uses neutral text or a quiet note, not automatic success/error/warning panels. Severity needs a named condition and accessible text. Avoid redundant dot+tint+stripe+pill stacks, random accent edges, nested border boxes, pervasive glass/glow/gradients and excessive KPI cards. Keep color, typography and expressive art direction where they serve brand, hierarchy or action; do not force grayscale or minimalism.",
	"Respect canonical CSS ownership: no duplicate app chrome, !important wars or width hacks to mask assembly bugs. Use shared spacing/type tokens; fix component composition rather than overriding the shell.",
] as const;

export const STUDIO_BASE_QUALITY_PROMPT = `<STUDIO_BASE_QUALITY_RULES>
Studio universal quality standards (always enforced, independent of selected design skill):
${STUDIO_BASE_QUALITY_INVARIANTS.map((rule, index) => `${index + 1}. ${rule}`).join("\n")}
</STUDIO_BASE_QUALITY_RULES>`;
