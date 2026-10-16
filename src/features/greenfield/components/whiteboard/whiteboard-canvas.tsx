"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ZoomControls } from "@/components/task/zoom-controls";
import type { ProjectFeatureTree } from "@/db/schema";
import { useCanvasZoom } from "@/hooks/use-canvas-zoom";
import type { TaskTree } from "@/lib/services/task-service";
import type { LayoutNode } from "../../types/whiteboard";
import { layoutTaskGraph } from "../../utils/whiteboard-layout";
import { Edges, getCanvasDotStyle } from "./canvas-connectors";
import { SKELETON_TREE, SkeletonDiagram } from "./canvas-loading";
import { ContainerModal } from "./canvas-modal";
import { ContainerNode, FeatureNode, RootNode } from "./canvas-node";

interface WhiteboardCanvasProps {
	projectName?: string;
	taskTree?: TaskTree | null;
	featureTree?: ProjectFeatureTree | null;
}

export const WhiteboardCanvas = memo(function WhiteboardCanvas({
	projectName = "Project",
	taskTree,
	featureTree,
}: WhiteboardCanvasProps) {
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
	const [openContainer, setOpenContainer] = useState<LayoutNode | null>(null);

	const hasFeatureTree = Boolean(
		featureTree?.features && featureTree.features.length > 0,
	);
	const hasTaskTree = Boolean(
		taskTree?.features && taskTree.features.length > 0,
	);
	// Legacy fallback only when neither source holds any structure.
	const isEmpty = !hasTaskTree && !hasFeatureTree;

	const {
		nodes,
		edges,
		width: canvasWidth,
		height: canvasHeight,
	} = useMemo(
		() =>
			isEmpty
				? { nodes: [], edges: [], width: 0, height: 0 }
				: layoutTaskGraph(
						taskTree ?? { features: [] },
						projectName,
						featureTree,
					),
		[taskTree, projectName, featureTree, isEmpty],
	);

	// While loading, the same layout engine sizes the skeleton, so the board
	// auto-fits a representative tree instead of a fixed empty canvas.
	const skeletonLayout = useMemo(
		() => (isEmpty ? layoutTaskGraph(SKELETON_TREE, projectName) : null),
		[isEmpty, projectName],
	);
	const effectiveWidth = skeletonLayout?.width ?? canvasWidth;
	const effectiveHeight = skeletonLayout?.height ?? canvasHeight;

	// Auto-fit zoom: scale diagram to fit viewport
	const containerRef = useRef<HTMLDivElement>(null);
	const hasFittedRef = useRef(false);

	useEffect(() => {
		if (
			!effectiveWidth ||
			!effectiveHeight ||
			!containerRef.current ||
			hasFittedRef.current
		)
			return;
		hasFittedRef.current = true;

		const rect = containerRef.current.getBoundingClientRect();
		const padding = 60;
		const fitW = (rect.width - padding * 2) / effectiveWidth;
		const fitH = (rect.height - padding * 2) / effectiveHeight;
		const fitZoom = Math.min(fitW, fitH, 1);
		const clampedZoom = Math.max(minZoom, Math.min(maxZoom, fitZoom));

		setZoom(clampedZoom);
		const offsetX = (rect.width - effectiveWidth * clampedZoom) / 2;
		const offsetY = (rect.height - effectiveHeight * clampedZoom) / 2;
		setPan({ x: offsetX, y: offsetY });
	}, [effectiveWidth, effectiveHeight, setZoom, setPan, minZoom, maxZoom]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: taskTree/featureTree identity resets fit
	useEffect(() => {
		hasFittedRef.current = false;
	}, [taskTree, featureTree]);

	// Modal open freezes the board: pan/zoom/keyboard-nudge all no-op until closed.
	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (openContainer) {
				if (e.key === "Escape") {
					setOpenContainer(null);
				}
				return;
			}
			if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
				e.preventDefault();
				nudgePan(e.key, 40);
			}
		},
		[nudgePan, openContainer],
	);

	const handlePointerDown = useCallback(
		(e: React.PointerEvent) => {
			if (openContainer) return;
			// ponytail: blocks native text-selection drag that fought panning.
			if (e.pointerType === "mouse") e.preventDefault();
			startPan(e);
		},
		[openContainer, startPan],
	);

	const handlePointerMove = useCallback(
		(e: React.PointerEvent) => {
			if (openContainer) return;
			updatePan(e);
		},
		[openContainer, updatePan],
	);

	const handleWheel = useCallback(
		(e: React.WheelEvent) => {
			if (openContainer) return;
			onWheel(e);
		},
		[openContainer, onWheel],
	);

	// Stable opener keeps memoized node components from re-rendering while
	// panning/zooming recreates this component's render output every frame.
	const handleOpenContainer = useCallback(
		(node: LayoutNode) => setOpenContainer(node),
		[],
	);

	return (
		<section
			ref={containerRef}
			className="relative h-full w-full touch-none select-none overflow-hidden overscroll-none bg-onyx outline-none focus-visible:ring-2 focus-visible:ring-indigo/40 cursor-grab active:cursor-grabbing"
			style={getCanvasDotStyle(zoom, pan)}
			onPointerDown={handlePointerDown}
			onPointerMove={handlePointerMove}
			onPointerUp={endPan}
			onPointerLeave={endPan}
			onWheel={handleWheel}
			onKeyDown={handleKeyDown}
			aria-label="Kanvas diagram task"
		>
			{isEmpty ? (
				<div
					className="absolute left-0 top-0 origin-top-left will-change-transform"
					style={{
						transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
						width: effectiveWidth,
						height: effectiveHeight,
					}}
				>
					<SkeletonDiagram />
				</div>
			) : (
				<>
					<div
						className="absolute left-0 top-0 origin-top-left will-change-transform"
						style={{
							transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
							width: canvasWidth,
							height: canvasHeight,
						}}
					>
						{/* SVG edges */}
						<Edges edges={edges} />

						{/* Nodes */}
						{nodes.map((node) => {
							if (node.type === "root")
								return <RootNode key={node.id} node={node} />;
							if (node.type === "feature")
								return <FeatureNode key={node.id} node={node} />;
							return (
								<ContainerNode
									key={node.id}
									node={node}
									onOpen={handleOpenContainer}
								/>
							);
						})}
					</div>

					<ZoomControls
						zoom={zoom}
						onZoomIn={zoomIn}
						onZoomOut={zoomOut}
						onReset={resetZoom}
						className="absolute bottom-4 left-4"
					/>
				</>
			)}
			{openContainer &&
				typeof document !== "undefined" &&
				createPortal(
					<ContainerModal
						node={openContainer}
						onClose={() => setOpenContainer(null)}
					/>,
					document.body,
				)}
		</section>
	);
});
