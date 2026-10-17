"use client";

import { lazy, Suspense, useMemo } from "react";
import type { Components } from "react-markdown";
import Markdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import { z } from "zod";

const Mermaid = lazy(() =>
	import("@/features/greenfield/components/prd/mermaid").then((m) => ({
		default: m.Mermaid,
	})),
);

const SECTION_MARKER_INLINE_RE =
	/<!--\s*(?:\/\s*SECTION(?:\s*:[^>]*)?|SECTION\s*:[^>]*?)\s*-->/gi;

const FENCE_START_RE = /^[ ]{0,3}(`{3,}|~{3,})/;

/**
 * Strips internal structural section markers (`<!-- SECTION: ... -->` and
 * `<!-- /SECTION -->`) from markdown content for presentation, copying, and export,
 * while strictly preserving code fences, inline code, and valid markdown/HTML content.
 */
export function stripInternalSectionMarkers(content: string): string {
	if (!content || !content.includes("<!--")) {
		return content;
	}

	const lines = content.split("\n");
	const resultLines: string[] = [];
	let activeFence: { char: string; length: number } | null = null;

	for (const line of lines) {
		if (activeFence) {
			resultLines.push(line);
			const trimmed = line.trimStart();
			if (
				trimmed.startsWith(activeFence.char.repeat(activeFence.length)) &&
				/^[ ]{0,3}(`+|~+)\s*$/.test(line)
			) {
				const match = line.match(/^[ ]{0,3}(`+|~+)/);
				if (
					match &&
					match[1][0] === activeFence.char &&
					match[1].length >= activeFence.length
				) {
					activeFence = null;
				}
			}
			continue;
		}

		// Check if entering a code fence
		const fenceMatch = line.match(FENCE_START_RE);
		if (fenceMatch) {
			const fenceStr = fenceMatch[1];
			activeFence = { char: fenceStr[0], length: fenceStr.length };
			resultLines.push(line);
			continue;
		}

		// Line is outside code fence.
		// If line solely consists of one or more section markers (and whitespace), omit it.
		const strippedLine = line.replace(SECTION_MARKER_INLINE_RE, "");
		if (strippedLine.trim() === "" && line.trim() !== "") {
			continue;
		}

		// Collapse redundant empty lines outside code fences created by removed markers
		if (strippedLine.trim() === "") {
			if (
				resultLines.length > 0 &&
				resultLines[resultLines.length - 1] === ""
			) {
				continue;
			}
			resultLines.push("");
			continue;
		}

		// If line has code spans (`inline code`) and section markers, preserve the code spans
		if (line.includes("`") && line.includes("<!--")) {
			let processed = "";
			let i = 0;
			while (i < line.length) {
				if (line[i] === "`") {
					let count = 0;
					while (i + count < line.length && line[i + count] === "`") {
						count++;
					}
					const delim = "`".repeat(count);
					const closeIdx = line.indexOf(delim, i + count);
					if (closeIdx !== -1) {
						processed += line.slice(i, closeIdx + count);
						i = closeIdx + count;
						continue;
					}
				}
				const nextBacktick = line.indexOf("`", i);
				const segment =
					nextBacktick === -1 ? line.slice(i) : line.slice(i, nextBacktick);
				processed += segment.replace(SECTION_MARKER_INLINE_RE, "");
				i = nextBacktick === -1 ? line.length : nextBacktick;
			}
			resultLines.push(processed);
		} else {
			resultLines.push(strippedLine);
		}
	}

	return resultLines.join("\n");
}

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
	const sanitizedContent = useMemo(
		() => stripInternalSectionMarkers(content),
		[content],
	);
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
				{sanitizedContent}
			</Markdown>
		</div>
	);
}
