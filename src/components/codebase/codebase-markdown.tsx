"use client";

import { lazy, Suspense } from "react";
import Markdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import { z } from "zod";

const Mermaid = lazy(() =>
	import("@/components/prd/mermaid").then((m) => ({ default: m.Mermaid })),
);

const prdVersionRowSchema = z.object({
	version: z.number(),
	content: z.string(),
});

const prdVersionsSchema = z.array(prdVersionRowSchema);

export type PrdVersionRow = z.infer<typeof prdVersionRowSchema>;

export function parsePrdVersions(input: unknown): PrdVersionRow[] | null {
	const parsed = prdVersionsSchema.safeParse(input);
	return parsed.success ? parsed.data : null;
}

export function selectLatestPrdContent(
	rows: readonly PrdVersionRow[],
): string | null {
	let latest: PrdVersionRow | null = null;
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
				remarkPlugins={[remarkGfm]}
				rehypePlugins={[rehypeHighlight]}
				components={{
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
				}}
			>
				{content}
			</Markdown>
		</div>
	);
}
