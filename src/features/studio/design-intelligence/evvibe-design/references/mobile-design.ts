import type { EvvibeDesignReference } from "../skill-contract";

export const mobileDesign: EvvibeDesignReference = {
	id: "mobile-design",
	title: "Mobile screen classes and app bar content",

	viewport: "mobile",
	body: `Mobile is a different composition, not a desktop layout narrowed. Classify the screen first; the class decides the header, the primary action and what belongs above the fold.

A. Top-level destination (home, discover, trips, cart, profile): the user arrives here from the tab bar. No back affordance exists, because there is no parent. Content starts immediately with the screen's own hierarchy — search, feed, list, summary — never with a repeated screen title that duplicates the tab label.

B. Detail screen (a trip, a product, a record, an article): the user arrived from a list. Back navigation is justified and expected. The app bar carries back plus the object's short name or its contextual actions; the body leads with the object — image, title, key facts — then supporting detail, then the action.

C. Search and discovery: the search field is the primary control and belongs near the top, with filters as a compact row or sheet. Results are scan targets: a readable title, one supporting line, an image where the domain is visual, and the price or distance that decides the choice.

D. Transactional flow (choose options, confirm, pay): progress must be visible (step count or an ordered summary), one primary action per step, and a persistent in-flow action area at the end of the content. Back is justified; abandoning must be possible without losing entered values in the visible composition.

E. Profile and settings: grouped rows with labels and current values, destructive actions separated and styled as such. No promotional hero, no search field the screen does not need.

F. Modal or contextual task: a sheet or short screen for one decision. It has its own dismissal (back, close, cancel) and never nests a second app bar inside the parent's content.

App bar contents are chosen, never accumulated. Candidates: brand or screen identity, current location or context, search, notifications, account access, back navigation, save or share, an overflow menu of contextual actions. No screen receives all of them. A bar with identity plus one action is usually correct; a bar with identity, search, notifications, share and overflow is a decision the designer has not made.

Rules:
- A back arrow is meaningful because the screen has a parent, not because the screen is a screen. Never render back on a top-level destination.
- Collapse the app bar into fewer elements before shrinking them; the title truncates, the primary action does not.
- Keep the bottom tab bar to genuine top-level destinations with icon plus label, and highlight the active one. A contextual screen keeps its parent active.
- Compose mobile content by task: vertical sections, readable grids, or an intentionally scrollable track for cards that must keep a readable width. Do not force every component into one column, and do not squeeze a carousel card until its title wraps four times.
- Group a label with its value and supporting line in one row or card; do not emit loose label/value lines that read as a table of orphan text.
- A task screen must be complete: every field, the step context, and the action it needs. One lone form row is not a finished screen.`,
};
