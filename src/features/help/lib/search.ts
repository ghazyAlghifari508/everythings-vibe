import { HELP_CATEGORIES } from "../data/categories";
import type { HelpArticle, HelpSearchResult } from "../types/help-article";

/** Fold accents so "penerimaan" also matches "penerimaan" typed with marks. */
function fold(value: string): string {
	return value
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase();
}

export function searchTokens(query: string): readonly string[] {
	return fold(query)
		.split(/[^\p{L}\p{N}]+/u)
		.filter(Boolean);
}

function articleContent(article: HelpArticle): string {
	return article.sections
		.flatMap((section) => [
			section.heading,
			...(section.paragraphs ?? []),
			...(section.steps ?? []),
			...(section.bullets ?? []),
			...(section.note ? [section.note] : []),
			...(section.link ? [section.link.label] : []),
		])
		.join(" ");
}

function bestFieldScore(token: string, field: string, weight: number): number {
	const words = new Set(field.split(/\s+/));
	if (words.has(token)) return weight;
	if (field.includes(token)) return Math.round(weight / 2);
	return 0;
}

/**
 * Local, dependency-free ranking over the verified article registry.
 * Every query token must match somewhere, which keeps short queries useful
 * without returning unrelated guides.
 */
export function searchHelpArticles(
	query: string,
	articles: readonly HelpArticle[],
): readonly HelpSearchResult[] {
	const tokens = searchTokens(query);
	if (tokens.length === 0) return [];

	const phrase = fold(query).trim();
	const results: HelpSearchResult[] = [];

	for (const article of articles) {
		const category = HELP_CATEGORIES.find(
			(item) => item.id === article.categoryId,
		);
		const fields: ReadonlyArray<readonly [string, number]> = [
			[fold(article.title), 12],
			[fold(article.keywords.join(" ")), 10],
			[fold(article.description), 6],
			[fold(category?.label ?? ""), 5],
			[fold(articleContent(article)), 2],
		];

		let score = 0;
		let matchesAll = true;
		for (const token of tokens) {
			const best = Math.max(
				0,
				...fields.map(([text, weight]) => bestFieldScore(token, text, weight)),
			);
			if (best === 0) {
				matchesAll = false;
				break;
			}
			score += best;
		}
		if (!matchesAll) continue;

		const [title, keywords, description, , content] = fields.map(
			([text]) => text,
		);
		if (phrase.length >= 3) {
			if (title.includes(phrase)) score += 15;
			else if (keywords.includes(phrase)) score += 8;
			else if (description.includes(phrase)) score += 5;
			else if (content.includes(phrase)) score += 2;
		}

		results.push({ article, score });
	}

	return results.sort(
		(a, b) =>
			b.score - a.score || a.article.title.localeCompare(b.article.title, "id"),
	);
}
