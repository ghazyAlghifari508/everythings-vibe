import type { EvvibeDesignReference } from "../skill-contract";

export const componentLibrary: EvvibeDesignReference = {
	id: "component-library",
	title: "Component anatomy worth reusing",
	body: `Educational anatomy distilled from reviewed libraries. Only the DOM/CSS pattern transfers; no runtime is imported and no script is required. This is not a catalog to fetch from — use a pattern only when the task needs it.

Choice row (shadcn Field, HeroUI): fieldset and legend, native control first, label with its description wrapping in its own track, price or extra in a separate non-wrapping track, whole label clickable. Rows stay full width; the price moves to its own line rather than squeezing the label.

Bounded data table (shadcn): header row with title, quiet caption and filter, then a scroll container, then real table markup with a caption. Use for four or more comparable attributes; not for one record or for text.

Segmented control (TUFFUI, SakaniUI): two to five peer views, one visible selected state, wrapping to a scrollable row before shrinking labels. Not for more than five options and not for actions.

Stepper (SakaniUI): ordered markers with completed, current and upcoming states plus the current step's label; the step's action sits at the end. Collapses to "Langkah 2 dari 4" on narrow widths.

Empty state (TUFFUI, affectUI): quiet icon or none, one title, one sentence naming the cause, one action if the user can act. Never invent records to avoid it.

Result rail (TUFFUI): contained horizontal scroller with snap points and cards at a fixed readable width. Not for three cards that fit a grid.

Status pill (TUFFUI): text plus an optional icon or dot, one tone per real state, a named condition behind the colour. Never decorative, never stacked with a tint and an accent stripe on the same card.

Command menu (SakaniUI): trigger, search field, grouped results with icons and shortcuts. Application shells with many destinations only.

Charts (TUFFUI, SakaniUI): titled frame, axis or labelled summary, legend only for multiple series, a text summary of the point. Only with supplied or visibly labelled sample data.

Cards, dialogs, tabs, accordions and menus: keep the conventional anatomy the user already knows. A card is a discrete comparable object, not a section wrapper.

Rejected: canvas or WebGL indicators (Thinking Orbs), script-driven motion (Magic UI effects, React Bits — also redistribution-restricted), affectUI's mixed free/commercial catalog, CUI (native C, no web surface), SakaniUI's liquid glass as a default style.`,
};
