"use client";

import {
	Bell,
	Box,
	Calendar,
	ChevronRight,
	CreditCard,
	FileText,
	LayoutGrid,
	ListChecks,
	MapPin,
	MessageSquare,
	Package,
	Search,
	Settings,
	Shield,
	ShoppingCart,
	Truck,
	Users,
	X,
} from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { groupTasksBySubfeature } from "@/components/fitur/feature-view";
import { useCanvasZoom } from "@/hooks/use-canvas-zoom";
import type { TaskTree } from "@/lib/services/task-service";
import { ZoomControls } from "./zoom-controls";

// Layout constants
const ROOT_W = 200;
const ROOT_H = 56;
const FEATURE_W = 260;
const FEATURE_H = 76;

export const LEVEL_GAP_X = 120;
export const SIBLING_GAP_Y = 24;

// Color palette per feature
export const COLORS = [
	{
		bg: "bg-indigo/10",
		border: "border-indigo/40",
		badge: "bg-indigo",
		accent: "#6366f1",
	},
	{
		bg: "bg-emerald/10",
		border: "border-emerald/40",
		badge: "bg-emerald",
		accent: "#10b981",
	},
	{
		bg: "bg-amber-500/10",
		border: "border-amber-500/40",
		badge: "bg-amber-500",
		accent: "#f59e0b",
	},
	{
		bg: "bg-crimson/10",
		border: "border-crimson/40",
		badge: "bg-crimson",
		accent: "#ef4444",
	},
	{
		bg: "bg-sky-500/10",
		border: "border-sky-500/40",
		badge: "bg-sky-500",
		accent: "#0ea5e9",
	},
	{
		bg: "bg-fuchsia-500/10",
		border: "border-fuchsia-500/40",
		badge: "bg-fuchsia-500",
		accent: "#d946ef",
	},
];
export const MAX_VISIBLE_CONTAINER_ROWS = 3;
export const SUBFEATURE_CONTAINER_W = 280;
const CONTAINER_HEADER_H = 36;
const CONTAINER_ROW_H = 36;
const CONTAINER_FOOTER_H = 28;
const CONTAINER_PAD = 20;

export function containerH(rowCount: number): number {
	const visible = Math.min(Math.max(rowCount, 1), MAX_VISIBLE_CONTAINER_ROWS);
	const footer = rowCount > MAX_VISIBLE_CONTAINER_ROWS ? CONTAINER_FOOTER_H : 0;
	return (
		CONTAINER_HEADER_H + visible * CONTAINER_ROW_H + footer + CONTAINER_PAD
	);
}

type FeatureIconName =
	| "dashboard"
	| "package"
	| "cart"
	| "users"
	| "chat"
	| "shield"
	| "truck"
	| "search"
	| "settings"
	| "bell"
	| "calendar"
	| "card"
	| "file"
	| "map";

const FEATURE_ICON_RULES: Array<{ match: RegExp; icon: FeatureIconName }> = [
	{
		match: /dash|analit|statistik|laporan|overview|ringkas/i,
		icon: "dashboard",
	},
	{ match: /cari|search|filter|temu/i, icon: "search" },
	{ match: /stok|barang|invent|gudang|produk|katalog/i, icon: "package" },
	{
		match: /checkout|pesan|order|beli|bayar|transaksi|cart|keranjang/i,
		icon: "cart",
	},
	{ match: /akun|profil|user|pengguna|member|anggota/i, icon: "users" },
	{ match: /notif|peringatan|pengingat|reminder|alert/i, icon: "bell" },
	{
		match: /chat|komentar|diskusi|broadcast/i,
		icon: "chat",
	},
	{ match: /admin|keamanan|izin|role|otoris/i, icon: "shield" },
	{
		match: /kirim|antar|kurir|pengiriman|logistik|tracking|lacak/i,
		icon: "truck",
	},
	{ match: /pengatur|setting|konfig|preferensi/i, icon: "settings" },
	{ match: /jadwal|agenda|kalender|booking|reserv/i, icon: "calendar" },
	{
		match: /langgan|tagih|invoice|bayar|kredit|topup|harga|paket/i,
		icon: "card",
	},
	{
		match: /artikel|berita|konten|dokumen|file|upload|media|galeri/i,
		icon: "file",
	},
	{ match: /lokasi|alamat|peta|maps|wilayah|cabang|toko/i, icon: "map" },
];

