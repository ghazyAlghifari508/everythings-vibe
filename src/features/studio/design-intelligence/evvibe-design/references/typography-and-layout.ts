import type { EvvibeDesignReference } from "../skill-contract";

export const typographyAndLayout: EvvibeDesignReference = {
	id: "typography-and-layout",
	title: "Layout and type technique",
	body: `The universal rules already state the boundaries (no page overflow, atomic price groups, 44px primary targets, no forced breaks). These are the techniques that satisfy them.

- Flow first: block layout carries most screens; flex for one axis, grid for two. Do not wrap a single child in a flex container to align it.
- Contain tracks: min-width: 0 on flex and grid children holding text or scrollable content, width: auto and max-width: 100% on media.
- Intrinsic sizing: prefer min-content, max-content, fit-content and auto-fill over fixed pixel widths. A card that must stay readable uses a min-width inside a contained horizontal track, not a shrunken basis.
- Reflow before shrink: stack, wrap or give the row its own line. Never ellipsize essential text to keep a row.
- Tables: overflow-x: auto container with max-width: 100% and min-width: 0 on its parent; the table may keep a min-width, the page may not.
- Media: an explicit frame with a declared ratio; contain for whole products, cover only for a deliberate crop with a chosen object-position; caption outside the ratio box.
- Mobile action areas stay in flow and account for the bottom inset; nothing important hides behind the home indicator.
- Type: one project scale. Body 14-16px on mobile and 16-18px at desktop reading width, line-height near 1.5 for body and tighter for display; headings step by role. Cap the reading measure at 60-75 characters.

Contrasts: "3" then "Item" on the next line → "3 Item" in one group. [Label…][Description…][Price] squeezed into one row → control, label over description, price in its own track; on narrow widths the price drops to its own line. A fixed 1200px container → width: 100% with the shared content width. Shrinking carousel cards → flex-shrink: 0 at a readable minimum inside a contained scroller. Truncated option names → full names that wrap.`,
};
