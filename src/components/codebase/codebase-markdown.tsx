"use client";

import { lazy, Suspense } from "react";
import type { Components } from "react-markdown";
import Markdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import { z } from "zod";

const Mermaid = lazy(() =>
	import("@/components/prd/mermaid").then((m) => ({ default: m.Mermaid })),
);

// Heading ids must mirror TableOfContents' id algorithm exactly so anchor
// navigation lands on the right section (same contract as prd-viewer.tsx).
function headingId(children: React.ReactNode): string {
	return String(children)
		.replace(/<[^>]*>/g, "")
		.toLowerCase()
		.replace(/[^\w]+/g, "-");
}

/**
 * One shared Markdown renderer for every codebase planning artifact
 * (feature/PRD/AC/task). Mermaid fences render as real diagrams here, so both
 * the standalone markdown wrapper and the TOC document preview agree on how a
 * document is drawn instead of drifting into two incompatible renderers.
 */
export const codebaseMarkdownComponents: Components = {
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
	code: ({ className, children }) => {
		const match = /language-(\w+)/.exec(className ?? "");
		if (match?.[1] === "mermaid") {
			return (
				<Suspense
					fallback={
						<div className="my-4 h-32 animate-pulse rounded-lg bg-steel/20" />
					}
				>
					<Mermaid chart={String(children).replace(/\n$/, "")} />
				</Suspense>
			);
		}
		return <code className={className}>{children}</code>;
	},
};

// Module-scope plugin identities keep react-markdown's internal memoization
// effective: inline arrays re-parse the whole document on every render.
export const codebaseRemarkPlugins = [remarkGfm];
export const codebaseRehypePlugins = [rehypeHighlight];

const versionRowSchema = z.object({
	version: z.number(),
	content: z.string(),
});

const versionsSchema = z.array(versionRowSchema);

export type VersionRow = z.infer<typeof versionRowSchema>;

export function parseVersionRows(input: unknown): VersionRow[] | null {
	const parsed = versionsSchema.safeParse(input);
	return parsed.success ? parsed.data : null;
}

export function selectLatestVersionContent(
	rows: readonly VersionRow[],
): string | null {
	let latest: VersionRow | null = null;
	for (const row of rows) {
		if (!latest || row.version > latest.version) latest = row;
	}
	const content = latest?.content.trim();
	return content ? content : null;
}

export function CodebaseMarkdown({ content }: { content: string }) {
	return (
		<div
			data-testid="codebase-markdown"
			className="prd-content max-w-none text-sm leading-7"
		>
			<Markdown
				remarkPlugins={codebaseRemarkPlugins}
				rehypePlugins={codebaseRehypePlugins}
				components={codebaseMarkdownComponents}
			>
				{content}
			</Markdown>
		</div>
	);
}
