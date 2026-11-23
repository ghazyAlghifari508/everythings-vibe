import {
	getCategoryArticles,
	getHelpCategory,
	getRelatedArticles,
	resolveHelpArticle,
} from "../data/articles";
import type { HelpArticle, HelpCategory } from "../types/help-article";

export type CategoryRouteResolution =
	| {
			readonly kind: "category";
			readonly category: HelpCategory;
			readonly articles: readonly HelpArticle[];
	  }
	| { readonly kind: "not-found" };

export type ArticleRouteResolution =
	| {
			readonly kind: "article";
			readonly category: HelpCategory;
			readonly article: HelpArticle;
			readonly articles: readonly HelpArticle[];
			readonly related: readonly HelpArticle[];
	  }
	| { readonly kind: "not-found" };

export function resolveCategoryRoute(
	categoryId: string,
): CategoryRouteResolution {
	const category = getHelpCategory(categoryId);
	if (!category) return { kind: "not-found" };
	return {
		kind: "category",
		category,
		articles: getCategoryArticles(category.id),
	};
}

export function resolveArticleRoute(
	categoryId: string,
	articleId: string,
): ArticleRouteResolution {
	const category = getHelpCategory(categoryId);
	const article = resolveHelpArticle(categoryId, articleId);
	if (!category || !article) return { kind: "not-found" };
	return {
		kind: "article",
		category,
		article,
		articles: getCategoryArticles(category.id),
		related: getRelatedArticles(article),
	};
}
