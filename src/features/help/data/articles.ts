import type {
	HelpArticle,
	HelpCategory,
	HelpCategoryId,
} from "../types/help-article";
import { BILLING_ARTICLES } from "./billing";
import { HELP_CATEGORIES } from "./categories";
import { GETTING_STARTED_ARTICLES } from "./getting-started";
import { SCRAPE_ARTICLES } from "./scrape";
import { STUDIO_ARTICLES } from "./studio";
import { TEMPLATE_AND_CLI_ARTICLES } from "./template-cli";
import { VIBEPLAN_ARTICLES } from "./vibeplan";

export { HELP_CATEGORIES } from "./categories";

export const HELP_ARTICLES: readonly HelpArticle[] = [
	...GETTING_STARTED_ARTICLES,
	...VIBEPLAN_ARTICLES,
	...STUDIO_ARTICLES,
	...SCRAPE_ARTICLES,
	...TEMPLATE_AND_CLI_ARTICLES,
	...BILLING_ARTICLES,
];

const ARTICLES_BY_ID = new Map(
	HELP_ARTICLES.map((article) => [article.id, article]),
);

export function getHelpArticle(id: string): HelpArticle | null {
	return ARTICLES_BY_ID.get(id) ?? null;
}

export function resolveHelpArticle(
	categoryId: string,
	articleId: string,
): HelpArticle | null {
	const article = ARTICLES_BY_ID.get(articleId);
	return article?.categoryId === categoryId ? article : null;
}

export function getHelpCategory(id: string): HelpCategory | null {
	return HELP_CATEGORIES.find((category) => category.id === id) ?? null;
}

export function getCategoryArticles(
	categoryId: HelpCategoryId,
): readonly HelpArticle[] {
	return HELP_ARTICLES.filter((article) => article.categoryId === categoryId);
}

export function getRelatedArticles(
	article: HelpArticle,
): readonly HelpArticle[] {
	return (article.relatedIds ?? [])
		.map((id) => ARTICLES_BY_ID.get(id))
		.filter((related): related is HelpArticle => related !== undefined);
}

export function categoryHref(categoryId: HelpCategoryId): string {
	return `/bantuan/${categoryId}`;
}

export function articleHref(article: HelpArticle): string {
	return `${categoryHref(article.categoryId)}/${article.id}`;
}