export type FeatureIconComponent =
	| typeof LayoutGrid
	| typeof Package
	| typeof ShoppingCart
	| typeof Users
	| typeof MessageSquare
	| typeof Shield
	| typeof Truck
	| typeof Search
	| typeof Settings
	| typeof Bell
	| typeof Calendar
	| typeof CreditCard
	| typeof FileText
	| typeof MapPin;

const FEATURE_ICON_COMPONENTS: Record<FeatureIconName, FeatureIconComponent> = {
	dashboard: LayoutGrid,
	package: Package,
	cart: ShoppingCart,
	users: Users,
	chat: MessageSquare,
	shield: Shield,
	truck: Truck,
	search: Search,
	settings: Settings,
	bell: Bell,
	calendar: Calendar,
	card: CreditCard,
	file: FileText,
	map: MapPin,
};

export function featureIconName(label: string): FeatureIconName {
	for (const rule of FEATURE_ICON_RULES) {
		if (rule.match.test(label)) return rule.icon;
	}
	return "dashboard";
}

export function FeatureIcon({
	label,
	size = 16,
}: {
	label: string;
	size?: number;
}) {
	const Icon = FEATURE_ICON_COMPONENTS[featureIconName(label)];
	return <Icon size={size} aria-hidden />;
}

const FASE_STYLES: Record<number, string> = {
	1: "bg-orange-500/15 text-orange-300 border-orange-500/30",
	2: "bg-sky-500/15 text-sky-300 border-sky-500/30",
	3: "bg-violet-500/15 text-violet-300 border-violet-500/30",
};

export function faseBadgeClass(phase: number | undefined): string {
	return FASE_STYLES[phase ?? 0] ?? FASE_STYLES[3] ?? FASE_STYLES[1] ?? "";
}

export interface ContainerRow {
	readonly id: string;
	readonly name: string;
	readonly description?: string;
	readonly done?: boolean;
}
export interface TaskContainerSubtask {
	readonly name: string;
	readonly details: readonly string[];
}

export interface TaskContainerTask {
	readonly name: string;
	readonly status?: string;
	readonly subtasks: readonly TaskContainerSubtask[];
}

export interface LayoutNode {
	id: string;
	type: "root" | "feature" | "subfeature" | "task" | "detail";
	label: string;
	x: number;
	y: number;
	w: number;
	h: number;
	colorIdx: number;
	phase?: number;
	taskCount?: number;
	subfeatureName?: string | null;
	description?: string | null;
	ownerFeature?: string;
	status?: string;
	priority?: string | null;
	subtasks?: Array<{ name: string }>;
	totalSubtasks?: number;
	parentSubtask?: string;
	details?: string[];
	totalDetails?: number;
	rows?: ContainerRow[];
	totalRows?: number;
	doneRows?: number;
	containerKind?: "subfeatures" | "tasks";
	tasks?: TaskContainerTask[];
}

export interface LayoutEdge {
	x1: number;
	y1: number;
	x2: number;
	y2: number;
	color: string;
	dashed?: boolean;
}

