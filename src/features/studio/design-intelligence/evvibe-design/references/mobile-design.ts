import type { EvvibeDesignReference } from "../skill-contract";

export const mobileDesign: EvvibeDesignReference = {
	id: "mobile-design",
	title: "Mobile screen classes and app bar content",
	viewport: "mobile",
	body: `Read the task and navigation depth before deciding whether any separate chrome helps.

A. Top-level destination: start with search, feed, list or summary. Do not add a generic back arrow.
B. Detail: lead with the object and use a parent link or contextual actions where useful. These can live inside the content rather than in a separate bar.
C. Search and discovery: the field is the primary control near the top, filters as a compact row or sheet, results scannable with one supporting line and the price or distance that decides the choice.
D. Transactional flow: visible progress, one primary action per step, an in-flow action area at the end. Back is justified; entered values stay visible.
E. Profile and settings: grouped rows with label and current value, destructive actions separated and styled as such. No promotional hero.
F. Modal or contextual task: one decision, its own dismissal, never a second app bar nested in the parent.

App bar contents are chosen, never accumulated. Candidates: brand or screen identity, location or context, search, notifications, account, back, save or share, an overflow menu of contextual actions. No screen gets all of them; identity plus one action is usually right.

If using tabs, keep genuine top-level destinations with a visible active state. Use readable grids or contained scrollers as the task warrants; reflow at wider widths rather than centering an immutable phone shell.`,
};
