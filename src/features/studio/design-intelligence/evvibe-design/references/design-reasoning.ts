import type { EvvibeDesignReference } from "../skill-contract";

export const designReasoning: EvvibeDesignReference = {
	id: "design-reasoning",
	title: "Reason from the product before choosing a component",
	body: `Answer these before drawing anything: product type and domain; who uses it and on what device; the one goal this screen serves; the real information architecture behind the navigation; the device and viewport; the single primary action; whether this screen is a destination, a child detail or a step in a flow; what must be read first; the approved tokens and tone; how often the user repeats this task; accessibility needs; the pattern users already expect for this task.

Composition follows those answers. Two products in one industry may need different compositions; the same component stack on a travel app, a portfolio and a ledger is the defect this standard prevents.

Domain priorities (starting points, not templates): travel — destinations, dates, prices, itineraries; portfolio — the work itself and a professional identity; finance — legible amounts, fast entry, comparable records; commerce — discovery, comparison, quantity and price clarity, a short checkout; media or book marketplace — covers, browsing comfort, a short purchase path; developer tooling — dense records, logs, contextual controls, grounded status.

Say no when the component adds nothing: no card where plain sections carry the text better; no badge for ordinary status; no sidebar for two destinations; no navbar trio for an architecture of two or five; no table for one record; no carousel where a grid fits; no modal when the task deserves its own screen; no CTA when the page has no action.`,
};
