import type { CrawlGraphEdge } from "@/features/scrape/utils/crawl-graph";

/**
 * Draws the relationship lines between pages.
 *
 * Discovery edges are solid because they carry the crawl hierarchy, observed
 * links are dashed because they only say that a document linked somewhere.
 * When a page is selected, only its own lines are highlighted so the rest of
 * the graph stays readable.
 */
export function CrawlSitemapEdges({
	width,
	height,
	edges,
	selectedUrl,
}: {
	width: number;
	height: number;
	edges: CrawlGraphEdge[];
	selectedUrl: string;
}) {
	return (
		<svg
			className="absolute left-0 top-0 pointer-events-none"
			width={width}
			height={height}
			aria-hidden="true"
			focusable="false"
		>
			<title>Relasi tautan crawl</title>
			<defs>
				<marker
					id="crawl-arrow-default"
					viewBox="0 0 10 10"
					refX="6"
					refY="5"
					markerWidth="6"
					markerHeight="6"
					orient="auto-start-reverse"
				>
					<path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="var(--color-fog)" />
				</marker>
				<marker
					id="crawl-arrow-out"
					viewBox="0 0 10 10"
					refX="6"
					refY="5"
					markerWidth="6"
					markerHeight="6"
					orient="auto-start-reverse"
				>
					<path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#818cf8" />
				</marker>
				<marker
					id="crawl-arrow-in"
					viewBox="0 0 10 10"
					refX="6"
					refY="5"
					markerWidth="6"
					markerHeight="6"
					orient="auto-start-reverse"
				>
					<path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#38bdf8" />
				</marker>
			</defs>

			{edges.map((edge) => {
				const isFromSelected = Boolean(
					selectedUrl && edge.from === selectedUrl,
				);
				const isToSelected = Boolean(selectedUrl && edge.to === selectedUrl);
				const hasSelection = Boolean(selectedUrl);
				const isObserved = edge.kind !== "primary";

				let stroke = "var(--color-fog)";
				let strokeWidth = isObserved ? 1.2 : 1.5;
				let opacity = isObserved ? 0.55 : 0.7;
				let markerEnd = "url(#crawl-arrow-default)";

				if (hasSelection) {
					if (isFromSelected) {
						stroke = "#818cf8";
						strokeWidth = 2.2;
						opacity = 1;
						markerEnd = "url(#crawl-arrow-out)";
					} else if (isToSelected) {
						stroke = "#38bdf8";
						strokeWidth = 2.2;
						opacity = 1;
						markerEnd = "url(#crawl-arrow-in)";
					} else {
						opacity = 0.16;
					}
				}

				return (
					<path
						key={`${edge.kind}:${edge.from}->${edge.to}`}
						d={edge.path}
						fill="none"
						stroke={stroke}
						strokeWidth={strokeWidth}
						strokeOpacity={opacity}
						strokeDasharray={isObserved ? "5 4" : undefined}
						markerEnd={markerEnd}
						data-edge-kind={edge.kind}
						data-edge-from={edge.from}
						data-edge-to={edge.to}
						className="transition-colors duration-150"
					/>
				);
			})}
		</svg>
	);
}
