import type { EvvibeDesignReference } from "../skill-contract";

export const goodVsBad: EvvibeDesignReference = {
	id: "good-vs-bad",
	title: "Decoration, status and defect contrasts",

	body: `Status: colour is not the message.
Bad: a green dot beside a heading, three badges on one card (Premium / Verified / Live), a yellow tint on an ordinary note.
Good: "Tersedia" or "Stok habis" written as text with a tone that matches a real state, one per object; a plain paragraph for ordinary information.

Metrics: a number needs a source.
Bad: three KPI cards with +24% growth, 4.9 rating and 12.000 pengguna on a page whose brief supplied none of that.
Good: the metrics the brief or PRD actually supply, visibly labelled as sample when illustrative; otherwise a useful empty state or no metric row at all.

Cards: a card is a discrete object.
Bad: every section of a marketing page is a bordered card with a heading and a paragraph.
Good: editorial sections read as text; a card wraps a product, a record, a destination or a project — things that are compared as units.

Composition: shape follows content.
Bad: a two-column form plus table copied onto a checkout, a portfolio and a settings screen.
Good: a checkout shows the order and the pay action; a portfolio shows the work; settings show grouped rows.

Text: fit the layout to the words.
Bad: "Oat M…" and "Descripsi…" truncated so a price column fits; a price broken as "Rp" / "42.000"; a two-word badge wrapped onto two lines.
Good: full labels that wrap, a price kept atomic, and the price moved to its own row when the width is tight.

Media: a photograph is a photograph.
Bad: a gradient rectangle, an emoji or an abstract SVG blob in a slot that the content calls a destination photo.
Good: a real licensed image with a declared ratio and alt text, or a composition that does not depend on a missing photo.

Density: neither empty nor cramped.
Bad: a sparse wireframe with two inputs and a button, or a wall of twelve equal cards with no focal action.
Good: the content the task needs, one focal action, and breathing room between groups rather than inside every row.`,
};
