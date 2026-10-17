"use client";

import { Scan } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ZoomControls } from "@/components/ui/zoom-controls";
import type { scrapePages } from "@/db/schema";
import { layoutCrawlGraph } from "@/features/scrape/utils/crawl-graph";
import { useCanvasZoom } from "@/hooks/use-canvas-zoom";
import { cn } from "@/lib/utils";

type Page = typeof scrapePages.$inferSelect;

function statusMark(status: Page["status"]): string {
	if (status === "completed") return "✓";
	if (status === "failed") return "!";
	if (status === "skipped") return "⊘";
	return "○";
}

function statusLabel(status: Page["status"]): string {
	if (status === "completed") return "Berhasil";
	if (status === "failed") return "Gagal";
	if (status === "skipped") return "Dilewati";
	return "Antre";
}

export function CrawlSitemapGraph({
	pages,
	selectedId,
	onSelect,
}: {
	pages: Page[];
	selectedId: string;
	onSelect: (id: string) => void;
}) {
	const [viewMode, setViewMode] = useState<"discovery" | "all">("discovery");

	const layout = useMemo(
		() => layoutCrawlGraph(pages, { viewMode, rankdir: "TB" }),
		[pages, viewMode],
	);

	const {
		zoom,
		pan,
		setZoom,
		setPan,
		zoomIn,
		zoomOut,
		resetZoom,
		startPan,
		updatePan,
		endPan,
		nudgePan,
		onWheel,
		minZoom,
		maxZoom,
	} = useCanvasZoom();

	const containerRef = useRef<HTMLDivElement>(null);
	const fittedRef = useRef(false);

	const byId = useMemo(() => {
		const map = new Map<string, Page>();
		for (const row of pages) map.set(row.id, row);
		return map;
	}, [pages]);

	const byUrl = useMemo(() => {
		const map = new Map<string, Page>();
		for (const row of pages) map.set(row.url, row);
		return map;
	}, [pages]);

	const selectedPage = byId.get(selectedId);
	const selectedUrl = selectedPage?.url ?? "";

	const fitToView = useCallback(() => {
		if (!layout.width || !layout.height || !containerRef.current) return;
		const rect = containerRef.current.getBoundingClientRect();
		const padding = 48;
		const availableWidth = rect.width - padding * 2;
		const availableHeight = rect.height - padding * 2;
		if (availableWidth <= 0 || availableHeight <= 0) return;

		const fitZoom = Math.min(
			availableWidth / layout.width,
			availableHeight / layout.height,
			1,
		);
		const clamped = Math.max(minZoom, Math.min(maxZoom, fitZoom));
		setZoom(clamped);
		setPan({
			x: Math.max(16, (rect.width - layout.width * clamped) / 2),
			y: 24,
		});
	}, [layout.width, layout.height, minZoom, maxZoom, setZoom, setPan]);

	useEffect(() => {
		if (!layout.width || !layout.height || !containerRef.current) return;
		if (fittedRef.current) return;
		fittedRef.current = true;
		fitToView();
	}, [layout.width, layout.height, fitToView]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: pages identity resets fit
	useEffect(() => {
		fittedRef.current = false;
	}, [pages]);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
				e.preventDefault();
				nudgePan(e.key, 40);
			}
			if (e.key.toLowerCase() === "f") {
				e.preventDefault();
				fitToView();
			}
		},
		[nudgePan, fitToView],
	);

	// Determine active edges:
	// In discovery mode, if a node is selected, include its secondary links as well so
	// the user can see all relationships for the focused node.
	const displayEdges = useMemo(() => {
		if (viewMode === "all") return layout.edges;
		if (!selectedUrl) return layout.primaryEdges;
		const selectedSecondary = layout.secondaryEdges.filter(
			(e) => e.from === selectedUrl || e.to === selectedUrl,
		);
		return [...layout.primaryEdges, ...selectedSecondary];
	}, [
		viewMode,
		layout.edges,
		layout.primaryEdges,
		layout.secondaryEdges,
		selectedUrl,
	]);

	if (pages.length === 0) return null;

	return (
		<div className="space-y-3">
			<div
				ref={containerRef}
				className="relative flex h-[380px] w-full flex-col touch-none select-none overflow-hidden overscroll-none rounded-xl border border-graphite bg-onyx outline-none focus-visible:ring-2 focus-visible:ring-indigo sm:h-[460px]"
				style={{ maxWidth: "100%" }}
				onPointerDown={startPan}
				onPointerMove={updatePan}
				onPointerUp={endPan}
				onPointerLeave={endPan}
				onWheel={onWheel}
				onKeyDown={handleKeyDown}
				role="application"
				aria-label="Visual sitemap: peta halaman berdasarkan link yang ditemukan saat crawl"
			>
				{/* Top Workspace Toolbar */}
				<div
					className="z-10 flex flex-wrap items-center justify-between gap-2 border-b border-graphite/60 bg-onyx/90 px-3 py-2 backdrop-blur-sm sm:px-4"
					onPointerDown={(e) => e.stopPropagation()}
				>
					<div
						className="flex items-center gap-1 rounded-lg border border-graphite bg-charcoal p-0.5"
						role="tablist"
						aria-label="Mode tampilan sitemap"
					>
						<button
							type="button"
							role="tab"
							aria-selected={viewMode === "discovery"}
							onClick={() => setViewMode("discovery")}
							className={cn(
								"rounded-md px-2.5 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-indigo",
								viewMode === "discovery"
									? "bg-onyx text-snow shadow-xs"
									: "text-fog hover:text-snow",
							)}
						>
							Discovery Map
						</button>
						<button
							type="button"
							role="tab"
							aria-selected={viewMode === "all"}
							onClick={() => setViewMode("all")}
							className={cn(
								"rounded-md px-2.5 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-indigo",
								viewMode === "all"
									? "bg-onyx text-snow shadow-xs"
									: "text-fog hover:text-snow",
							)}
						>
							All Links
						</button>
					</div>

					<div className="flex items-center gap-1.5">
						<button
							type="button"
							onClick={fitToView}
							title="Pusatkan grafik (F)"
							aria-label="Pusatkan grafik"
							className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-graphite bg-charcoal px-2.5 text-xs font-medium text-fog transition-colors hover:bg-white/5 hover:text-snow focus-visible:ring-2 focus-visible:ring-indigo"
						>
							<Scan size={14} aria-hidden />
							<span>Fit</span>
						</button>
						<ZoomControls
							zoom={zoom}
							onZoomIn={zoomIn}
							onZoomOut={zoomOut}
							onReset={resetZoom}
						/>
					</div>
				</div>

				{/* Transformable Canvas Area */}
				<div className="relative flex-1 overflow-hidden">
					<div
						className="absolute left-0 top-0 origin-top-left will-change-transform"
						style={{
							transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
							width: layout.width,
							height: layout.height,
						}}
					>
						{/* SVG Edges Layer */}
						<svg
							className="absolute left-0 top-0 pointer-events-none"
							width={layout.width}
							height={layout.height}
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

							{displayEdges.map((edge) => {
								const isFromSelected = Boolean(
									selectedUrl && edge.from === selectedUrl,
								);
								const isToSelected = Boolean(
									selectedUrl && edge.to === selectedUrl,
								);
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
										strokeDasharray={
											edge.kind !== "primary" ? "5 4" : undefined
										}
										markerEnd={
											isSelectedEdge || edge.kind === "primary"
												? markerEnd
												: undefined
										}
										className="transition-colors duration-150"
									/>
								);
							})}
						</svg>

						{/* Interactive Graph Nodes */}
						{layout.nodes.map((node) => {
							const row = byUrl.get(node.url);
							if (!row) return null;
							const selected = row.id === selectedId;

							return (
								<button
									key={node.url}
									type="button"
									onClick={() => onSelect(row.id)}
									aria-pressed={selected}
									aria-label={`${node.label} — ${statusLabel(row.status)}`}
									title={`${row.title ? `${row.title}\n` : ""}${row.url}\nStatus: ${statusLabel(row.status)} · Depth ${row.depth}\nTautan: ${node.incomingCount} masuk, ${node.outgoingCount} keluar`}
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
												Root
											</span>
										)}
									</div>

									<div className="flex w-full items-center justify-between text-[11px] text-fog">
										<span className="tabular-nums">depth {row.depth}</span>
										<span className="tabular-nums text-[10px]">
											{node.outgoingCount > 0
												? `${node.outgoingCount} links`
												: statusLabel(row.status)}
										</span>
									</div>
								</button>
							);
						})}
					</div>
				</div>
			</div>

			{/* Information Architecture Caption & Legend */}
			<div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-fog">
				<p>Peta halaman berdasarkan link yang ditemukan saat crawl.</p>
				<p className="tabular-nums">
					Legenda: ✓ Berhasil · ! Gagal · ⊘ Dilewati · ○ Antre
				</p>
			</div>
		</div>
	);
}
