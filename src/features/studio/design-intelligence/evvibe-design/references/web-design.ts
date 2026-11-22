import type { EvvibeDesignReference } from "../skill-contract";

export const webDesign: EvvibeDesignReference = {
	id: "web-design",
	title: "Website and web application families",

	viewport: "web",
	body: `Identify the family before composing. The families below are not variations of one dashboard.

- Public marketing website: one clear value proposition, proof of what the product does, supporting detail, one path to act. Long-form reading, generous measure, imagery that shows the product or its result.
- Marketing landing page: a single argument in sequence — promise, evidence, mechanism, objection handling, one closing action. Sections may be promotional and visually loud; the closing action is the point.
- Portfolio or creative showcase: the work is the content. Project media at a size that rewards looking, short professional narrative, contact or hire action. It is not an administrative dashboard and must not be reduced to KPI rows and status tags.
- Editorial or content website: reading comfort first — measure of 60-75 characters, real typographic hierarchy, images and captions that carry meaning, related-content navigation.
- E-commerce storefront: discovery and comparison. Product imagery, price and availability legibility, category navigation, a short path to cart; checkout is a separate, quiet flow.
- Authenticated web application: task work for a known user. The screen title states the task, controls sit with the data they change, and density follows how often the user repeats the task.
- Administrative dashboard: an operations view. Records, filters and comparisons at working density; overview metrics exist only when the domain genuinely measures them.

Public website composition rules:
- The navbar is a purposeful subset of the real information architecture. Destination count follows the page list: two links is a valid navbar, six is a valid navbar, three is not a quota.
- Never promote the last nav link into a filled button by default. A CTA exists only when the site has an actual primary action (start, book, buy, hire, contact) and it reads as that action.
- Brand, links and an optional responsive menu share one row on desktop; on narrow screens the links collapse into a disclosure, and the brand stays visible.
- A hero earns its size: value proposition, one supporting line, at most one primary action, plus an image or product visual when one genuinely helps. Do not stack a generic page title bar above it.
- Vary section compositions by their content — editorial text column, two-up or three-up feature rows, image-led showcase, gallery, timeline, pricing comparison, testimonial or logo row only when the client actually supplied them, FAQ, closing action. A page of identically bordered cards containing a heading and a paragraph is not a composition.
- Use placed photography or product imagery where it contributes. A pure-text page is acceptable when the content is genuinely textual, but do not shrink an image-led site into text blocks.
- Long pages are fine. Reduce height by removing filler, not by merging unrelated sections.

Web application rules:
- Choose sidebar or top navigation from the destination count and the vocabulary of the domain, not from a landing-page template.
- Data-dense screens may use a contained comparison table, an entry form, a detail panel or a workspace split; use the layout the task needs and no other.
- Metrics appear when the domain is measured; a dashboard that must invent numbers to fill a row is a defect, not a layout.`,
};
