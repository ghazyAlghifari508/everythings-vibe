"use client";

import { memo } from "react";
import Markdown from "react-markdown";
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

/**
 * Document preview for the existing-codebase workspace (PRD and Acceptance
 * Criteria). The document itself owns the panel width — the greenfield PRD
 * viewer keeps its own table of contents, and duplicating a narrow sidebar
 * here only squeezed the content it was meant to help navigate.
 */
export const CodebaseDocPreview = memo(function CodebaseDocPreview({
	content,
	className,
}: CodebaseDocPreviewProps) {
	return (
		<div
			data-testid="codebase-doc-preview"
			className={cn("h-full min-h-0", className)}
		>
			<article className="prd-content min-w-0 text-sm leading-7 text-mist">
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
