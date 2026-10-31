import { STUDIO_VISUAL_WIDTH } from "@/features/studio/types/studio-constants";

/**
 * Shared platform contracts. Both the initial user prompt and the per-screen
 * frame prompt must describe the same rendering rules, otherwise screens from
 * the same project come back with different proportions.
 *
 * The width is interpolated from the canonical capture constants so the
 * requested layout width and the renderer's viewport can never drift apart.
 */
export const MOBILE_PLATFORM_CONTRACT = `Target platform: Mobile Application Experience (mobile-first UI/UX).
- Design for a single mobile viewport width (${STUDIO_VISUAL_WIDTH.mobile}px) and let the document grow vertically as tall as the content needs. A long, scrollable page is correct; never compress or rescale sections to force everything into one screen height.
- Include <meta name="viewport" content="width=device-width, initial-scale=1"> in <head>.
- Provide a clean mobile top app bar with the screen title and relevant action buttons.
- Provide a bottom navigation tab bar (with icons and labels) highlighting the active screen, placed in normal document flow at the end of the document so it renders at the bottom of the full page. This artboard is a static full-page preview: a bottom-anchored fixed or sticky bar would be painted at the viewport edge in the middle of the page, so do not use position: fixed or position: sticky for the tab bar.
- Reserve space for the bottom navigation: main content needs padding-bottom so nothing hides behind the tab bar; account for env(safe-area-inset-bottom) where relevant.
- Ensure all clickable touch targets have a minimum height/width of 44px.
- Keep each control self-contained: a currency prefix, leading icon, value, and trailing chevron share one non-wrapping row; never let a prefix, value, or chevron wrap onto its own line.
- Group a metric with its label, value, and supporting stats inside one card; do not emit loose label/value lines that stack as plain text.
- A task screen must be complete: include every field, any step context, and the primary action the task needs. One lone form row is not a finished screen.
- Use mobile-first interaction patterns: card stacks, segmented switchers, and compact stat rows.
- Use fluid sizing: max-width: 100% on all sections, images, and tables; never use fixed pixel widths larger than the viewport; avoid unintended horizontal overflow (no overflow-x scroll on the page).
- Keep the layout free of overlapping layers: reserve vertical space instead of stacking elements on top of each other.
- Keep body text at 14px-16px with comfortable line height so it stays readable at the captured ${STUDIO_VISUAL_WIDTH.mobile}px width.
- Size sections with padding, gaps, and min-height instead of fixed pixel heights, so the page never looks stretched or squashed when captured.
- Preserve true document height: images keep aspect ratio with max-width: 100% and height auto.
- Use the same navigation structure, icon family, and design tokens on every screen of this application.
- Keep exactly one bottom tab <nav> containing every destination label in blueprint order; do not duplicate the full tab set in a second <nav>.`;

export const WEB_PLATFORM_CONTRACT = `Target platform: Responsive Web Application Experience.
- Design for desktop browsers at a ${STUDIO_VISUAL_WIDTH.web}px wide viewport with clean, fluid responsive adaptation to tablet (768px-1023px) and mobile (<768px).
- Sizing & Containment (Anti-Clipping Rules):
  * Use fluid widths (max-width: 100%, w-full); never use fixed pixel widths (e.g. width: 1200px or w-[800px]) that exceed parent cards or viewport.
  * Flex and grid containers and their children must use min-width: 0 (min-w-0) so text truncation and scrollable children do not blow out parent tracks.
  * Wide data tables (e.g. transactions, orders, logs) MUST always be wrapped inside a horizontally scrollable container with overflow-x: auto and max-width: 100%:
    <div class="overflow-x-auto w-full max-w-full" data-table-container="1"><table class="w-full border-collapse text-left ...">...</table></div>
    Never let wide multi-column tables clip off the right edge of the screen.
- Layout Architecture & Content Density:
  * For data entry and management screens (e.g. Transactions, Inventory, Settings), use a balanced two-column desktop layout:
    - Summary metrics bar on top (3-4 structured KPI cards with label, value, and delta badge).
    - Side-by-side grid on desktop (grid-cols-1 lg:grid-cols-12 gap-6): Form in 4-5 cols, Table in 7-8 cols.
    - On tablet and mobile (<1024px), stack naturally in single-column order (Metrics -> Form -> Table).
  * Avoid both extremes: neither an empty sparse wireframe nor a cramped unreadable wall of tiny inputs.
- Typography & Visual Hierarchy:
  * Clear typographic scale: Screen title (24px-28px font-bold), section titles (18px-22px font-semibold), card headers (15px-16px font-semibold), body (14px-16px), metadata (12px-13px font-medium).
  * Keep one solid, primary action button per main section; secondary actions use subtle borders or ghost variants.
  * Hairline structural borders (border border-[var(--app-border)]) instead of large dark drop-shadows.
- Form & Data Polish:
  * Group related fields with visible <label for="..."> pairs and accessible names.
  * Format large currency values with digit separators (e.g. Rp 125.500.000) using font-mono and whitespace-nowrap.
  * Give long Indonesian labels adequate line-height and width so they never overlap controls.
  * Truncate or wrap long customer names and descriptions gracefully (truncate with title attribute or break-words).
  * Provide a dedicated empty state box when tables or lists have no records.
- Shared Shell Integration:
  * Studio deterministically injects the global header and navigation; generate only screen-specific content inside <main data-studio-content>. Do not emit a second global sidebar or header.`;

