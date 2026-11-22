import type { EvvibeDesignReference } from "../skill-contract";

export const accessibility: EvvibeDesignReference = {
	id: "accessibility",
	title: "Accessibility in a static artboard",

	body: `The universal rules already require accessible names and adequate hit areas. These are the gaps the generator most often leaves:

- Landmarks and headings: one page-level heading per screen, a real heading order (h1 then h2 then h3) with no level skipped for size, and a main region that actually contains the screen's content. Do not fake headings with bold paragraphs.
- Reading order: the DOM order must be the reading order. Visual reordering with grid placement or row-reverse that contradicts the DOM is a defect even when it looks correct.
- Control semantics: use the element that carries the behaviour — button for actions, a with href for links, label with for for inputs, fieldset and legend for a group. Role on a div is a last resort, not the default.
- Grouped controls: a set of radios or checkboxes belongs in a fieldset with a legend; the description of an option is associated with its control, not merely placed nearby.
- State in words: selected, disabled, required, invalid and loading are stated in text or via aria attributes, never by colour or opacity alone.
- Tables: header cells in thead, a caption that names the data, alignment that matches the number type, no layout tables.
- Focus: every interactive element is reachable in a sensible order; the static artboard shows hover and focus states only where the screen intends to illustrate them, and never relies on :hover to reveal essential content.
- Contrast: text meets the shared token contrast floor; decorative colour is not text colour.
- Motion: no animation is required to understand the screen. Anything that does move in the host shell respects reduced-motion, and the generated artboard adds no gratuitous animation of its own.
- Zoom and reflow: content survives 200% text zoom without clipping; this is the same constraint as responsive reflow and is not satisfied by hiding overflow.
- Language and locale: the document declares its language, and formatted values follow the locale of the copy (Indonesian rupiah formatting, Indonesian date order).`,
};
