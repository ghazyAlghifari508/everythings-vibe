import type { EvvibeDesignReference } from "../skill-contract";

export const websitePatterns: EvvibeDesignReference = {
	id: "website-patterns",
	title: "Website composition worked examples",

	viewport: "web",
	body: `These communicate a principle and an alternative. They are not a universal portfolio template.

Bad — the default three-link navbar plus a wall of identical cards:

  [Brand] [Beranda] [Tentang] [ KONTAK ]
  [Card: Tentang] heading + long paragraph
  [Card: Pengalaman] heading + long paragraph
  [Card: Keahlian] heading + long paragraph

Why it fails: the third link was promoted to a button with no primary action behind it; each section is the same bordered box; every section is text that could have been one page; nothing shows the work or the product.

Good — navigation derived from the real pages, one value proposition, work that is looked at:

  [Brand]        Work   About   Contact
  Value proposition (one sentence)          [ relevant visual ]
  Featured projects: image + title + one-line role, two or three up
  Editorial about: short narrative, not a card
  Selected experience or services in a readable list
  One closing action that actually exists (hire, contact, start)

Why it works: the navbar is three real pages and no fake CTA; the hero states the product; the work is shown with media at a size that rewards looking; sections differ because their content differs.

Alternative for a product landing page: promise, one supporting line, one primary action, product screenshot, three mechanism sections with different shapes (text, image, numbered list), evidence only if supplied, closing action repeated once.

Alternative for editorial: a lead article, a grid of secondary articles, category navigation, and a reading-optimised article page with a 60-75 character measure.

Never: a dashboard title row above a public hero; KPI cards on a portfolio; a testimonial row with invented names; an all-caps label above every heading as the only visual idea.`,
};
