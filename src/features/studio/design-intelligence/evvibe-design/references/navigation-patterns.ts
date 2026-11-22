import type { EvvibeDesignReference } from "../skill-contract";

export const navigationPatterns: EvvibeDesignReference = {
	id: "navigation-patterns",
	title: "Navigation models and controlled assembly",

	body: `Derive destinations from the real information architecture, then pick one model per project.

Public website: brand, intrinsic-width text links, optional single CTA, responsive disclosure. Links are the actual pages (Work, About, Contact, Services, Journal). Do not pad the set to three and do not turn the last link into a button so the bar looks finished.

Web application: sidebar when there are many destinations or a domain vocabulary that needs scanning; top navigation when there are few and the content wants width. Both may contain grouped sections; neither is a landing navbar.

Mobile application: bottom tab bar for genuine top-level destinations (three to five, icon plus label, active state visible), app bar for identity and contextual actions, back affordance for contextual screens only.

Contextual versus primary screens:
- Primary: appears in navigation, receives the active state.
- Contextual: a child flow (detail, edit, confirm, checkout). It keeps its parent destination active and receives a back affordance even when its title has no detail keyword.
- A project without a shared blueprint is assembled per screen; a project with one must never duplicate the shell inside the content region.

Navigation quality:
- Labels come from the product's own vocabulary, not generic placeholders. "Perjalanan", "Tagihan", "Katalog" is navigation; "Menu 1", "Halaman 2" is not.
- The icon family is one family at one stroke weight; icons support labels rather than replacing them.
- Ordering is stable across screens; only the active item changes.
- Depth is bounded. If the flow needs three levels, the third level is usually a modal or a dedicated step rather than another nested page.
- Do not add a second navigation region inside the content — no duplicate tab bar, no second menu row that repeats the destinations.
- A closing CTA is allowed on public pages; an application screen with many competing primary buttons is not.
- Breadcrumbs belong to deep hierarchies; they are not a decoration for every application screen.`,
};
