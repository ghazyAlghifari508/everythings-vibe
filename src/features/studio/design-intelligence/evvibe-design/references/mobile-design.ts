import type { EvvibeDesignReference } from "../skill-contract";

export const mobileDesign: EvvibeDesignReference = {
	id: "mobile-design",
	title: "Mobile screen classes and app bar content",
	viewport: "mobile",
	body: `Classify the screen first; the class decides the bar, the primary action and what sits above the fold.

A. Top-level destination (home, discover, trips, cart, profile): reached from the tab bar, so no back affordance exists. Content starts with its own hierarchy — search, feed, list, summary — not a title repeating the tab label.
B. Detail (trip, product, record, article): reached from a list, so back is justified and expected. The bar carries back plus the object's short name or its contextual actions; the body leads with the object, then supporting detail, then the action.
C. Search and discovery: the field is the primary control near the top, filters as a compact row or sheet, results scannable with one supporting line and the price or distance that decides the choice.
D. Transactional flow: visible progress, one primary action per step, an in-flow action area at the end. Back is justified; entered values stay visible.
E. Profile and settings: grouped rows with label and current value, destructive actions separated and styled as such. No promotional hero.
F. Modal or contextual task: one decision, its own dismissal, never a second app bar nested in the parent.

App bar contents are chosen, never accumulated. Candidates: brand or screen identity, location or context, search, notifications, account, back, save or share, an overflow menu of contextual actions. No screen gets all of them; identity plus one action is usually right.

Laws: a back arrow is meaningful because the screen has a parent, not because the screen is a screen. Collapse the bar to fewer elements before shrinking any. Keep the tab bar to genuine top-level destinations with icon and label, active state visible, and keep the parent active on a contextual screen. Compose by task — vertical sections, readable grids, or an intentional scroller for cards that must keep a readable width — never one column forced everywhere and never a card squeezed until its title wraps four times. Group label, value and supporting line together; a task screen includes every field, the step context and its action.`,
};
