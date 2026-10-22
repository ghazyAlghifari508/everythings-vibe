"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ZoomControls } from "@/components/ui/zoom-controls";
import type { scrapePages } from "@/db/schema";
import { layoutCrawlGraph } from "@/features/scrape/utils/crawl-graph";
import { useCanvasZoom } from "@/hooks/use-canvas-zoom";
import { CrawlSitemapEdges } from "./crawl-sitemap-graph-edges";
import { CrawlSitemapNodes } from "./crawl-sitemap-graph-nodes";
import { CrawlSitemapSelection } from "./crawl-sitemap-selection";

type Page = typeof scrapePages.$inferSelect;

/** Distance kept between the graph and the edge of the canvas. */
const CANVAS_FIT_PADDING = 24;
/** Pointer travel that separates a drag from a plain click. */
const DRAG_THRESHOLD_PX = 2;

export function CrawlSitemapGraph({
	pages,
	selectedId,
	onSelect,
	onViewDetails,
}: {
	pages: Page[];
	selectedId: string;
	onSelect: (id: string) => void;
	onViewDetails?: () => void;
}) {
	const [revealedFor, setRevealedFor] = useState<string | null>(null);

	const layout = useMemo(
		() => layoutCrawlGraph(pages, { rankdir: "TB" }),
		[pages],
	);

	const {
		zoom,
		pan,
		setZoom,
		setPan,
		zoomIn,
		zoomOut,
		startPan,
		updatePan,
		endPan,
		nudgePan,
		onWheel,
		minZoom,
		maxZoom,
	} = useCanvasZoom();

	const canvasRef = useRef<HTMLDivElement>(null);
	// Once the reader takes over the canvas, the view stops following the
	// graph so their zoom and pan are not thrown away.
	const userAdjustedRef = useRef(false);
	const dragOriginRef = useRef<{ x: number; y: number } | null>(null);
	const focusPointRef = useRef<{ x: number; y: number } | null>(null);

	const byId = useMemo(() => {
		const map = new Map<string, Page>();
		for (const row of pages) map.set(row.id, row);
		return map;
	}, [pages]);

	const pageIdByUrl = useMemo(() => {
		const map = new Map<string, string>();
		for (const row of pages) map.set(row.url, row.id);
		return map;
	}, [pages]);

	const selectedPage = byId.get(selectedId) ?? null;
	const selectedUrl = selectedPage?.url ?? "";
	const selectedRelations = selectedUrl
		? layout.relations.byUrl.get(selectedUrl)
		: undefined;
	// The extra relationships belong to one page at a time, so another
	// selection always starts from the clean discovery view again.
	const showAdditional = Boolean(selectedUrl) && revealedFor === selectedUrl;

	useEffect(() => {
		const node = layout.nodes.find((item) => item.url === selectedUrl);
		focusPointRef.current = node
			? { x: node.x + node.w / 2, y: node.y + node.h / 2 }
			: null;
	}, [layout.nodes, selectedUrl]);

	const fitToView = useCallback(() => {
		const canvas = canvasRef.current;
		if (!canvas || !layout.width || !layout.height) return;
		const rect = canvas.getBoundingClientRect();
		const availableWidth = rect.width - CANVAS_FIT_PADDING * 2;
		const availableHeight = rect.height - CANVAS_FIT_PADDING * 2;
		if (availableWidth <= 0 || availableHeight <= 0) return;

		const fitZoom = Math.min(
			availableWidth / layout.width,
			availableHeight / layout.height,
			1,
		);
		const clamped = Math.max(minZoom, Math.min(maxZoom, fitZoom));
		setZoom(clamped);

		const contentWidth = layout.width * clamped;
		const contentHeight = layout.height * clamped;
		const focus = focusPointRef.current;
		// A graph wider than the canvas is aligned to the selected page so the
		// page the reader is working on stays on screen.
		const x =
			contentWidth <= availableWidth
				? (rect.width - contentWidth) / 2
				: focus
					? rect.width / 2 - focus.x * clamped
					: CANVAS_FIT_PADDING;
		const y =
			contentHeight <= availableHeight
				? (rect.height - contentHeight) / 2
				: CANVAS_FIT_PADDING;
		setPan({ x, y });
	}, [layout.width, layout.height, minZoom, maxZoom, setZoom, setPan]);

	useEffect(() => {
		if (!layout.width || !layout.height) return;
		if (userAdjustedRef.current) return;
		fitToView();
	}, [layout.width, layout.height, fitToView]);

	const handlePointerDown = useCallback(
		(e: React.PointerEvent) => {
			dragOriginRef.current = { x: e.clientX, y: e.clientY };
			startPan(e);
		},
		[startPan],
	);

	const handlePointerMove = useCallback(
		(e: React.PointerEvent) => {
			const origin = dragOriginRef.current;
			if (
				origin &&
				(Math.abs(e.clientX - origin.x) > DRAG_THRESHOLD_PX ||
					Math.abs(e.clientY - origin.y) > DRAG_THRESHOLD_PX)
			) {
				userAdjustedRef.current = true;
			}
			updatePan(e);
		},
		[updatePan],
	);

	const handlePointerEnd = useCallback(() => {
		dragOriginRef.current = null;
		endPan();
	}, [endPan]);

	const handleZoomIn = useCallback(() => {
		userAdjustedRef.current = true;
		zoomIn();
	}, [zoomIn]);

	const handleZoomOut = useCallback(() => {
		userAdjustedRef.current = true;
		zoomOut();
	}, [zoomOut]);

	const handleWheel = useCallback(
		(e: React.WheelEvent<HTMLDivElement>) => {
			userAdjustedRef.current = true;
			onWheel(e);
		},
		[onWheel],
	);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
				e.preventDefault();
				userAdjustedRef.current = true;
				nudgePan(e.key, 40);
			}
			if (e.key.toLowerCase() === "f") {
				e.preventDefault();
				fitToView();
			}
		},
		[nudgePan, fitToView],
	);

	// The default view is the discovery tree. The links that were only seen
	// in the page HTML are drawn for the selected page, and only after the
	// reader asks for them.
	const displayEdges = useMemo(() => {
		if (!showAdditional || !selectedUrl) return layout.primaryEdges;
		const extra = layout.secondaryEdges.filter(
			(edge) => edge.from === selectedUrl || edge.to === selectedUrl,
		);
		return [...layout.primaryEdges, ...extra];
	}, [layout.primaryEdges, layout.secondaryEdges, showAdditional, selectedUrl]);

	if (pages.length === 0) return null;

	return (
		<div className="space-y-3">
			<div
				className="relative flex h-[380px] w-full flex-col touch-none select-none overflow-hidden overscroll-none rounded-xl border border-graphite bg-onyx outline-none focus-visible:ring-2 focus-visible:ring-indigo sm:h-[460px]"
				style={{ maxWidth: "100%" }}
				onPointerDown={handlePointerDown}
				onPointerMove={handlePointerMove}
				onPointerUp={handlePointerEnd}
				onPointerLeave={handlePointerEnd}
				onWheel={handleWheel}
				onKeyDown={handleKeyDown}
				role="application"
				aria-label="Visual sitemap: peta halaman berdasarkan link yang ditemukan saat crawl"
			>
				<div
					className="z-10 flex flex-wrap items-center justify-end gap-2 border-b border-graphite/60 bg-onyx/90 px-3 py-2 backdrop-blur-sm sm:px-4"
					onPointerDown={(e) => e.stopPropagation()}
				>
					<ZoomControls
						zoom={zoom}
						onZoomIn={handleZoomIn}
						onZoomOut={handleZoomOut}
						onReset={fitToView}
						resetLabel="Pusatkan grafik (F)"
					/>
				</div>

				<div ref={canvasRef} className="relative flex-1 overflow-hidden">
					<div
						className="absolute left-0 top-0 origin-top-left will-change-transform"
						style={{
							transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
							width: layout.width,
							height: layout.height,
						}}
					>
						<CrawlSitemapEdges
							width={layout.width}
							height={layout.height}
							edges={displayEdges}
							selectedUrl={selectedUrl}
						/>

						<CrawlSitemapNodes
							pages={pages}
							nodes={layout.nodes}
							selectedId={selectedId}
							onSelect={onSelect}
						/>
					</div>
				</div>
			</div>

			<CrawlSitemapSelection
				page={selectedPage}
				relations={selectedRelations ?? null}
				pageIdByUrl={pageIdByUrl}
				showAdditional={showAdditional}
				onToggleAdditional={() =>
					setRevealedFor(showAdditional ? null : selectedUrl)
				}
				onSelect={onSelect}
				onViewDetails={onViewDetails}
			/>

			<div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-fog">
				<p>Peta halaman berdasarkan link yang ditemukan saat crawl.</p>
				<p className="tabular-nums">
					Legenda: ✓ Berhasil · ! Gagal · ⊘ Dilewati · ○ Antre
				</p>
			</div>
		</div>
	);
}
