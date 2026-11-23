import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { Link } from "@tanstack/react-router";
import { HubBreadcrumb } from "@/components/home/hub-breadcrumb";
import { PublicPageShell } from "@/components/layout";
import { Icon } from "@/components/ui/icon";
import { PageHeading } from "@/components/ui/page-heading";
import { articleHref } from "../data/articles";
import type { HelpArticle, HelpCategory } from "../types/help-article";

export function HelpCategoryPage({
	category,
	articles,
}: {
	category: HelpCategory;
	articles: readonly HelpArticle[];
}) {
	return (
		<PublicPageShell className="max-w-5xl gap-8">
			<HubBreadcrumb
				current={category.label}
				ancestors={[{ label: "Bantuan", to: "/bantuan" }]}
			/>

			<header className="flex flex-col gap-3">
				<div className="flex items-center gap-3">
					<span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-graphite bg-charcoal text-fog">
						<Icon icon={category.icon} size={18} aria-hidden />
					</span>
					<PageHeading variant="workspace">{category.label}</PageHeading>
				</div>
				<p className="max-w-2xl text-sm leading-6 text-fog">{category.intro}</p>
			</header>

			<section aria-label={`Panduan ${category.label}`}>
				<ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
					{articles.map((article) => (
						<li key={article.id}>
							<Link
								to={articleHref(article)}
								className="group flex h-full min-h-32 flex-col justify-between gap-3 rounded-xl border border-graphite bg-charcoal/40 p-5 transition-colors hover:border-steel hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
							>
								<span className="text-sm font-semibold text-snow">
									{article.title}
								</span>
								<span className="flex items-end justify-between gap-3">
									<span className="text-xs leading-5 text-fog">
										{article.description}
									</span>
									<Icon
										icon={ArrowRight01Icon}
										size={16}
										aria-hidden
										className="shrink-0 text-fog transition-transform group-hover:translate-x-1 group-hover:text-snow"
									/>
								</span>
							</Link>
						</li>
					))}
				</ul>
			</section>
		</PublicPageShell>
	);
}
