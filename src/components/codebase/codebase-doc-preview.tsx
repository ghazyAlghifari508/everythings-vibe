"use client";

import { memo, type ComponentPropsWithoutRef } from "react";
import Markdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import { TableOfContents } from "@/components/prd/table-of-contents";
import { cn } from "@/lib/utils";

function headingId(children: ComponentPropsWithoutRef<"h2">["children"]): string {
	return String(children)
		.replace(/<[^>]*>/g, "")
		.toLowerCase()
		.replace(/[^\w]+/g, "-");
}

// Heading ids must mirror TableOfContents' id algorithm exactly so anchor
// navigation lands on the right section (same contract as prd-viewer.tsx).
const markdownComponents: ComponentPropsWithoutRef<typeof Markdown>["components"] =
	{
		h2: ({ children, ...props }) => (
			<h2 id={headingId(children)} {...props}>
				{children}
			</h2>
		),
		h3: ({ children, ...props }) => (
			<h3 id={headingId(children)} {...props}>
				{children}
			</h3>
		),
		h4: ({ children, ...props }) => (
			<h4 id={headingId(children)} {...props}>
				{children}
			</h4>
		),
	};

const remarkPlugins = [remarkGfm];
const rehypePlugins = [rehypeHighlight];

export interface CodebaseDocPreviewProps {
	content: string;
	className?: string;
}

export const CodebaseDocPreview = memo(function CodebaseDocPreview({
	content,
	className,
}: CodebaseDocPreviewProps) {
	return (
		<div
			data-testid="codebase-doc-preview"
			className={cn("flex h-full min-h-0 gap-6", className)}
		>
			<aside className="hidden w-56 shrink-0 overflow-y-auto border-r border-graphite pr-4 md:block">
				<TableOfContents content={content} className="sticky top-0" />
			</aside>
			<article className="prd-content min-w-0 flex-1 self-start text-sm leading-7 text-mist">
				<Markdown
					remarkPlugins={remarkPlugins}
					rehypePlugins={rehypePlugins}
					components={markdownComponents}
				>
					{content}
				</Markdown>
			</article>
		</div>
	);
});
