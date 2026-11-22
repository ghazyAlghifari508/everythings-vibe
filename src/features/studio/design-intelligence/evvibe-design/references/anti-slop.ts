import type { EvvibeDesignReference } from "../skill-contract";

export const antiSlop: EvvibeDesignReference = {
	id: "anti-slop",
	title: "Decoration versus information",

	body: `Apply one test to every element: if it were removed, would the user understand or act differently? If not, it is decoration and it goes.

Prohibited:
- Dots, pills or coloured marks with no informational meaning: green for "premium", yellow for "live", a dot beside an ordinary heading.
- Badges used as decoration, or repeated once per card because a card felt empty.
- Accent stripes, tinted edges or coloured borders on cards that carry no status.
- Semantic alert colouring for ordinary information: a neutral note is text, not a success panel.
- Gradient, glow, glass and blur used as the default surface treatment. Ink, border and one accent are enough; expressive brand direction is allowed, indiscriminate effects are not.
- Invented KPI cards, made-up growth percentages, rating scores, testimonials, client logos, certifications, skill percentages and progress bars for subjective proficiency. Numbers require a source; absent a source, use neutral copy or an honest empty state.
- Generic labels that assert something unverified: premium, verified, live, official, best-in-class.
- Cards as the only composition: a page where every section is a bordered box containing a heading and a paragraph has no composition at all.
- Filler headings and redundant descriptions that restate the title.
- Placeholder graphics pretending to be photographs: gradient rectangles, emoji, abstract blobs or wireframe shapes in a slot that needs a real image.
- Aggressive truncation, overlap or clipping used to hide a layout that does not fit.

Allowed and required when justified:
- Semantic badges and status pills for real selection, availability, payment, stock or progress, expressed in words.
- Real alerts for real conditions, with a named cause and an accessible message.
- Charts, tables and metric cards when the domain measures something and the values are supplied or clearly labelled as sample.
- Cards when the content genuinely is a discrete, comparable object: a product, a record, a project, a destination.
- Photography, illustration, gradients and expressive type when the brand direction calls for them and the system stays readable.

Do not solve a slop defect by going grey and empty. The failure is unearned elements, not colour, texture or confidence.`,
};
