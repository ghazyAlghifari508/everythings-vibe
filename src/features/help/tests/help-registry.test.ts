import { describe, expect, it } from "vitest";
import {
	articleHref,
	getCategoryArticles,
	getHelpArticle,
	getHelpCategory,
	getRelatedArticles,
	HELP_ARTICLES,
	HELP_CATEGORIES,
	resolveHelpArticle,
} from "../data/articles";

describe("help article registry", () => {
	it("uses unique article ids and valid category ids", () => {
		const ids = HELP_ARTICLES.map((article) => article.id);
		expect(new Set(ids).size).toBe(ids.length);
		for (const article of HELP_ARTICLES) {
			expect(getHelpCategory(article.categoryId)).not.toBeNull();
		}
	});

	it("resolves every related article and keeps links navigable", () => {
		for (const article of HELP_ARTICLES) {
			const related = getRelatedArticles(article);
			expect(related.length).toBe(article.relatedIds?.length ?? 0);
			expect(articleHref(article)).toBe(
				`/bantuan/${article.categoryId}/${article.id}`,
			);
		}
	});

	it("groups every article under an existing category", () => {
		const grouped = HELP_CATEGORIES.flatMap((category) =>
			getCategoryArticles(category.id),
		);
		expect(grouped.length).toBe(HELP_ARTICLES.length);
	});

	it("rejects invalid and mismatched article routes", () => {
		expect(getHelpArticle("tidak-ada")).toBeNull();
		expect(resolveHelpArticle("billing", "prd-dan-revisi")).toBeNull();
		expect(resolveHelpArticle("vibeplan", "prd-dan-revisi")?.id).toBe(
			"prd-dan-revisi",
		);
	});
});
