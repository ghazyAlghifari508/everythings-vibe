import type { EvvibeDesignReference } from "../skill-contract";

export const componentLibrary: EvvibeDesignReference = {
	id: "component-library",
	title: "Component anatomy distilled from mature libraries",

	body: `These are static HTML/CSS/DOM patterns derived from reviewed libraries. Only the pattern transfers: React runtimes, animation engines and canvas effects cannot render in a single-file artboard, so no source is imported and no script is required.

Choice row (radio or checkbox group) — derived from shadcn/ui Field and HeroUI v3.
Purpose: pick one or many options where the description and the price matter as much as the label.
Anatomy: fieldset with legend, one row per option with the native control first, the label and description wrapping in their own track, the price or extra in a separate non-wrapping track. Whole label clickable, description associated via aria-describedby.
Use when the choice changes the outcome. Not for navigation or for a single binary setting (use a switch row).
Responsive: rows stay full width; at narrow widths the price moves to its own line instead of squeezing the label.
Accessibility: native inputs, visible labels, no colour-only selection state.

Bounded data table — derived from shadcn/ui data table.
Purpose: compare many records across the same columns.
Anatomy: card or section with a header row (title, quiet caption, filter or search), then a scroll container with overflow-x: auto and max-width: 100%, then the table with a caption identifying the data.
Use when there are four or more comparable attributes and the user scans rows. Not for a single record, a small set of two or three rows, or text-heavy content.
Responsive: container scrolls, the page does not; the parent carries min-width: 0.
Accessibility: real table markup with header cells, caption, and short numeric alignment.

Segmented control — derived from TUFFUI and SakaniUI.
Purpose: switch between two to five mutually exclusive views of the same content.
Anatomy: a group with a visible selected state, labels in one row, one active segment.
Use when the views are peers and switching is frequent. Not for more than about five options (use a select), not for actions, not as navigation between screens.
Responsive: keeps readable labels; wraps to a scrollable row before shrinking text.
Accessibility: role and pressed state on each segment, arrow-key semantics described for the implementer.

Stepper — derived from SakaniUI stepper form.
Purpose: show position in a multi-step flow.
Anatomy: ordered step markers with completed, current and upcoming states, plus the current step's label; the flow's primary action sits at the end of the step content.
Use when the task is genuinely sequential and the count is small. Not for decorative process timelines in marketing copy.
Responsive: collapse to "Langkah 2 dari 4" plus the current label on narrow widths.
Accessibility: ordered list, current step announced in text.

Empty state — derived from TUFFUI and affectUI.
Purpose: explain that there is nothing yet and what to do next.
Anatomy: quiet icon or none, one title, one sentence naming the cause, one action if the user can act.
Use whenever a list, table or gallery can be empty. Never invent records to avoid the empty state.

Result or recommendation carousel — derived from TUFFUI result carousel.
Purpose: present more items than fit, where each item needs a readable width.
Anatomy: a horizontally scrollable track with snap points, cards at a fixed readable minimum width, flex-shrink: 0, and cards that remain whole.
Use for genuinely long recommendation rails. Not for three cards that fit a grid, and not as the default way to show any list.
Accessibility: the track is keyboard reachable via its native scrollbar; no hover-only controls.

Status pill and badge — derived from TUFFUI status pill.
Purpose: carry a status that is not otherwise obvious in text.
Anatomy: text plus optional icon or dot, one tone per real state, and a named condition behind the colour.
Use for actual availability, payment, stock, verification or progress states, and for genuine categories. Never as decoration, never for generic premium or live labels, never stacked with a tint and an accent stripe on the same card.
Accessibility: state is written in words, not conveyed by colour alone.

Command menu — derived from SakaniUI command menu.
Purpose: fast access to destinations and actions in a large web application.
Anatomy: a trigger, a search field, grouped results with icons and shortcuts, keyboard navigation.
Use in application shells with many destinations, not in public marketing pages and not in mobile screens.

Charts — derived from TUFFUI chart card and SakaniUI charts.
Purpose: show a measured trend or distribution.
Anatomy: a titled frame, an axis or a labelled summary, a legend only when more than one series, and a text summary of the point.
Use only when the data is supplied or clearly labelled as sample. Never fabricate a KPI, a growth rate, a rating or a satisfaction score to fill a card.

Rejected on purpose: canvas or WebGL indicators (Thinking Orbs, Magic UI effects) need a script; React Bits motion effects also carry redistribution restrictions; affectUI mixes free and commercial items so no source is copied; CUI is a native C toolkit with no web surface; SakaniUI's liquid glass treatment is a decorative default and is not adopted as a visual style.`,
};
