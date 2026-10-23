import { useMemo } from "react";
import type { scrapePages } from "@/db/schema";
import type { CrawlGraphNode } from "@/features/scrape/utils/crawl-graph";
import { cn } from "@/lib/utils";
import { statusMark, statusText } from "./crawl-page-status";

type Page = typeof scrapePages.$inferSelect;

export function CrawlSitemapNodes({
	pages,
	nodes,
	selectedId,
	onSelect,
}: {
	pages: Page[];
	nodes: CrawlGraphNode[];
	selectedId: string;
	onSelect: (id: string) => void;
}) {
	const byUrl = useMemo(() => {
		const map = new Map<string, Page>();
		for (const row of pages) map.set(row.url, row);
		return map;
	}, [pages]);

	return (
		<>
			{nodes.map((node) => {
				const row = byUrl.get(node.url);
				if (!row) return null;
				const selected = row.id === selectedId;

				return (
					<button
						key={node.url}
						type="button"
						onClick={() => onSelect(row.id)}
						aria-pressed={selected}
						aria-label={`${node.label} — ${statusText(row.status)}`}
						title={`${row.title ? `${row.title}\n` : ""}${row.url}\nStatus: ${statusText(row.status)} · Depth ${row.depth}\nTautan: ${node.incomingCount} masuk, ${node.outgoingCount} keluar`}
						className={cn(
							"absolute flex flex-col justify-between rounded-lg border p-2.5 text-left transition-all focus-visible:ring-2 focus-visible:ring-indigo",
							selected
								? "border-indigo bg-charcoal shadow-md ring-2 ring-indigo/40"
								: "border-graphite bg-charcoal/95 hover:border-fog hover:bg-charcoal",
						)}
						style={{
							left: node.x,
							top: node.y,
							width: node.w,
							height: node.h,
						}}
					>
						<div className="flex w-full items-center justify-between gap-1.5">
							<span className="flex min-w-0 items-center gap-1.5 truncate">
								<span
									aria-hidden
									className={cn(
										"text-xs font-semibold",
										row.status === "failed"
											? "text-crimson"
											: row.status === "skipped"
												? "text-fog"
												: "text-mist",
									)}
								>
									{statusMark(row.status)}
								</span>
								<span className="truncate text-xs font-medium text-snow">
									{node.label}
								</span>
							</span>

							{node.isRoot && (
								<span className="shrink-0 rounded bg-indigo/20 px-1 py-0.5 text-[10px] font-medium text-indigo">
									Awal
								</span>
							)}
						</div>

						<div className="flex w-full items-center justify-between gap-2 text-[11px] text-fog">
							<span className="shrink-0 tabular-nums">depth {row.depth}</span>
							<span className="truncate text-[10px] tabular-nums">
								{node.incomingCount} masuk · {node.outgoingCount} keluar
							</span>
						</div>
					</button>
				);
			})}
		</>
	);
}
