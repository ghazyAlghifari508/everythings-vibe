import type { EvvibeDesignReference } from "../skill-contract";

export const navigationPatterns: EvvibeDesignReference = {
	id: "navigation-patterns",
	title: "Navigation models",
	body: `Public site: brand, intrinsic-width text links, optional single CTA, responsive disclosure. Links are the actual pages. Do not pad to three and do not turn the last link into a button.

Application: sidebar when there are many destinations or a domain vocabulary to scan; top navigation when there are few and the content wants width. Neither is a landing navbar.

Mobile: bottom tabs for three to five genuine top-level destinations, app bar for identity and contextual actions, back affordance on contextual screens only.

Primary screens appear in navigation and take the active state. Contextual screens (detail, edit, confirm, checkout) keep their parent active and get a back affordance even when the title has no detail keyword.

Quality: labels come from the product's vocabulary, not placeholders; one icon family at one stroke weight; order stable across screens; depth bounded — a third level is usually a step or a modal, not another nested page; no second navigation region inside the content; one primary action, not several competing ones; breadcrumbs only for genuinely deep hierarchies.`,
};