export function layoutTaskGraph(
	tree: TaskTree,
	projectName: string,
): { nodes: LayoutNode[]; edges: LayoutEdge[]; width: number; height: number } {
	const nodes: LayoutNode[] = [];
	const edges: LayoutEdge[] = [];

	const features = tree.features;
	if (features.length === 0) return { nodes, edges, width: 0, height: 0 };

	function isTaskDone(status: string | undefined): boolean {
		return status === "completed" || status === "done";
	}

	interface FeaturePlan {
		subRows: ContainerRow[];
		subDone: number;
		taskRows: ContainerRow[];
		taskPayloads: TaskContainerTask[];
		taskDone: number;
		subH: number;
		taskH: number;
		height: number;
	}

	const plans: FeaturePlan[] = features.map((feature) => {
		const groups = groupTasksBySubfeature(feature.tasks);
		const subRows: ContainerRow[] = [];
		let subDone = 0;
		const legacyIndexes: number[] = [];
		for (const g of groups) {
			if (!g.subfeatureName) {
				legacyIndexes.push(...g.taskIndexes);
				continue;
			}
			const done =
				g.taskIndexes.length > 0 &&
				g.taskIndexes.every((ti) => isTaskDone(feature.tasks[ti]?.status));
			if (done) subDone += 1;
			subRows.push({ id: g.key, name: g.subfeatureName, done });
		}
		if (legacyIndexes.length > 0) {
			const done = legacyIndexes.every((ti) =>
				isTaskDone(feature.tasks[ti]?.status),
			);
			if (done) subDone += 1;
			const [first] = legacyIndexes;
			subRows.push({
				id: "__legacy",
				name:
					legacyIndexes.length > 1
						? `Tugas fitur (${legacyIndexes.length})`
						: (first !== undefined && feature.tasks[first]?.name) ||
							"Tugas fitur",
				done,
			});
		}
		const taskPayloads: TaskContainerTask[] = feature.tasks.map((t) => ({
			name: t.name,
			status: t.status,
			subtasks: t.subtasks.map((s) => ({
				name: s.name,
				details: s.details ?? [],
			})),
		}));
		const taskRows: ContainerRow[] = feature.tasks.map((t, ti) => ({
			id: `t-${ti}`,
			name: t.name,
			done: isTaskDone(t.status),
		}));
		const taskDone = taskRows.filter((r) => r.done).length;
		const subH = containerH(subRows.length);
		const taskH = containerH(taskRows.length);
		return {
			subRows,
			subDone,
			taskRows,
			taskPayloads,
			taskDone,
			subH,
			taskH,
			height: Math.max(FEATURE_H, subH, taskH),
		};
	});

	const totalFeatureHeight =
		plans.reduce((s, p) => s + p.height, 0) +
		(plans.length - 1) * SIBLING_GAP_Y;

	const rootX = 40;
	const rootY = totalFeatureHeight / 2 - ROOT_H / 2 + 40;
	nodes.push({
		id: "root",
		type: "root",
		label: projectName,
		x: rootX,
		y: rootY,
		w: ROOT_W,
		h: ROOT_H,
		colorIdx: 0,
	});

	const featureX = rootX + ROOT_W + LEVEL_GAP_X;
	const subX = featureX + FEATURE_W + LEVEL_GAP_X;
	const taskX = subX + SUBFEATURE_CONTAINER_W + LEVEL_GAP_X;
	let featureCursorY = 40;

	for (let fi = 0; fi < features.length; fi++) {
		const feature = features[fi];
		const plan = plans[fi];
		if (!feature || !plan) continue;
		const colorIdx = fi % COLORS.length;
		const accent = COLORS[colorIdx]?.accent ?? "#6366f1";

		const featureY = featureCursorY + plan.height / 2 - FEATURE_H / 2;
		nodes.push({
			id: `f-${fi}`,
			type: "feature",
			label: feature.name,
			x: featureX,
			y: featureY,
			w: FEATURE_W,
			h: FEATURE_H,
			colorIdx,
			phase: fi + 1,
			taskCount: feature.tasks.length,
			totalRows: feature.tasks.length,
			doneRows: plan.taskDone,
		});
		edges.push({
			x1: rootX + ROOT_W,
			y1: rootY + ROOT_H / 2,
			x2: featureX,
			y2: featureY + FEATURE_H / 2,
			color: accent,
		});

		const subY = featureCursorY + plan.height / 2 - plan.subH / 2;
		nodes.push({
			id: `f-${fi}-sub`,
			type: "subfeature",
			label: "SUB FITUR",
			x: subX,
			y: subY,
			w: SUBFEATURE_CONTAINER_W,
			h: plan.subH,
			colorIdx,
			ownerFeature: feature.name,
			rows: plan.subRows,
			totalRows: plan.subRows.length,
			doneRows: plan.subDone,
			containerKind: "subfeatures",
		});
		edges.push({
			x1: featureX + FEATURE_W,
			y1: featureY + FEATURE_H / 2,
			x2: subX,
			y2: subY + plan.subH / 2,
			color: accent,
			dashed: true,
		});

		const taskY = featureCursorY + plan.height / 2 - plan.taskH / 2;
		nodes.push({
			id: `f-${fi}-tasks`,
			type: "task",
			label: "TASKS",
			x: taskX,
			y: taskY,
			w: SUBFEATURE_CONTAINER_W,
			h: plan.taskH,
			colorIdx,
			subfeatureName: feature.name,
			rows: plan.taskRows,
			totalRows: plan.taskRows.length,
			doneRows: plan.taskDone,
			containerKind: "tasks",
			tasks: plan.taskPayloads,
		});
		edges.push({
			x1: subX + SUBFEATURE_CONTAINER_W,
			y1: subY + plan.subH / 2,
			x2: taskX,
			y2: taskY + plan.taskH / 2,
			color: accent,
			dashed: true,
		});

		featureCursorY += plan.height + SIBLING_GAP_Y;
	}

	const maxX = nodes.reduce((m, n) => Math.max(m, n.x + n.w), 0);
	const maxY = nodes.reduce((m, n) => Math.max(m, n.y + n.h), 0);

	return { nodes, edges, width: maxX + 80, height: maxY + 80 };
}

