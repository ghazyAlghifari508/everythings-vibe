"use client";

import { memo } from "react";
import Markdown from "react-markdown";
import { TableOfContents } from "@/components/prd/table-of-contents";
import { cn } from "@/lib/utils";
import {
	codebaseMarkdownComponents,
	codebaseRehypePlugins,
	codebaseRemarkPlugins,
} from "./codebase-markdown";

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
					remarkPlugins={codebaseRemarkPlugins}
					rehypePlugins={codebaseRehypePlugins}
					components={codebaseMarkdownComponents}
				>
					{content}
				</Markdown>
			</article>
		</div>
	);
});
