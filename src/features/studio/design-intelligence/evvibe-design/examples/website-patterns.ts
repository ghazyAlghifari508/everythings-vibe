import type { EvvibeDesignReference } from "../skill-contract";

export const websitePatterns: EvvibeDesignReference = {
	id: "website-patterns",
	title: "Website composition contrasts",
	viewport: "web",
	intents: ["public-website"],
	body: `Principle and alternative, not a portfolio template.

BAD: [Brand] [Beranda] [Tentang] [KONTAK] then three identical cards, each a heading with a long paragraph.
Why: the third link became a button with no primary action behind it; every section is the same bordered box; nothing shows the work or the product.

GOOD: [Brand]  Work  About  Contact — value proposition in one sentence plus one relevant visual; featured work as image, title and one-line role; a short editorial about section as text rather than a card; experience or services as a readable list; one closing action that exists.
Why: three real pages and no fake CTA, the hero states the product, the work is shown at a size that rewards looking, and sections differ because their content differs.

Vary by family: a landing page runs promise, evidence, mechanism, objection, closing action; an editorial page leads with an article and a grid of secondaries; a storefront shows products with price and availability at browsing density.

Never: a dashboard title row above a public hero; KPI cards on a portfolio; testimonials with invented names; an all-caps eyebrow above every heading as the only visual idea.`,
};
