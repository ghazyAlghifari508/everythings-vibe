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
	"No horizontal overflow: all sections, grids, cards, and tables must use fluid widths (w-full, max-w-full, min-w-0). Wide tables wrapped in overflow-x: auto container.",
	"No controls overlapping: form inputs, buttons, chevrons, and prefixes must keep distinct layout tracks and adequate clearance without collisions.",
	"Correct responsive behavior: mobile single-column reflow, desktop multi-column alignment, touch targets >= 44px on interactive controls.",
	"Appropriate content hierarchy: clear typographic scale (title > section header > card header > body > metadata), exactly one primary focal action per screen.",
	"Consistent spacing: disciplined padding, gaps, and margins based on the shared layout scale; no random inconsistent gutters.",
	"Proper accessible names: every button, link, and input has a visible label or aria-label; form inputs pair with visible labels.",
	"No duplicated shell: Studio assembles the canonical app bar and navigation; never render a second topbar, sidebar, or bottom tab bar.",
	"No pointless skeleton: do not display skeleton loaders or placeholder wireframes unless the screen explicitly represents a loading state.",
	"No redundant badges: status chips appear only when communicating actual status; no decorative pill-upon-pill nesting or spurious labels.",
	"No broken component structure: cards group related metrics/data with structured borders; no loose orphan text lines or fragmented cards.",
	"No randomly detached icons: icons accompany labels with proper inline spacing or serve as accessible standalone controls; no floating decorative icons.",
	"No arbitrary text splitting: words and sentences flow naturally without forced break-all, awkward letter-spacing, or artificial text fragmentation.",
	"Shared design tokens respected: use semantic CSS variables (--app-primary, --app-canvas, --app-surface, --app-ink, --app-muted, --app-border, --app-radius) consistently across every frame.",
] as const;

export const STUDIO_BASE_QUALITY_PROMPT = `<STUDIO_BASE_QUALITY_RULES>
Studio universal quality standards (always enforced, independent of selected design skill):
${STUDIO_BASE_QUALITY_INVARIANTS.map((rule, index) => `${index + 1}. ${rule}`).join("\n")}
</STUDIO_BASE_QUALITY_RULES>`;
