import type { EvvibeDesignReference } from "../skill-contract";

export const typographyAndLayout: EvvibeDesignReference = {
	id: "typography-and-layout",
	title: "Responsive layout, intrinsic sizing and atomic values",

	body: `Layout technique, beyond the universal quality rules:

- Flow first: block layout and normal document flow carry most screens. Reach for flex when items share one axis, grid when they share two. Do not wrap a single child in a flex container for alignment alone.
- Contain tracks: min-width: 0 on flex and grid children that contain text or scrollable content, so a long label cannot blow out its parent. width: auto and max-width: 100% on media.
- Intrinsic sizing: prefer min-content, max-content, fit-content, auto-fill and auto-fit over fixed pixel widths. A card that must keep a readable width uses a min-width plus a contained horizontal track, not a shrunken flex basis.
- Reflow, not shrink: when a row no longer fits, stack it, wrap it, or give it its own row. Never let essential text become an ellipsis to preserve a row.
- Bounded tables: a multi-column table lives inside an overflow-x: auto container with max-width: 100%, and its parent carries min-width: 0. The table may keep a min-width larger than the viewport; the page may not.
- Intentional wrapping: allow natural wrapping with a comfortable measure. Avoid break-all, forced line tracks inside prices, and letter-spacing tricks that split words.
- Atomic groups: currency prefix, amount, unit and short action labels stay in one non-wrapping group. Descriptions wrap. When space is tight, move the price to its own row instead of hiding the option label.
- Media owns its ratio: an explicit frame with a declared aspect ratio; contain for whole products, cover only for deliberate photography crops with a chosen object-position. A caption sits outside the ratio frame.
- Tap targets: primary actions at least 44px; compact controls keep proportional geometry plus at least a 24px hit area or a larger associated label. Do not bolt padding onto every button to fake this.
- Safe areas: an in-flow action area at the end of the mobile content accounts for the bottom inset; nothing important sits under the home indicator in the static composition.
- Responsive navigation: desktop shows the link row, narrow screens collapse to disclosure. Do not rely on hover for anything essential.
- Typography: one scale for the whole project. Body text holds 14-16px at mobile width and a restrained 16-18px at desktop reading width, with line-height around 1.5 for body and tighter for display sizes. Headings step by role, not by guess.

BAD → GOOD:
- "3" on one line and "Item" below → "3 Item" in one atomic group.
- [Oat Milk…] [Description…] [Price] in one squeezed row → [Radio] Oat Milk / Plant-based milk wrapping beneath / +Rp8.000 in its own non-wrapping track.
- A fixed 1200px container inside a card → width: 100%; max-width: var(--app-content-width).
- A carousel whose cards shrink to fit the viewport → cards with flex-shrink: 0 at a readable minimum width inside a contained scroller.
- Truncated option names to protect a price column → full names with wrapping, price moved to its own row on narrow widths.`,
};
