import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { articleHref } from "../data/articles";
import type { HelpArticle } from "../types/help-article";

export function HelpArticleList({
	articles,
	activeId,
	compact = false,
}: {
	articles: readonly HelpArticle[];
	activeId?: string;
	compact?: boolean;
}) {
	return (
		<ul className={cn("flex flex-col gap-0.5", compact && "text-sm")}>
			{articles.map((article) => (
				<li key={article.id}>
					<Link
						to={articleHref(article)}
						aria-current={activeId === article.id ? "page" : undefined}
						className={cn(
							"block rounded-md px-3 py-2.5 text-sm leading-5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo",
							activeId === article.id
								? "bg-white/5 font-medium text-snow"
								: "text-fog hover:bg-white/[0.03] hover:text-snow",
						)}
					>
						{article.title}
					</Link>
				</li>
			))}
		</ul>
	);
}
