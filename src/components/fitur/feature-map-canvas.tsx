"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ProjectFeatureTree } from "@/db/schema";
import { useCanvasZoom } from "@/hooks/use-canvas-zoom";
import {
	COLORS,
	ContainerModal,
	ContainerNode,
	containerH,
	DOT_BG_IMAGE,
	Edges,
	FeatureNode,
	type LayoutEdge,
	type LayoutNode,
	LEVEL_GAP_X,
	RootNode,
	SIBLING_GAP_Y,
	SUBFEATURE_CONTAINER_W,
} from "../task/whiteboard-canvas";
import { ZoomControls } from "../task/zoom-controls";
import { featureTreeHasContent } from "./feature-view";

const ROOT_W = 200;
const ROOT_H = 56;
const FEATURE_W = 260;
const FEATURE_H = 76;

export interface FeatureGraphLayout {
	nodes: LayoutNode[];
	edges: LayoutEdge[];
	width: number;
	height: number;
}

/**
 * Modular 3-column layout: Produk root -> Card Fitur -> SATU card container
 * SUB FITUR per fitur (single dotted cable, never fan-out). Shares node
 * visuals, gaps, and edge routing with the task board so both read as one
 * product. Feature vertical center aligns with its container midpoint.
 */
export function layoutFeatureGraph(
	tree: ProjectFeatureTree,
): FeatureGraphLayout {
	const nodes: LayoutNode[] = [];
	const edges: LayoutEdge[] = [];
	const features = tree.features ?? [];
	if (features.length === 0) return { nodes, edges, width: 0, height: 0 };

	const containerHs = features.map((f) => containerH(f.subfeatures.length));
	const featureHeights = features.map((_f, i) =>
		Math.max(FEATURE_H, containerHs[i] ?? FEATURE_H),
	);
	const totalFeatureHeight =
		featureHeights.reduce((s, h) => s + h, 0) +
		(features.length - 1) * SIBLING_GAP_Y;

	const rootX = 40;
	const rootY = totalFeatureHeight / 2 - ROOT_H / 2 + 40;
	nodes.push({
		id: "root",
		type: "root",
		label: tree.productName,
		x: rootX,
		y: rootY,
		w: ROOT_W,
		h: ROOT_H,
		colorIdx: 0,
	});

	const featureX = rootX + ROOT_W + LEVEL_GAP_X;
	const subX = featureX + FEATURE_W + LEVEL_GAP_X;
	let cursorY = 40;

	features.forEach((feature, fi) => {
		const fh = featureHeights[fi] ?? FEATURE_H;
		const ch = containerHs[fi] ?? FEATURE_H;
		const colorIdx = fi % COLORS.length;
		const featureY = cursorY + fh / 2 - FEATURE_H / 2;

		nodes.push({
			id: `f-${fi}`,
			type: "feature",
			label: feature.name,
			x: featureX,
			y: featureY,
			w: FEATURE_W,
			h: FEATURE_H,
			colorIdx,
			phase: feature.phase,
			description: feature.description,
			taskCount: feature.subfeatures.length,
			totalRows: feature.subfeatures.length,
			doneRows: 0,
		});
		edges.push({
			x1: rootX + ROOT_W,
			y1: rootY + ROOT_H / 2,
			x2: featureX,
			y2: featureY + FEATURE_H / 2,
			color: "#6366f1",
		});

		const subY = cursorY + fh / 2 - ch / 2;
		nodes.push({
			id: `f-${fi}-sub`,
			type: "subfeature",
			label: "SUB FITUR",
			x: subX,
			y: subY,
			w: SUBFEATURE_CONTAINER_W,
			h: ch,
			colorIdx,
			ownerFeature: feature.name,
			rows: feature.subfeatures.map((sub) => ({
				id: sub.id,
				name: sub.name,
				description: sub.description,
			})),
			totalRows: feature.subfeatures.length,
			doneRows: 0,
			containerKind: "subfeatures",
		});
		edges.push({
			x1: featureX + FEATURE_W,
			y1: featureY + FEATURE_H / 2,
			x2: subX,
			y2: subY + ch / 2,
			color: "#6366f1",
			dashed: true,
		});

		cursorY += fh + SIBLING_GAP_Y;
	});

	const maxX = nodes.reduce((m, n) => Math.max(m, n.x + n.w), 0);
	const maxY = nodes.reduce((m, n) => Math.max(m, n.y + n.h), 0);
	return { nodes, edges, width: maxX + 80, height: maxY + 80 };
}

const SKELETON_BAR = "rounded bg-fog/10";

