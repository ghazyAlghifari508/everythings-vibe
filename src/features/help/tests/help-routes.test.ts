import { describe, expect, it } from "vitest";
import { HELP_ARTICLES, HELP_CATEGORIES } from "../data/articles";
import {
	resolveArticleRoute,
	resolveCategoryRoute,
} from "../lib/resolve-route";

const REAL_DESTINATIONS = new Set<string>([
	"/",
	"/bantuan",
	"/faq",
	"/pricing",
	"/history",
	"/plan/new",
	"/plan/codebase",
	"/codebases",
	"/design",
	"/scrape",
	"/scrape/history",
	"/templates",
	"/settings/billing",
	"/settings/feedback",
	"/settings/api-keys",
]);

const FORBIDDEN_COPY = [
	"Inisiasi ide produk",
	"Streaming & revisi",
	"Ekstraksi headless",
	"tanpa halusinasi",
	"/plan/",
	"/codebases",
	"/settings/",
	"/design",
	"/scrape",
	"/templates",
];

describe("help route resolution", () => {
	it("resolves every category to a populated guide list", () => {
		for (const category of HELP_CATEGORIES) {
			const result = resolveCategoryRoute(category.id);
			expect(result.kind).toBe("category");
			if (result.kind !== "category") continue;
			expect(result.category.id).toBe(category.id);
			expect(result.articles.length).toBeGreaterThan(0);
		}
	});

	it("resolves every article on direct navigation", () => {
		for (const article of HELP_ARTICLES) {
			const result = resolveArticleRoute(article.categoryId, article.id);
			expect(result.kind).toBe("article");
			if (result.kind !== "article") continue;
			expect(result.article.id).toBe(article.id);
			expect(result.related.length).toBe(article.relatedIds?.length ?? 0);
			expect(result.articles.some((item) => item.id === article.id)).toBe(true);
		}
	});

	it("rejects invalid categories, articles, and category mismatches", () => {
		expect(resolveCategoryRoute("tidak-ada").kind).toBe("not-found");
		expect(resolveArticleRoute("billing", "prd-dan-revisi").kind).toBe(
			"not-found",
		);
		expect(resolveArticleRoute("vibeplan", "tidak-ada").kind).toBe("not-found");
	});

	it("points every action link at a real destination", () => {
		for (const article of HELP_ARTICLES) {
			for (const section of article.sections) {
				if (section.link) {
					expect(REAL_DESTINATIONS.has(section.link.to)).toBe(true);
				}
			}
		}
	});

	it("keeps internal route paths and obsolete wording out of guide copy", () => {
		for (const article of HELP_ARTICLES) {
			const copy = [
				article.title,
				article.description,
				...article.keywords,
				...article.sections.flatMap((section) => [
					section.heading,
					...(section.paragraphs ?? []),
					...(section.steps ?? []),
					...(section.bullets ?? []),
					...(section.note ? [section.note] : []),
					...(section.link ? [section.link.label] : []),
				]),
			].join(" ");
			for (const phrase of FORBIDDEN_COPY) {
				expect(copy.includes(phrase)).toBe(false);
			}
		}
	});
});
