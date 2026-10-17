import type { CrawlGraphEdge } from "@/features/scrape/utils/crawl-graph";

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
					id="arrow-primary"
					viewBox="0 0 10 10"
					refX="6"
					refY="5"
					markerWidth="6"
					markerHeight="6"
					orient="auto-start-reverse"
				>
					<path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#6b7280" />
				</marker>
				<marker
					id="arrow-active-out"
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
					id="arrow-active-in"
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
				const isSelectedEdge = isFromSelected || isToSelected;
				const hasSelection = Boolean(selectedUrl);

				let stroke = "#5a5a5a";
				let strokeWidth = edge.kind === "primary" ? 1.5 : 1.2;
				let opacity = 0.75;
				let markerEnd: string | undefined = "url(#arrow-primary)";

				if (hasSelection) {
					if (isFromSelected) {
						stroke = "#818cf8";
						strokeWidth = 2.2;
						opacity = 1;
						markerEnd = "url(#arrow-active-out)";
					} else if (isToSelected) {
						stroke = "#38bdf8";
						strokeWidth = 2.2;
						opacity = 1;
						markerEnd = "url(#arrow-active-in)";
					} else {
						opacity = 0.18;
						stroke = "#404040";
						markerEnd = undefined;
					}
				} else if (edge.kind !== "primary") {
					opacity = 0.45;
					stroke = "#737373";
				}

				return (
					<path
						key={`${edge.from} -> ${edge.to}`}
						d={edge.path}
						fill="none"
						stroke={stroke}
						strokeWidth={strokeWidth}
						strokeOpacity={opacity}
						strokeDasharray={edge.kind !== "primary" ? "5 4" : undefined}
						markerEnd={
							isSelectedEdge || edge.kind === "primary" ? markerEnd : undefined
						}
						className="transition-colors duration-150"
					/>
				);
			})}
		</svg>
	);
}