const SKELETON_TREE: ProjectFeatureTree = {
	productName: "Produk",
	createdAt: "2026-09-29T00:00:00.000Z",
	features: [
		{
			id: "feat-1",
			name: "Fitur",
			phase: 1,
			description: "Deskripsi",
			subfeatures: [
				{ id: "subfeat-1.1", name: "Subfitur", description: "Deskripsi" },
				{ id: "subfeat-1.2", name: "Subfitur", description: "Deskripsi" },
			],
		},
		{
			id: "feat-2",
			name: "Fitur",
			phase: 2,
			description: "Deskripsi",
			subfeatures: [
				{ id: "subfeat-2.1", name: "Subfitur", description: "Deskripsi" },
			],
		},
		{
			id: "feat-3",
			name: "Fitur",
			phase: 3,
			description: "Deskripsi",
			subfeatures: [
				{ id: "subfeat-3.1", name: "Subfitur", description: "Deskripsi" },
				{ id: "subfeat-3.2", name: "Subfitur", description: "Deskripsi" },
				{ id: "subfeat-3.3", name: "Subfitur", description: "Deskripsi" },
			],
		},
	],
};

function SkeletonDiagram() {
	const { nodes, edges } = useMemo(() => layoutFeatureGraph(SKELETON_TREE), []);
	return (
		<>
			<Edges edges={edges} />
			{nodes.map((node) => (
				<div
					key={node.id}
					className="absolute animate-pulse rounded-xl border border-fog/15 bg-fog/5"
					style={{ left: node.x, top: node.y, width: node.w, height: node.h }}
				>
					<div className="flex h-full flex-col justify-center gap-2 px-4">
						<div className={`h-3 w-12 ${SKELETON_BAR}`} />
						<div className={`h-4 w-36 ${SKELETON_BAR}`} />
					</div>
				</div>
			))}
		</>
	);
}

interface FeatureMapCanvasProps {
	productName?: string;
	featureTree?: ProjectFeatureTree | null;
}

/**
 * Readonly feature board: Produk -> Fitur -> SUB FITUR container with bezier
 * edges. Pan/zoom via the shared canvas hook; no node editing, no
 * drag-create. Container overflow opens a modal with full descriptions.
 */
export const FeatureMapCanvas = memo(function FeatureMapCanvas({
	productName = "Produk",
	featureTree,
}: FeatureMapCanvasProps) {
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

	const hasContent = featureTreeHasContent(featureTree);
	const layout = useMemo(
		() =>
			hasContent && featureTree
				? layoutFeatureGraph(featureTree)
				: { nodes: [], edges: [], width: 0, height: 0 },
		[hasContent, featureTree],
	);
	const skeletonLayout = useMemo(
		() => (!hasContent ? layoutFeatureGraph(SKELETON_TREE) : null),
		[hasContent],
	);
	const effectiveWidth = skeletonLayout?.width ?? layout.width;
	const effectiveHeight = skeletonLayout?.height ?? layout.height;

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
		const fitZoom = Math.min(
			(rect.width - padding * 2) / effectiveWidth,
			(rect.height - padding * 2) / effectiveHeight,
			1,
		);
		const clampedZoom = Math.max(minZoom, Math.min(maxZoom, fitZoom));
		setZoom(clampedZoom);
		setPan({
			x: (rect.width - effectiveWidth * clampedZoom) / 2,
			y: (rect.height - effectiveHeight * clampedZoom) / 2,
		});
	}, [effectiveWidth, effectiveHeight, setZoom, setPan, minZoom, maxZoom]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: tree identity resets fit
	useEffect(() => {
		hasFittedRef.current = false;
	}, [featureTree]);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (openContainer) {
				if (e.key === "Escape") setOpenContainer(null);
				return;
			}
			if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
				e.preventDefault();
				nudgePan(e.key, 40);
			}
		},
		[nudgePan, openContainer],
	);

	const handleOpenContainer = useCallback(
		(node: LayoutNode) => setOpenContainer(node),
		[],
	);

	return (
		<section
			ref={containerRef}
			className="relative h-full w-full touch-none select-none overflow-hidden overscroll-none bg-onyx outline-none focus-visible:ring-2 focus-visible:ring-indigo/40 cursor-grab active:cursor-grabbing"
			style={{
				backgroundImage: DOT_BG_IMAGE,
				backgroundSize: `${20 * zoom}px ${20 * zoom}px`,
				backgroundPosition: `${pan.x}px ${pan.y}px`,
			}}
			onPointerDown={(e) => {
				if (openContainer) return;
				if (e.pointerType === "mouse") e.preventDefault();
				startPan(e);
			}}
			onPointerMove={(e) => {
				if (openContainer) return;
				updatePan(e);
			}}
			onPointerUp={endPan}
			onPointerLeave={endPan}
			onWheel={(e) => {
				if (openContainer) return;
				onWheel(e);
			}}
			onKeyDown={handleKeyDown}
			aria-label={`Kanvas peta fitur ${productName}`}
		>
			{!hasContent ? (
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
							width: layout.width,
							height: layout.height,
						}}
					>
						<Edges edges={layout.edges} />
						{layout.nodes.map((node) => {
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
			{openContainer && typeof document !== "undefined"
				? createPortal(
						<ContainerModal
							node={openContainer}
							onClose={() => setOpenContainer(null)}
						/>,
						document.body,
					)
				: null}
		</section>
	);
});