// Dot grid: subtle blueprint dots on canvas, adaptive to light and dark theme.
export const DOT_BG_IMAGE =
	"radial-gradient(circle, var(--canvas-dot-color, rgba(15, 23, 42, 0.16)) 1.25px, transparent 1.25px)";

interface WhiteboardCanvasProps {
	projectName?: string;
	taskTree?: TaskTree | null;
}

export const WhiteboardCanvas = memo(function WhiteboardCanvas({
	projectName = "Project",
	taskTree,
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

	const features = taskTree?.features ?? [];
	const isEmpty = features.length === 0;

	const {
		nodes,
		edges,
		width: canvasWidth,
		height: canvasHeight,
	} = useMemo(
		() =>
			taskTree && !isEmpty
				? layoutTaskGraph(taskTree, projectName)
				: { nodes: [], edges: [], width: 0, height: 0 },
		[taskTree, projectName, isEmpty],
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

	// biome-ignore lint/correctness/useExhaustiveDependencies: taskTree triggers hasFittedRef reset
	useEffect(() => {
		hasFittedRef.current = false;
	}, [taskTree]);

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
			style={{
				backgroundImage: DOT_BG_IMAGE,
				backgroundSize: `${20 * zoom}px ${20 * zoom}px`,
				backgroundPosition: `${pan.x}px ${pan.y}px`,
			}}
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

/* ── Skeleton diagram ── */

/**
 * Loading representation only. It mirrors the real tree's spatial language by
 * running a fixed, synthetic tree through the SAME `layoutTaskGraph` the actual
 * tasks use, so node geometry, depth, and edge routing can never drift from the
 * rendered board. Labels are never rendered (only shimmer bars), so no fake task
 * data is shown, and the shape is deliberately irregular — varied feature
 * heights, task counts, subtask counts, and detail depth — so the loading state
 * reads like a task tree instead of a symmetric placeholder.
 */
const SKELETON_TREE: TaskTree = {
	features: [
		{
			name: "Fitur",
			tasks: [
				{
					name: "Task",
					description: "",
					priority: "medium",
					covers: [],
					surfaces: [],
					subtasks: [
						{ name: "Subtask", description: "", details: ["", "", ""] },
						{ name: "Subtask", description: "", details: [""] },
					],
				},
				{
					name: "Task",
					description: "",
					priority: "medium",
					covers: [],
					surfaces: [],
					subtasks: [
						{ name: "Subtask", description: "", details: [""] },
						{ name: "Subtask", description: "", details: [""] },
						{ name: "Subtask", description: "", details: ["", ""] },
					],
				},
				{
					name: "Task",
					description: "",
					priority: "medium",
					covers: [],
					surfaces: [],
					subtasks: [{ name: "Subtask", description: "", details: [""] }],
				},
			],
		},
		{
			name: "Fitur",
			tasks: [
				{
					name: "Task",
					description: "",
					priority: "medium",
					covers: [],
					surfaces: [],
					subtasks: [
						{ name: "Subtask", description: "", details: ["", ""] },
						{ name: "Subtask", description: "", details: [""] },
						{ name: "Subtask", description: "", details: [""] },
						{ name: "Subtask", description: "", details: [""] },
					],
				},
				{
					name: "Task",
					description: "",
					priority: "medium",
					covers: [],
					surfaces: [],
					subtasks: [{ name: "Subtask", description: "", details: [""] }],
				},
			],
		},
		{
			name: "Fitur",
			tasks: [
				{
					name: "Task",
					description: "",
					priority: "medium",
					covers: [],
					surfaces: [],
					subtasks: [
						{ name: "Subtask", description: "", details: ["", ""] },
						{ name: "Subtask", description: "", details: [""] },
					],
				},
				{
					name: "Task",
					description: "",
					priority: "medium",
					covers: [],
					surfaces: [],
					subtasks: [
						{ name: "Subtask", description: "", details: [""] },
						{ name: "Subtask", description: "", details: [""] },
						{ name: "Subtask", description: "", details: [""] },
						{ name: "Subtask", description: "", details: [""] },
						{ name: "Subtask", description: "", details: [""] },
					],
				},
				{
					name: "Task",
					description: "",
					priority: "medium",
					covers: [],
					surfaces: [],
					subtasks: [
						{ name: "Subtask", description: "", details: [""] },
						{ name: "Subtask", description: "", details: [""] },
					],
				},
				{
					name: "Task",
					description: "",
					priority: "medium",
					covers: [],
					surfaces: [],
					subtasks: [{ name: "Subtask", description: "", details: [""] }],
				},
			],
		},
		{
			name: "Fitur",
			tasks: [
				{
					name: "Task",
					description: "",
					priority: "medium",
					covers: [],
					surfaces: [],
					subtasks: [
						{ name: "Subtask", description: "", details: ["", "", ""] },
						{ name: "Subtask", description: "", details: [""] },
					],
				},
				{
					name: "Task",
					description: "",
					priority: "medium",
					covers: [],
					surfaces: [],
					subtasks: [
						{ name: "Subtask", description: "", details: [""] },
						{ name: "Subtask", description: "", details: [""] },
					],
				},
				{
					name: "Task",
					description: "",
					priority: "medium",
					covers: [],
					surfaces: [],
					subtasks: [{ name: "Subtask", description: "", details: [""] }],
				},
			],
		},
		{
			name: "Fitur",
			tasks: [
				{
					name: "Task",
					description: "",
					priority: "medium",
					covers: [],
					surfaces: [],
					subtasks: [
						{ name: "Subtask", description: "", details: ["", ""] },
						{ name: "Subtask", description: "", details: [""] },
					],
				},
				{
					name: "Task",
					description: "",
					priority: "medium",
					covers: [],
					surfaces: [],
					subtasks: [
						{ name: "Subtask", description: "", details: [""] },
						{ name: "Subtask", description: "", details: ["", ""] },
					],
				},
			],
		},
	],
};

const SKELETON_BAR = "rounded bg-fog/10";

/** Ghost shells mirroring the real node types, sized by the shared layout. */
function SkeletonDiagram() {
	const { nodes, edges } = useMemo(
		() => layoutTaskGraph(SKELETON_TREE, "Project"),
		[],
	);

	return (
		<>
			<Edges edges={edges} />
			{nodes.map((node) => {
				if (node.type === "root") {
					return (
						<div
							key={node.id}
							className="absolute flex animate-pulse items-center justify-center rounded-xl border-2 border-fog/20 bg-fog/5"
							style={{
								left: node.x,
								top: node.y,
								width: node.w,
								height: node.h,
							}}
						>
							<div className={`h-4 w-24 ${SKELETON_BAR}`} />
						</div>
					);
				}
				if (node.type === "feature") {
					return (
						<div
							key={node.id}
							className="absolute animate-pulse rounded-xl border border-fog/15 bg-fog/5"
							style={{
								left: node.x,
								top: node.y,
								width: node.w,
								height: node.h,
							}}
						>
							<div className="flex h-full flex-col justify-center gap-2 px-4">
								<div className={`h-3 w-12 ${SKELETON_BAR}`} />
								<div className={`h-4 w-36 ${SKELETON_BAR}`} />
							</div>
						</div>
					);
				}
				return (
					<div
						key={node.id}
						className="absolute animate-pulse rounded-xl border border-fog/10 bg-fog/[0.03]"
						style={{
							left: node.x,
							top: node.y,
							width: node.w,
							height: node.h,
						}}
					>
						<div className="px-3 pt-2 pb-1.5">
							<div className={`h-2.5 w-16 ${SKELETON_BAR}`} />
						</div>
						<div className="space-y-1.5 px-3 pb-2">
							<div className={`h-2.5 w-32 ${SKELETON_BAR}`} />
							<div className={`h-2.5 w-24 ${SKELETON_BAR}`} />
							<div className={`h-2.5 w-28 ${SKELETON_BAR}`} />
						</div>
					</div>
				);
			})}
		</>
	);
}

/* ── Node components ── */

// ponytail: memoized so per-frame pan/zoom renders of WhiteboardCanvas skip
// re-rendering every node (props are stable: layoutTaskGraph is useMemo'd and
// openers are stable setState wrappers).
export const Edges = memo(function Edges({ edges }: { edges: LayoutEdge[] }) {
	return (
		<svg
			aria-hidden="true"
			className="pointer-events-none absolute left-0 top-0"
			width="100%"
			height="100%"
			style={{ overflow: "visible" }}
		>
			{edges.map((e) => {
				const midX = (e.x1 + e.x2) / 2;
				return (
					<path
						key={`edge-${e.x1}-${e.y1}-${e.x2}-${e.y2}`}
						d={`M ${e.x1} ${e.y1} C ${midX} ${e.y1}, ${midX} ${e.y2}, ${e.x2} ${e.y2}`}
						fill="none"
						stroke={e.color}
						strokeWidth={1.5}
						strokeOpacity={e.dashed ? 0.65 : 0.5}
						strokeDasharray={e.dashed ? "5 5" : undefined}
					/>
				);
			})}
		</svg>
	);
});

export const BoardHandle = memo(function BoardHandle({
	className = "",
}: {
	className?: string;
}) {
	return (
		<span
			aria-hidden
			className={`pointer-events-none absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full border-2 border-onyx bg-fog ${className}`}
		/>
	);
});

export const RootNode = memo(function RootNode({ node }: { node: LayoutNode }) {
	return (
		<div
			className="absolute rounded-xl border border-graphite bg-charcoal/90 p-4 shadow-sm animate-fadeIn"
			style={{ left: node.x, top: node.y, width: node.w, height: node.h }}
			role="img"
			aria-label={`Produk ${node.label}`}
		>
			<div className="flex h-full items-center gap-3">
				<span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-graphite bg-obsidian text-snow">
					<Box size={18} aria-hidden />
				</span>
				<span className="min-w-0">
					<span className="block truncate font-inter text-sm font-semibold text-snow">
						{node.label}
					</span>
					<span className="block text-[11px] text-fog">Perencanaan</span>
				</span>
			</div>
			<BoardHandle className="-right-[5px]" />
		</div>
	);
});

export const FeatureNode = memo(function FeatureNode({
	node,
}: {
	node: LayoutNode;
}) {
	const done = node.doneRows ?? 0;
	const total = node.totalRows ?? node.taskCount ?? 0;
	return (
		<div
			className="absolute rounded-xl border border-graphite bg-charcoal/90 shadow-sm animate-fadeIn"
			style={{ left: node.x, top: node.y, width: node.w, height: node.h }}
			role="img"
			aria-label={`Fitur ${node.label}, fase ${node.phase ?? "-"}, ${done} dari ${total} selesai`}
		>
			<BoardHandle className="-left-[5px]" />
			<div className="flex h-full flex-col justify-between py-2 px-3.5">
				<div className="flex items-center justify-end">
					<span
						className={`rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase leading-none ${faseBadgeClass(node.phase)}`}
					>
						Fase {node.phase ?? "-"}
					</span>
				</div>
				<div className="flex items-center gap-2.5">
					<span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-graphite bg-obsidian text-snow">
						<FeatureIcon label={node.label} size={16} />
					</span>
					<p
						className="min-w-0 flex-1 truncate font-inter text-sm font-[510] text-snow"
						title={node.label}
					>
						{node.label}
					</p>
					<ChevronRight size={14} className="shrink-0 text-fog" aria-hidden />
				</div>
				<div className="flex items-center justify-between text-[11px] text-fog">
					<span>Direncanakan</span>
					<span className="tabular-nums">
						{done}/{total}
					</span>
				</div>
			</div>
			<BoardHandle className="-right-[5px]" />
		</div>
	);
});

export const ContainerNode = memo(function ContainerNode({
	node,
	onOpen,
}: {
	node: LayoutNode;
	onOpen: (node: LayoutNode) => void;
}) {
	const isTasks = node.containerKind === "tasks";
	const rows = node.rows ?? [];
	const total = node.totalRows ?? rows.length;
	const visible = rows.slice(0, MAX_VISIBLE_CONTAINER_ROWS);
	const hasMore = total > MAX_VISIBLE_CONTAINER_ROWS;
	return (
		<div
			className="absolute flex flex-col rounded-xl border border-graphite bg-charcoal/90 p-3 shadow-sm animate-fadeIn"
			style={{ left: node.x, top: node.y, width: node.w, height: node.h }}
			role="img"
			aria-label={`${node.label} ${node.ownerFeature ?? node.subfeatureName ?? ""}, ${node.doneRows ?? 0} dari ${total} selesai`}
		>
			<BoardHandle className="-left-[5px]" />
			<div className="flex items-center justify-between px-1 pb-2">
				<span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-fog">
					{isTasks ? (
						<ListChecks size={12} aria-hidden />
					) : (
						<LayoutGrid size={12} aria-hidden />
					)}
					{node.label}
				</span>
				<span className="text-[11px] tabular-nums text-fog">
					{node.doneRows ?? 0}/{total}
				</span>
			</div>
			<ul className="flex flex-1 flex-col justify-center gap-1.5">
				{visible.map((row) => (
					<li
						key={row.id}
						title={row.description ?? row.name}
						className="flex items-center gap-2 rounded-md border border-white/5 bg-onyx/60 px-3 py-2"
					>
						<span
							aria-hidden
							className={`h-1.5 w-1.5 shrink-0 rounded-[2px] ${row.done ? "bg-emerald" : "bg-fog/50"}`}
						/>
						<span className="min-w-0 flex-1 truncate font-inter text-xs text-snow">
							{row.name}
						</span>
						{row.done ? (
							<span className="shrink-0 text-[10px] text-fog">Selesai</span>
						) : null}
					</li>
				))}
			</ul>
			{hasMore ? (
				<div className="flex justify-end pt-1.5">
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							onOpen(node);
						}}
						onPointerDown={(e) => e.stopPropagation()}
						className="flex items-center gap-0.5 text-[11px] font-[510] text-indigo transition-colors hover:text-indigo/80"
					>
						Lihat semua ({total}) <ChevronRight size={11} aria-hidden />
					</button>
				</div>
			) : null}
			<BoardHandle className="-right-[5px]" />
		</div>
	);
});

export function ContainerModal({
	node,
	onClose,
}: {
	node: LayoutNode;
	onClose: () => void;
}) {
	const color = COLORS[node.colorIdx];
	const rows = node.rows ?? [];
	const isTasks = node.containerKind === "tasks";
	const tasks = node.tasks ?? [];
	return (
		<>
			{/* biome-ignore lint/a11y/noStaticElementInteractions: backdrop click is a mouse shortcut; keyboard dismiss via the close button */}
			{/* biome-ignore lint/a11y/useKeyWithClickEvents: backdrop click is a mouse shortcut; keyboard dismiss via the close button */}
			<div
				className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 animate-in fade-in duration-200"
				onClick={onClose}
			>
				{/* biome-ignore lint/a11y/noStaticElementInteractions: stopPropagation only, no action to keyboard-activate */}
				{/* biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation only, no action to keyboard-activate */}
				<div
					className={`w-full max-w-lg max-h-[80vh] overflow-y-auto rounded-xl border ${color?.border ?? "border-graphite"} bg-obsidian p-5 shadow-[var(--shadow-overlay)] animate-in zoom-in-95 duration-200`}
					onClick={(e) => e.stopPropagation()}
				>
					<div className="mb-4 flex items-center gap-2">
						<div
							className={`h-2 w-2 shrink-0 rounded-full ${color?.badge ?? "bg-fog"}`}
						/>
						<p className="truncate font-inter text-sm font-[510] text-snow">
							{node.label}
							{node.ownerFeature ? ` · ${node.ownerFeature}` : ""}
							{!isTasks && node.subfeatureName
								? ` · ${node.subfeatureName}`
								: ""}
						</p>
						<span className="ml-auto shrink-0 text-xs tabular-nums text-fog">
							{node.doneRows ?? 0}/{node.totalRows ?? rows.length}
						</span>
						<button
							type="button"
							onClick={onClose}
							aria-label="Tutup daftar"
							className="shrink-0 text-fog transition-colors hover:text-snow"
						>
							<X size={18} />
						</button>
					</div>
					{isTasks ? (
						<ul className="space-y-3">
							{tasks.map((t) => (
								<li
									key={t.name}
									className="rounded-lg border border-graphite/60 bg-charcoal/40 px-3 py-2"
								>
									<p className="flex items-center gap-2 font-inter text-sm text-snow">
										<span
											aria-hidden
											className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border border-graphite bg-charcoal"
										>
											{t.status === "completed" || t.status === "done" ? (
												<span className="h-1.5 w-1.5 rounded-sm bg-emerald" />
											) : (
												<span className="h-1.5 w-1.5 rounded-sm bg-fog/30" />
											)}
										</span>
										<span className="truncate">{t.name}</span>
									</p>
									{t.subtasks.length > 0 ? (
										<ul className="mt-1.5 space-y-1 pl-5">
											{t.subtasks.map((s) => (
												<li key={s.name} className="text-xs text-fog">
													{s.name}
													{s.details.length > 0 ? (
														<ul className="mt-0.5 space-y-0.5 pl-3">
															{s.details.map((d) => (
																<li key={d} className="text-[11px] text-fog/70">
																	– {d}
																</li>
															))}
														</ul>
													) : null}
												</li>
											))}
										</ul>
									) : null}
								</li>
							))}
						</ul>
					) : (
						<ul className="space-y-2">
							{rows.map((r) => (
								<li
									key={r.id}
									className="rounded-lg border border-graphite/60 bg-charcoal/40 px-3 py-2"
								>
									<p className="font-inter text-sm text-snow">{r.name}</p>
									{r.description ? (
										<p className="mt-0.5 text-xs leading-relaxed text-fog">
											{r.description}
										</p>
									) : null}
								</li>
							))}
						</ul>
					)}
				</div>
			</div>
		</>
	);
}
