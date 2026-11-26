import type { EvvibeDesignReference } from "../skill-contract";

export const antiSlop: EvvibeDesignReference = {
	id: "anti-slop",
	title: "Decoration versus information",
	body: `One test per element: if it were removed, would the user understand or act differently? If not, it goes.

Not allowed: dots and coloured marks with no meaning (green "premium", yellow "live", a dot beside a heading); badges repeated once per card to fill space; accent stripes and tinted edges that carry no status; semantic alert colouring for ordinary notes; gradient, glow, glass and blur as the default surface; invented KPIs, growth rates, ratings, testimonials, logos, certifications, skill percentages and proficiency bars; unverified labels (premium, verified, live, official); a page whose every section is a bordered box of heading and paragraph; filler headings that restate the title; gradient or emoji placeholders in a slot that needs a photograph; truncation, overlap or clipping used to hide a layout that does not fit.

Still required when earned: semantic badges and status pills for real states, written in words; real alerts with a named cause for real conditions; charts, tables and metric cards for measured domains with supplied or visibly sample values; cards for genuinely discrete comparable objects; photography, illustration, gradients and expressive type when the brand direction calls for them and the system stays readable.

Do not answer slop by going grey and empty. The defect is unearned elements, not colour, texture or confidence.`,
};
