import type { IconProps } from "@/components/ui/icon";

export type HelpCategoryId =
	| "mulai"
	| "vibeplan"
	| "studio"
	| "scrape"
	| "template"
	| "cli"
	| "billing";

/** Only routes that actually exist may appear in public article copy. */
export type ProductHref =
	| "/"
	| "/bantuan"
	| "/faq"
	| "/pricing"
	| "/history"
	| "/plan/new"
	| "/plan/codebase"
	| "/codebases"
	| "/design"
	| "/scrape"
	| "/scrape/history"
	| "/templates"
	| "/settings/billing"
	| "/settings/feedback"
	| "/settings/api-keys";

export type HelpHref = ProductHref | `/bantuan/${string}`;

export interface HelpCategory {
	readonly id: HelpCategoryId;
	readonly label: string;
	readonly description: string;
	readonly intro: string;
	readonly icon: IconProps["icon"];
}

export interface HelpArticleSection {
	readonly heading: string;
	readonly paragraphs?: readonly string[];
	readonly steps?: readonly string[];
	readonly bullets?: readonly string[];
	readonly note?: string;
	readonly link?: { readonly label: string; readonly to: HelpHref };
}

export interface HelpArticle {
	readonly id: string;
	readonly categoryId: HelpCategoryId;
	readonly title: string;
	readonly description: string;
	/** Indonesian terms and useful aliases, searched alongside article copy. */
	readonly keywords: readonly string[];
	readonly sections: readonly HelpArticleSection[];
	readonly relatedIds?: readonly string[];
}

export interface HelpSearchResult {
	readonly article: HelpArticle;
	readonly score: number;
}
