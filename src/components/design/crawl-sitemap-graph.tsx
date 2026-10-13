"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import type { scrapePages } from "@/db/schema";
import { useCanvasZoom } from "@/hooks/use-canvas-zoom";
import { layoutCrawlGraph } from "@/lib/crawl-graph";
import { cn } from "@/lib/utils";
import { ZoomControls } from "../task/zoom-controls";

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
	const layout = useMemo(() => layoutCrawlGraph(pages), [pages]);
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

	useEffect(() => {
		if (!layout.width || !layout.height || !containerRef.current) return;
		if (fittedRef.current) return;
		fittedRef.current = true;
		const rect = containerRef.current.getBoundingClientRect();
		const padding = 48;
		const fitZoom = Math.min(
			(rect.width - padding * 2) / layout.width,
			(360 - padding) / layout.height,
			1,
		);
		const clamped = Math.max(minZoom, Math.min(maxZoom, fitZoom));
		setZoom(clamped);
		setPan({
			x: Math.max(0, (rect.width - layout.width * clamped) / 2),
			y: 16,
		});
	}, [layout.width, layout.height, setZoom, setPan, minZoom, maxZoom]);

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
		},
		[nudgePan],
	);

	const byUrl = useMemo(() => {
		const map = new Map<string, Page>();
		for (const row of pages) map.set(row.url, row);
		return map;
	}, [pages]);

	if (pages.length === 0) return null;

	return (
		<div className="space-y-3">
			<div
				ref={containerRef}
				className="relative h-[320px] w-full touch-none select-none overflow-hidden overscroll-none rounded-xl border border-graphite bg-onyx outline-none focus-visible:ring-2 focus-visible:ring-indigo sm:h-[400px]"
				style={{ maxWidth: "100%" }}
				onPointerDown={startPan}
				onPointerMove={updatePan}
				onPointerUp={endPan}
				onPointerLeave={endPan}
				onWheel={onWheel}
				onKeyDown={handleKeyDown}
				role="application"
				aria-label="Visual sitemap: relasi tautan teramati antar halaman crawl"
			>
				<div
					className="absolute left-0 top-0 origin-top-left will-change-transform"
					style={{
						transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
						width: layout.width,
						height: layout.height,
					}}
				>
					<svg
						className="absolute left-0 top-0"
						width={layout.width}
						height={layout.height}
						aria-hidden="true"
						focusable="false"
					>
						<title>Relasi tautan teramati</title>
						{layout.edges.map((edge) => (
							<line
								key={`${edge.from} -> ${edge.to}`}
								x1={edge.x1}
								y1={edge.y1}
								x2={edge.x2}
								y2={edge.y2}
								stroke="#5a5a5a"
								strokeWidth={1.5}
							/>
						))}
					</svg>
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
								title={`${row.title ?? row.url}\n${row.url}`}
								className={cn(
									"absolute flex flex-col items-start justify-center gap-0.5 rounded-lg border px-3 text-left focus-visible:ring-2 focus-visible:ring-indigo",
									selected
										? "border-indigo bg-charcoal"
										: "border-graphite bg-charcoal hover:border-fog",
								)}
								style={{
									left: node.x,
									top: node.y,
									width: node.w,
									height: node.h,
								}}
							>
								<span className="flex w-full items-center gap-1.5">
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
									<span className="truncate text-sm font-medium text-snow">
										{node.label}
									</span>
								</span>
								<span className="w-full truncate text-xs text-fog">
									depth {row.depth}
								</span>
							</button>
						);
					})}
				</div>
				<div className="absolute bottom-3 right-3">
					<ZoomControls
						zoom={zoom}
						onZoomIn={zoomIn}
						onZoomOut={zoomOut}
						onReset={resetZoom}
					/>
				</div>
			</div>
			<div className="flex flex-wrap items-center justify-between gap-2">
				<p className="text-xs text-fog">
					Relasi tautan teramati, bukan hierarki situs yang disimpulkan. Posisi
					horizontal menunjukkan kedalaman penemuan.
				</p>
				<p className="text-xs text-fog">
					Legenda: ✓ Berhasil · ! Gagal · ⊘ Dilewati · ○ Antre
				</p>
			</div>
		</div>
	);
}