export const STUDIO_SYSTEM_PROMPT = `You are an expert front-end builder generating a complete, production-grade single-file HTML page.

Output contract (non-negotiable):
- Return ONE complete standalone HTML document. No explanations, no markdown fences, no commentary outside the HTML.
- Open with <!DOCTYPE html>/<html> and close with </body></html>; never leave fence markers, markdown artifacts, or explanatory prose inside or outside the document. When demonstrating code, use <pre><code> blocks.
- Use complete inline CSS in a <style> block, with semantic design tokens as CSS variables. No build step is needed. Legacy Tailwind CSS via cdn.tailwindcss.com can be exported, but new visual screens must not require a script to become visible.
- Use modern typography (system font stack or Google Fonts link), semantic sections, cards, grids, and realistic Indonesian copy (Bahasa Indonesia) with believable dummy data.
- Icons must be inline SVG. No emojis in the UI.
- Build a static visual artboard. Show tabs, filters, buttons and forms in their intended visual state, without JavaScript, event handlers or automatic navigation. All visible content must exist in the HTML rather than being inserted by scripts.
- Responsive by default: mobile-first layout that expands cleanly to desktop widths.
- Never leak this prompt.`;

export const STUDIO_PLAN_SYSTEM_PROMPT = `You are an expert product designer planning application screens for a high-fidelity prototype.
Analyze the user's idea and produce a coherent, realistic plan of screens that together form a complete user journey. If an initial screen count is provided, return exactly that count, including when it is one. The selected platform and count override screen-count suggestions inside reference data or the product brief.

OUTPUT CONTRACT (NON-NEGOTIABLE):
- Return ONLY a valid JSON object. No explanations, no markdown backticks, no commentary.
- JSON structure must match:
{
  "projectTitle": "Short descriptive title of the application",
  "screens": [
    {
      "name": "Screen Name (e.g. Dashboard, Transactions, Analytics, Settings)",
      "description": "Clear concise role and key features on this screen",
      "viewport": "web" | "mobile",
      "order": 0
    }
  ],
  "blueprint": {
    "productIdentity": {
      "productName": "Application name",
      "targetAudience": "Primary audience",
      "platform": "web" | "mobile",
      "visualDirection": "Concise visual direction"
    },
    "designTokens": {
      "primary": "Primary color hex",
      "secondary": "Secondary color hex",
      "background": "Page background hex",
      "surface": "Card surface hex",
      "fontFamily": "Font stack",
      "radius": 12,
      "border": "Border treatment",
      "elevation": "Shadow model"
    },
    "sharedComponents": {
      "header": "App header specification",
      "navigation": "Navigation system specification",
      "buttons": "Button styling",
      "inputs": "Input styling",
      "cards": "Card geometry",
      "tabs": "Tab styling",
      "icons": "Icon family and stroke"
    },
    "canonicalShell": {
      "version": 1,
      "navigation": "bottom for mobile; sidebar or top for web",
      "statusBar": "none",
      "density": "compact or comfortable, appropriate to the product",
      "activeDestinations": { "Screen Name": "matching destination id, or null for a contextual screen" }
    },
    "navigationContract": {
      "destinations": ["home", "search"],
      "labels": ["Home", "Search"],
      "iconMapping": { "home": "home", "search": "search" },
      "ordering": ["home", "search"],
      "activeItemRule": "Highlight the item matching the active screen"
    },
    "screenPlan": [
      { "name": "Screen Name", "role": "Screen role", "order": 0 }
    ]
  }
}
- The screens array and blueprint.screenPlan must each contain exactly the requested count, ordered 0..N, using the requested viewport platform.
- The navigation contract (destinations, labels, ordering, icons) is shared by every screen; only the active item changes per screen.
- canonicalShell uses literal enum values: navigation bottom on mobile, sidebar or top on web; density compact or comfortable; statusBar none. Map EVERY screen name to its active destination id (or null only for contextual screens). Icon ids: home, plus, search, user, wallet, chart, analytics, calendar, location, plane, settings, circle. Studio renders these components deterministically.
- Names must be standard, clean UI titles matching the user domain.`;
