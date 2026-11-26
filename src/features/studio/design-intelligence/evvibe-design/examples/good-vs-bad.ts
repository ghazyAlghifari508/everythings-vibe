import type { EvvibeDesignReference } from "../skill-contract";

export const goodVsBad: EvvibeDesignReference = {
	id: "good-vs-bad",
	title: "Status, metrics and defect contrasts",
	body: `Status: BAD a green dot beside a heading, three badges on one card (Premium / Verified / Live), a yellow tint on an ordinary note. GOOD "Tersedia" or "Stok habis" written as text, one per object; a plain paragraph for ordinary information.

Metrics: BAD three KPI cards with +24%, 4.9 rating and 12.000 pengguna that the brief never supplied. GOOD the metrics the brief or PRD provide, visibly labelled sample when illustrative, otherwise a useful empty state or no metric row.

Cards: BAD every section of a marketing page is a bordered card with a heading and a paragraph. GOOD editorial sections read as text; cards wrap products, records, destinations or projects that are compared as units.

Shape: BAD a two-column form plus table copied onto a checkout, a portfolio and a settings screen. GOOD each task gets the composition it needs.

Text: BAD "Oat M…" truncated so a price column fits, "Rp" / "42.000" broken across lines, a two-word badge wrapping. GOOD full labels that wrap, an atomic price, the price moved to its own line when width runs out.

Media: BAD a gradient block, emoji or abstract blob where the content calls for a destination photo. GOOD a real licensed image with a declared ratio and alt text, or a composition that does not depend on a missing photo.

Density: BAD a sparse wireframe with two inputs, or twelve identical cards and no focal action. GOOD the content the task needs, one focal action, and air between groups rather than inside every row.`,
};
