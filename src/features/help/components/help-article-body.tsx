import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { Link } from "@tanstack/react-router";
import { Icon } from "@/components/ui/icon";
import type { HelpArticle } from "../types/help-article";

export function HelpArticleBody({ article }: { article: HelpArticle }) {
	return (
		<div className="mt-8 flex flex-col gap-9">
			{article.sections.map((section) => (
				<section key={section.heading} className="flex flex-col gap-3">
					<h2 className="font-inter text-lg font-medium leading-snug text-snow">
						{section.heading}
					</h2>
					{section.paragraphs?.map((paragraph) => (
						<p key={paragraph} className="text-sm leading-7 text-mist">
							{paragraph}
						</p>
					))}
					{section.steps && (
						<ol className="flex list-decimal flex-col gap-2 pl-5 text-sm leading-7 text-mist marker:text-fog">
							{section.steps.map((step) => (
								<li key={step} className="pl-1">
									{step}
								</li>
							))}
						</ol>
					)}
					{section.bullets && (
						<ul className="flex list-disc flex-col gap-2 pl-5 text-sm leading-7 text-mist marker:text-fog">
							{section.bullets.map((bullet) => (
								<li key={bullet} className="pl-1">
									{bullet}
								</li>
							))}
						</ul>
					)}
					{section.note && (
						<p className="rounded-lg border border-graphite bg-charcoal/60 px-4 py-3 text-sm leading-6 text-fog">
							{section.note}
						</p>
					)}
					{section.link && (
						<Link
							to={section.link.to}
							className="inline-flex min-h-11 items-center gap-2 self-start text-sm font-medium text-indigo transition-colors hover:text-snow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
						>
							{section.link.label}
							<Icon icon={ArrowRight01Icon} size={16} aria-hidden />
						</Link>
					)}
				</section>
			))}
		</div>
	);
}
