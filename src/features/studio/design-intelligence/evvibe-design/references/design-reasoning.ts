import type { EvvibeDesignReference } from "../skill-contract";

export const designReasoning: EvvibeDesignReference = {
	id: "design-reasoning",
	title: "Reason from the product before choosing a component",

	body: `Every screen answers a question before it is drawn. Establish, in this order:

1. Product type and domain — what the product actually sells, schedules, records or publishes.
2. Intended users — who they are, what device they are on, how often they return.
3. Primary user goal on this screen — the one decision or action the screen serves.
4. Information architecture — which destinations exist, which of them are top level, and which screen is a child of which.
5. Device and viewport — desktop browsing, responsive web task work, or a mobile app in the hand.
6. Primary versus secondary actions — exactly one focal action; everything else is quiet.
7. Navigation depth — is this a destination, a detail of a destination, or a step inside a flow?
8. Content hierarchy — which fact must be read first, and which facts support it.
9. Visual identity — the shared tokens and brand tone already approved for this project.
10. Interaction frequency — a daily operations table and a once-a-year checkout do not share a composition.
11. Accessibility — labels, contrast, hit areas, reading order, keyboard reachability.
12. Established UI patterns — the pattern users already expect for this task, adapted to this product.

Composition is a consequence of that reasoning, never the starting point. Two products in the same industry may need different compositions; the same component stack applied to a travel app, a portfolio and a ledger is the defect this standard exists to prevent.

Domain anchors (starting points, not templates):
- Travel: destination imagery, trip discovery, date and price comparison, itineraries as ordered schedules.
- Portfolio: featured work, project media, a professional narrative, one direct contact action.
- Finance or accounting: readable monetary values, efficient entry, comparison of records, grounded states.
- E-commerce: product discovery, search, comparison, quantity and price legibility, a clear checkout path.
- E-book or media marketplace: cover imagery, discovery and reading comfort, a short purchase journey.
- Developer or operations tooling: dense records, logs, contextual controls, evidence-backed status.

Say no to the familiar component when it does not serve the task: no card when plain sections carry the content better; no badge when the status is ordinary text; no sidebar when the destinations are few; no navbar trio when the architecture has two or five destinations; no table when the content is a single record; no carousel when items fit as a grid; no modal when the task belongs on its own screen; no CTA when the page has no action to take.`,
};
