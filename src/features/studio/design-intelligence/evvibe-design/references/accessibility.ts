import type { EvvibeDesignReference } from "../skill-contract";

export const accessibility: EvvibeDesignReference = {
	id: "accessibility",
	title: "Accessibility gaps",
	body: `Accessible names and hit areas are already required. These are the gaps the generator leaves most often.

- Landmarks and headings: one page-level heading, a real heading order with no level skipped for size, and a main region that holds the content. No bold paragraphs posing as headings.
- Reading order: DOM order is the reading order. Grid placement or row-reverse that contradicts it is a defect even when it looks right.
- Semantics: button for actions, a with href for links, label with for for inputs, fieldset and legend for groups. Role on a div is a last resort.
- State in words: selected, disabled, required, invalid and loading are written or exposed through aria, never by colour or opacity alone.
- Tables: header cells in a table header, a caption naming the data, alignment matching the number type.
- Focus: sensible order, no essential content behind :hover, and any host animation respects reduced motion.
- Reflow: content survives 200% text zoom without clipping or hidden overflow.
- Locale: the document declares its language and formats values for it (Indonesian rupiah and date order).`,
};
