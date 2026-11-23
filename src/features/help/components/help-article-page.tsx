import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { Link } from "@tanstack/react-router";
import { HubBreadcrumb } from "@/components/home/hub-breadcrumb";
import { PublicPageShell } from "@/components/layout";
import { Icon } from "@/components/ui/icon";
import { PageHeading } from "@/components/ui/page-heading";
import { articleHref, categoryHref } from "../data/articles";
import type { HelpArticle, HelpCategory } from "../types/help-article";
import { HelpArticleBody } from "./help-article-body";
import { HelpArticleList } from "./help-article-list";

export function HelpArticlePage({
	category,
	article,
	articles,
	related,
}: {
	category: HelpCategory;
	article: HelpArticle;
	articles: readonly HelpArticle[];
	related: readonly HelpArticle[];
}) {
	const categoryArticles = articles.filter(
		(item) => item.categoryId === category.id,
	);
	const navigation = (
		<HelpArticleList
			articles={categoryArticles}
			activeId={article.id}
			compact
		/>
	);

	return (
		<PublicPageShell className="max-w-6xl gap-8">
			<HubBreadcrumb
				current={article.title}
				ancestors={[
					{ label: "Bantuan", to: "/bantuan" },
					{ label: category.label, to: categoryHref(category.id) },
				]}
			/>

			<div className="grid gap-8 lg:grid-cols-[minmax(0,240px)_minmax(0,1fr)]">
				<aside className="hidden lg:block">
					<nav
						aria-label={`Panduan ${category.label}`}
						className="sticky top-24 rounded-xl border border-graphite bg-charcoal/40 p-3"
					>
						<p className="px-3 pb-2 pt-1 font-mono text-xs uppercase tracking-widest text-fog">
							Panduan {category.label}
						</p>
						{navigation}
					</nav>
				</aside>

				<article className="min-w-0 max-w-3xl">
					<details className="rounded-lg border border-graphite bg-charcoal/40 p-3 lg:hidden">
						<summary className="cursor-pointer px-2 py-1 text-sm font-medium text-snow">
							Panduan {category.label}
						</summary>
						<div className="mt-2">{navigation}</div>
					</details>

					<header className="mt-6 lg:mt-0">
						<PageHeading variant="workspace">{article.title}</PageHeading>
						<p className="mt-3 text-sm leading-6 text-fog sm:text-base">
							{article.description}
						</p>
					</header>

					<HelpArticleBody article={article} />

					{related.length > 0 && (
						<section
							aria-labelledby="terkait-heading"
							className="mt-10 border-t border-graphite pt-6"
						>
							<h2
								id="terkait-heading"
								className="mb-3 font-inter text-lg font-medium text-snow"
							>
								Panduan terkait
							</h2>
							<ul className="flex flex-col gap-2">
								{related.map((item) => (
									<li key={item.id}>
										<Link
											to={articleHref(item)}
											className="group flex min-h-11 items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm text-mist transition-colors hover:bg-white/5 hover:text-snow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
										>
											<span>{item.title}</span>
											<Icon
												icon={ArrowRight01Icon}
												size={16}
												aria-hidden
												className="shrink-0 text-fog transition-transform group-hover:translate-x-1 group-hover:text-snow"
											/>
										</Link>
									</li>
								))}
							</ul>
						</section>
					)}
				</article>
			</div>
		</PublicPageShell>
	);
}
