import { createFileRoute, notFound } from "@tanstack/react-router";
import { HelpArticlePage } from "@/features/help/components/help-article-page";
import { resolveArticleRoute } from "@/features/help/lib/resolve-route";

export const Route = createFileRoute("/bantuan/$categoryId/$articleId")({
	loader: ({ params }) => {
		const result = resolveArticleRoute(params.categoryId, params.articleId);
		if (result.kind === "not-found") throw notFound();
		return {
			category: result.category,
			article: result.article,
			articles: result.articles,
			related: result.related,
		};
	},
	component: HelpArticleRoute,
});

function HelpArticleRoute() {
	const { category, article, articles, related } = Route.useLoaderData();
	return (
		<HelpArticlePage
			category={category}
			article={article}
			articles={articles}
			related={related}
		/>
	);
}
