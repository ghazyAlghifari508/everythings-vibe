"use client";

import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import type { ProjectFeatureTree } from "@/db/schema";
import { useCanvasZoom } from "@/hooks/use-canvas-zoom";
import {
	COLORS,
	DOT_BG_IMAGE,
	Edges,
	type LayoutEdge,
	type LayoutNode,
	LEVEL_GAP_X,
	SIBLING_GAP_Y,
} from "../task/whiteboard-canvas";
import { ZoomControls } from "../task/zoom-controls";
import { featureTreeHasContent } from "./feature-view";

const ROOT_W = 200;
const ROOT_H = 56;
const FEATURE_W = 260;
const FEATURE_H = 76;
const SUBFEATURE_W = 260;
const SUBFEATURE_H = 68;

export interface FeatureGraphLayout {
	nodes: LayoutNode[];
	edges: LayoutEdge[];
	width: number;
	height: number;
}

/**
 * Pure 3-level layout: Produk root -> Fitur (+ Fase badge + description)
 * -> Subfitur. Mirrors whiteboard-canvas geometry language (same gaps,
 * same bezier edge routing) so the two boards read as one product.
 * Feature vertical center aligns with its subfeature stack midpoint.
 */
export function layoutFeatureGraph(
	tree: ProjectFeatureTree,
): FeatureGraphLayout {
	const nodes: LayoutNode[] = [];
	const edges: LayoutEdge[] = [];
	const features = tree.features ?? [];
	if (features.length === 0) return { nodes, edges, width: 0, height: 0 };

	const subStackH = (count: number): number =>
		count === 0 ? 0 : count * SUBFEATURE_H + (count - 1) * SIBLING_GAP_Y;

	const featureHeights = features.map((f) =>
		Math.max(FEATURE_H, subStackH(f.subfeatures.length)),
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
		const fh = featureHeights[fi];
		const featureY = cursorY + fh / 2 - FEATURE_H / 2;
		const colorIdx = fi % COLORS.length;

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
		});
		edges.push({
			x1: rootX + ROOT_W,
			y1: rootY + ROOT_H / 2,
			x2: featureX,
			y2: featureY + FEATURE_H / 2,
			color: COLORS[colorIdx].accent,
		});

		const count = feature.subfeatures.length;
		let subCursorY = cursorY + fh / 2 - subStackH(count) / 2;
		feature.subfeatures.forEach((sub, si) => {
			nodes.push({
				id: `f-${fi}-s-${si}`,
				type: "subfeature",
				label: sub.name,
				x: subX,
				y: subCursorY,
				w: SUBFEATURE_W,
				h: SUBFEATURE_H,
				colorIdx,
				description: sub.description,
				ownerFeature: feature.name,
			});
			edges.push({
				x1: featureX + FEATURE_W,
				y1: featureY + FEATURE_H / 2,
				x2: subX,
				y2: subCursorY + SUBFEATURE_H / 2,
				color: COLORS[colorIdx].accent,
			});
			subCursorY += SUBFEATURE_H + SIBLING_GAP_Y;
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

const CanvasRootNode = memo(function CanvasRootNode({
	node,
}: {
	node: LayoutNode;
}) {
	return (
		<div
			className="absolute flex items-center justify-center rounded-xl border-2 border-indigo/60 bg-indigo/10"
			style={{ left: node.x, top: node.y, width: node.w, height: node.h }}
			role="img"
			aria-label={`Produk ${node.label}`}
		>
			<span className="truncate px-4 font-inter text-sm font-semibold text-snow">
				{node.label}
			</span>
		</div>
	);
});

const CanvasFeatureNode = memo(function CanvasFeatureNode({
	node,
}: {
	node: LayoutNode;
}) {
	const color = COLORS[node.colorIdx];
	return (
		<div
			className={`absolute rounded-xl border ${color.border} ${color.bg}`}
			style={{ left: node.x, top: node.y, width: node.w, height: node.h }}
			role="img"
			aria-label={`Fitur ${node.label}, fase ${node.phase ?? "-"}. ${node.description ?? ""}`}
		>
			<div className="flex h-full flex-col justify-center px-4">
				<div className="mb-1 flex items-center gap-2">
					<span
						className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase text-white ${color.badge}`}
					>
						Fase {node.phase ?? "-"}
					</span>
					<span className="text-[10px] text-fog">
						{node.taskCount ?? 0} subfitur
					</span>
				</div>
				<p
					className="truncate font-inter text-sm font-[510] text-snow"
					title={node.label}
				>
					{node.label}
				</p>
				{node.description ? (
					<p
						className="mt-0.5 truncate text-xs text-fog"
						title={node.description}
					>
						{node.description}
					</p>
				) : null}
			</div>
		</div>
	);
});

const CanvasSubfeatureNode = memo(function CanvasSubfeatureNode({
	node,
}: {
	node: LayoutNode;
}) {
	const color = COLORS[node.colorIdx];
	return (
		<div
			className="absolute rounded-xl border border-graphite bg-obsidian"
			style={{ left: node.x, top: node.y, width: node.w, height: node.h }}
			role="img"
			aria-label={`Subfitur ${node.label} dari ${node.ownerFeature ?? "fitur"}. ${node.description ?? ""}`}
		>
			<div className="flex h-full items-center gap-2.5 px-4">
				<div className={`h-2 w-2 shrink-0 rounded-full ${color.badge}`} />
				<div className="min-w-0">
					<p
						className="truncate font-inter text-xs font-[510] text-snow"
						title={node.label}
					>
						{node.label}
					</p>
					{node.description ? (
						<p
							className="truncate text-[11px] text-fog"
							title={node.description}
						>
							{node.description}
						</p>
					) : null}
				</div>
			</div>
		</div>
	);
});

interface FeatureMapCanvasProps {
	productName?: string;
	featureTree?: ProjectFeatureTree | null;
}

/**
 * Readonly feature map: Produk -> Fitur (+ Fase badge + description)
 * -> Subfitur with bezier edges. Pan/zoom via the shared canvas hook;
 * no node editing, no drag-create. Nodes are focusable for keyboard users.
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
			if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
				e.preventDefault();
				nudgePan(e.key, 40);
			}
		},
		[nudgePan],
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
				if (e.pointerType === "mouse") e.preventDefault();
				startPan(e);
			}}
			onPointerMove={updatePan}
			onPointerUp={endPan}
			onPointerLeave={endPan}
			onWheel={onWheel}
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
								return <CanvasRootNode key={node.id} node={node} />;
							if (node.type === "feature")
								return <CanvasFeatureNode key={node.id} node={node} />;
							return <CanvasSubfeatureNode key={node.id} node={node} />;
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
		</section>
	);
});
