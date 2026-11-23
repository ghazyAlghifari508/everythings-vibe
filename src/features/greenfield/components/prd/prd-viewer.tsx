"use client";

import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";
import {
	lazy,
	memo,
	Suspense,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import type { Components } from "react-markdown";
import Markdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";

// ponytail: lazy-load Mermaid so the ~2-3MB mermaid library (layout engines,
// flowchart/sequence/class parsers) stays out of the main PRD chunk. Only
// fetched when a PRD actually contains a mermaid code fence. autoCodeSplitting
// handles route-level split; this handles component-level split within a route.
const Mermaid = lazy(() =>
	import("./mermaid").then((m) => ({ default: m.Mermaid })),
);

import { Icon } from "@/components/ui/icon";
import { usePanelResize } from "@/features/greenfield/hooks/use-panel-resize";
import {
	type ComparePair,
	resolveComparePair,
} from "@/features/greenfield/utils/diff-utils";
import { cn } from "@/lib/utils";
import type { Plan } from "@/types/database";
import { PrdDiffViewer } from "./prd-diff-viewer";
import { TableOfContents } from "./table-of-contents";
import { VersionHistory } from "./version-history";

// ponytail: extracted to module scope so react-markdown re-parses only once
// (not on every parent render). Pure functions — no useMemo needed.
const markdownComponents: Components = {
	h2: ({ children, ...props }) => {
		const text = String(children).replace(/<[^>]*>/g, "");
		const id = text.toLowerCase().replace(/[^\w]+/g, "-");
		return (
			<h2 id={id} {...props}>
				{children}
			</h2>
		);
	},
	h3: ({ children, ...props }) => {
		const text = String(children).replace(/<[^>]*>/g, "");
		const id = text.toLowerCase().replace(/[^\w]+/g, "-");
		return (
			<h3 id={id} {...props}>
				{children}
			</h3>
		);
	},
	h4: ({ children, ...props }) => {
		const text = String(children).replace(/<[^>]*>/g, "");
		const id = text.toLowerCase().replace(/[^\w]+/g, "-");
		return (
			<h4 id={id} {...props}>
				{children}
			</h4>
		);
	},
	code: ({ className, children, ...props }) => {
		const match = /language-(\w+)/.exec(className || "");
		if (match && match[1] === "mermaid") {
			return (
				<Suspense
					fallback={
						<div className="animate-pulse bg-black/5 dark:bg-white/5 h-32 rounded-lg my-6" />
					}
				>
					<Mermaid chart={String(children).replace(/\n$/, "")} />
				</Suspense>
			);
		}
		return (
			<code className={className} {...props}>
				{children}
			</code>
		);
	},
};

// ponytail: module-scope stable identities. Inline arrays like
// `[remarkGfm]` create a new reference every render, defeating react-markdown's
// internal memoization and forcing a full document re-parse.
const remarkPlugins = [remarkGfm];
const rehypePlugins = [rehypeHighlight];

// ponytail: extracted + memoized so TOC width dragging (leftWidth state lives
// inside this file and re-renders it every animation frame) never re-parses or
// re-renders the markdown document. Mirrors how chat-panel resizing stays
// smooth: the heavy subtree is memoized away from the width state owner.
const PrdPreview = memo(function PrdPreview({ content }: { content: string }) {
	return (
		<article className="prd-content mx-auto max-w-3xl px-8 pb-16 pt-8 text-mist">
			<Markdown
				remarkPlugins={remarkPlugins}
				rehypePlugins={rehypePlugins}
				components={markdownComponents}
			>
				{content}
			</Markdown>
		</article>
	);
});

// Canvas placeholder for the pre-token phase: grey text blocks read as a
// document being written, so the canvas shows the PRD taking shape instead of
// an empty pane. No copy is rendered — the chat section checklist is the only
// textual status; the label is exposed to assistive tech only. Bars use the
// shared `fog` token so the skeleton stays neutral in light and dark.
const SKELETON_BAR = "rounded bg-fog/10";

// Heading/paragraph/table rhythm of the real document, widths only. A flat list
// keeps the placeholder simple and honest — it mirrors the PRD's shape without
// inventing content or structure that could drift from the rendered output.
const SKELETON_LINES = [
	"h-7 w-2/5 bg-fog/15",
	"mt-5 h-3.5 w-3/5",
	"mt-10 h-4 w-1/3",
	"mt-3 h-3.5 w-full",
	"mt-3 h-3.5 w-11/12",
	"mt-3 h-3.5 w-4/5",
	"mt-3 h-3.5 w-5/6",
	"mt-10 h-4 w-2/5",
	"mt-3 h-3.5 w-full",
	"mt-3 h-3.5 w-10/12",
	"mt-3 h-3.5 w-2/3",
	"mt-10 h-4 w-1/4",
	"mt-3 h-3.5 w-full",
	"mt-3 h-3.5 w-11/12",
	"mt-3 h-3.5 w-9/12",
] as const;

const PrdSkeleton = memo(function PrdSkeleton() {
	return (
		<output
			aria-label="Menyusun PRD"
			data-testid="prd-skeleton"
			className="mx-auto block max-w-3xl animate-pulse px-8 pb-16 pt-8 motion-reduce:animate-none"
		>
			{SKELETON_LINES.map((line) => (
				<div key={line} className={cn(SKELETON_BAR, line)} />
			))}
		</output>
	);
});

interface PrdVersion {
	id: string;
	version: number;
	content: string;
	change_summary: string | null;
	created_at: string;
}

interface PrdViewerProps {
	content: string;
	className?: string;
	plan?: Plan;
	versions?: PrdVersion[];
	currentVersion?: number;
	onSelectVersion?: (content: string, version: number) => void;
	isGenerating?: boolean;
}

export const PrdViewer = memo(function PrdViewer({
	content,
	className,
	plan = "free",
	versions,
	currentVersion,
	onSelectVersion,
	isGenerating = false,
}: PrdViewerProps) {
	const { leftWidth, onStartDragLeft, isDraggingLeft } = usePanelResize();
	const scrollRef = useRef<HTMLDivElement>(null);
	const versionTriggerRef = useRef<HTMLButtonElement>(null);
	const returnFocusRef = useRef(false);
	const [comparePair, setComparePair] = useState<ComparePair | null>(null);

	// Compare is a temporary mode pinned to persisted records at the moment it
	// is opened: the live/streaming canvas is never a diff side, and later
	// version changes cannot silently swap the pair being read.
	const isComparing = comparePair !== null;

	const openCompare = useCallback(() => {
		const pair = resolveComparePair(versions ?? [], currentVersion);
		if (pair) setComparePair(pair);
	}, [versions, currentVersion]);

	const closeCompare = useCallback((restoreFocus = false) => {
		returnFocusRef.current = restoreFocus;
		setComparePair(null);
	}, []);

	// A new generation/revision reclaims the canvas. Leave the temporary
	// compare view so live content is never hidden behind a stale snapshot;
	// version actions stay disabled until the stream settles.
	useEffect(() => {
		if (isGenerating) closeCompare();
	}, [isGenerating, closeCompare]);

	useEffect(() => {
		if (!isComparing) return;
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") closeCompare(true);
		};
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [isComparing, closeCompare]);

	useEffect(() => {
		if (!isComparing && returnFocusRef.current) {
			returnFocusRef.current = false;
			versionTriggerRef.current?.focus();
		}
	}, [isComparing]);

	// Auto-scroll logic when new content arrives
	// biome-ignore lint/correctness/useExhaustiveDependencies: intentional re-scroll on content change
	useEffect(() => {
		if (scrollRef.current) {
			const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
			// If we're within 150px of the bottom, auto scroll down to follow new content
			const isNearBottom = scrollHeight - scrollTop - clientHeight < 150;
			if (isNearBottom) {
				scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
			}
		}
	}, [content]);

	// Membersihkan sisa tag markdown (misal ```markdown di awal dan ``` di akhir)
	// yang sering kali ditambahkan secara otomatis oleh AI.
	// ponytail: memoize by `content` so we don't re-run the regex chain on every
	// render delta (PRD streaming can produce 200+ renders).
	const cleanContent = useMemo(() => {
		let cleaned = content.replace(/<!--[\s\S]*?-->/g, "").trim();

		const startMatch = cleaned.match(/```(?:markdown|md)\s*\n/i);

		if (startMatch) {
			if (startMatch.index !== undefined && startMatch.index < 500) {
				const startIndex = startMatch.index + startMatch[0].length;
				const lastIndex = cleaned.lastIndexOf("```");

				if (lastIndex > startIndex) {
					cleaned = cleaned.substring(startIndex, lastIndex);
				} else {
					cleaned = cleaned.substring(startIndex);
				}
			}
		} else {
			if (cleaned.startsWith("```\n")) {
				const lastIndex = cleaned.lastIndexOf("```");
				if (lastIndex > 3) {
					cleaned = cleaned.substring(4, lastIndex);
				}
			} else if (cleaned.startsWith("```")) {
				const lastIndex = cleaned.lastIndexOf("```");
				if (lastIndex > 2) {
					cleaned = cleaned.substring(3, lastIndex);
				}
			}
		}
		// Strip ===DONE=== marker that AI outputs as completion signal.
		// Stop sequence should catch it, but sometimes it leaks into saved content.
		cleaned = cleaned.replace(/={3,}DONE={3,}/gi, "").trim();

		return cleaned.trim();
	}, [content]);

	return (
		<div className={cn("flex h-full", className)}>
			{/* Width/handle live on this wrapper: the aside below scrolls
			    (overflow-y-auto), and a scrolling ancestor clips absolutely
			    positioned children at its padding edge — a handle inside the
			    aside would lose its outboard half, leaving the grab area
			    shifted left of the divider. */}
			<div
				style={{ width: `${leftWidth}px`, background: "var(--bg-page)" }}
				className={cn(
					"relative hidden h-full shrink-0 md:block",
					!isDraggingLeft && "transition-[width] duration-300",
				)}
			>
				<aside className="h-full w-full overflow-y-auto overflow-x-hidden border-r border-graphite bg-onyx p-4">
					<TableOfContents content={content} />
				</aside>
				{/* Drag handle — 8px strip centered across the divider */}
				{/* biome-ignore lint/a11y/noStaticElementInteractions: drag handle for panel resize */}
				<div
					className="absolute right-[-4px] top-0 z-10 h-full w-2 cursor-col-resize transition-colors hover:bg-indigo/20"
					onMouseDown={onStartDragLeft}
				/>
			</div>

			{/* Document is the default view. Controls appear only for multiple
			    persisted versions; compare is an explicit temporary mode. */}
			<div className="flex-1 flex flex-col min-w-0">
				{isComparing && comparePair && (
					<div className="shrink-0 flex items-center justify-between gap-3 border-b border-graphite bg-charcoal/20 px-4 py-2">
						<p className="font-inter text-xs font-[510] text-fog">
							Versi {comparePair.oldVersion} → Versi {comparePair.newVersion}
						</p>
						<button
							type="button"
							onClick={() => closeCompare(true)}
							className="flex min-h-11 items-center gap-1.5 rounded-md px-2 font-inter text-xs font-[510] text-fog transition-colors hover:text-snow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo md:min-h-8"
						>
							<Icon icon={ArrowLeft01Icon} size={14} aria-hidden="true" />
							Kembali ke dokumen
						</button>
					</div>
				)}

				{onSelectVersion && versions && versions.length > 1 && !isComparing && (
					<div className="shrink-0 flex justify-end border-b border-graphite bg-charcoal/20 px-4 py-1.5">
						<VersionHistory
							versions={versions}
							currentVersion={currentVersion ?? 1}
							onSelectVersion={onSelectVersion}
							onCompare={openCompare}
							triggerRef={versionTriggerRef}
							disabled={isGenerating}
							plan={plan}
						/>
					</div>
				)}

				<div
					ref={scrollRef}
					className="flex-1 overflow-y-auto relative scroll-smooth"
				>
					{isComparing && comparePair ? (
						<div className="mx-auto max-w-3xl px-4 py-4">
							<PrdDiffViewer
								oldContent={comparePair.oldContent}
								newContent={comparePair.newContent}
							/>
						</div>
					) : isGenerating && !cleanContent ? (
						<PrdSkeleton />
					) : (
						<PrdPreview content={cleanContent} />
					)}
				</div>
			</div>
		</div>
	);
});
