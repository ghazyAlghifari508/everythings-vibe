import { createFileRoute, notFound } from "@tanstack/react-router";
import { HelpCategoryPage } from "@/features/help/components/help-category-page";
import { resolveCategoryRoute } from "@/features/help/lib/resolve-route";

export const Route = createFileRoute("/bantuan/$categoryId")({
	loader: ({ params }) => {
		const result = resolveCategoryRoute(params.categoryId);
		if (result.kind === "not-found") throw notFound();
		return { category: result.category, articles: result.articles };
	},
	component: HelpCategoryRoute,
});

function HelpCategoryRoute() {
	const { category, articles } = Route.useLoaderData();
	return <HelpCategoryPage category={category} articles={articles} />;
}
