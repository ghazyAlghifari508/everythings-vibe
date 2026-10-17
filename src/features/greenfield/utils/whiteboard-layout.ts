import type { ProjectFeatureTree } from "@/db/schema";
import { groupTasksBySubfeature } from "@/features/greenfield/components/feature-tree/feature-view";
import type { TaskTree } from "@/features/greenfield/services/task-tree";
import type {
	ContainerRow,
	LayoutEdge,
	LayoutNode,
	TaskContainerTask,
} from "../types/whiteboard";

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

export function layoutTaskGraph(
	tree: TaskTree,
	projectName: string,
	featureTree?: ProjectFeatureTree | null,
): { nodes: LayoutNode[]; edges: LayoutEdge[]; width: number; height: number } {
	const nodes: LayoutNode[] = [];
	const edges: LayoutEdge[] = [];

	const features = tree.features;
	const ssotFeatures = featureTree?.features ?? [];
	// Greenfield projects reach /task with a filled featureTree but no generated
	// tasks yet: lay out the real product/feature/subfeature columns and let only
	// the TASKS containers shimmer. Empty result only when both sources are empty.
	if (features.length === 0 && ssotFeatures.length === 0)
		return { nodes, edges, width: 0, height: 0 };

	function isTaskDone(status: string | undefined): boolean {
		return status === "completed" || status === "done";
	}

	function cleanFeatureName(name: string): string {
		return name
			.replace(/^feat(?:ure)?[-_\s]*\d+[:.\s-]*/i, "")
			.trim()
			.toLowerCase();
	}

	interface DisplayFeature {
		name: string;
		phase: number;
		subfeatures: Array<{ id: string; name: string; description?: string }>;
		tasks: TaskTree["features"][number]["tasks"];
	}

	const displayFeatures: DisplayFeature[] =
		ssotFeatures.length > 0
			? ssotFeatures.map((ssot) => {
					const ssotSubIds = new Set(ssot.subfeatures.map((s) => s.id));
					const cleanedSsot = cleanFeatureName(ssot.name);
					const tasks = features.flatMap((tf) => {
						const nameMatch = cleanFeatureName(tf.name) === cleanedSsot;
						return tf.tasks.filter((t) => {
							if (t.subfeatureId && ssotSubIds.has(t.subfeatureId)) return true;
							if (!t.subfeatureId && nameMatch) return true;
							return false;
						});
					});
					return {
						name: ssot.name,
						phase: ssot.phase,
						subfeatures: ssot.subfeatures,
						tasks,
					};
				})
			: features.map((feature, fi) => ({
					name: feature.name,
					phase: fi + 1,
					subfeatures: [],
					tasks: feature.tasks,
				}));

	if (displayFeatures.length === 0)
		return { nodes, edges, width: 0, height: 0 };

	interface FeaturePlan {
		subRows: ContainerRow[];
		subDone: number;
		taskRows: ContainerRow[];
		taskPayloads: TaskContainerTask[];
		taskDone: number;
		subH: number;
		taskH: number;
		height: number;
		isSkeleton: boolean;
	}

	const plans: FeaturePlan[] = displayFeatures.map((feature) => {
		const officialIds = new Set(feature.subfeatures.map((s) => s.id));
		const groups = groupTasksBySubfeature(feature.tasks);
		// Shared done rule: a subfeature is done only when it owns at least
		// one task and every owned task is done. Empty official rows stay pending.
		const isDone = (indexes: readonly number[]) =>
			indexes.length > 0 &&
			indexes.every((ti) => isTaskDone(feature.tasks[ti]?.status));

		// Official SSOT rows first, in official order with official names,
		// so the SUB FITUR column renders the full official list even when
		// a subfeature has zero tasks yet.
		const subRows: ContainerRow[] =
			feature.subfeatures.length > 0
				? feature.subfeatures.map((s) => {
						const linked = groups.find((g) => g.key === s.id);
						return {
							id: s.id,
							name: s.name,
							description: s.description,
							done: linked ? isDone(linked.taskIndexes) : false,
						};
					})
				: [];
		let subDone = subRows.filter((r) => r.done).length;

		if (feature.subfeatures.length === 0) {
			for (const g of groups) {
				if (!g.subfeatureName) continue;
				const done = isDone(g.taskIndexes);
				if (done) subDone += 1;
				subRows.push({ id: g.key, name: g.subfeatureName, done });
			}
			// Unlinked tasks (legacy trees) keep one honest fallback row.
			const legacyIndexes = groups
				.filter((g) => !g.subfeatureName)
				.flatMap((g) => g.taskIndexes);
			if (legacyIndexes.length > 0) {
				const done = isDone(legacyIndexes);
				if (done) subDone += 1;
				const [first] = legacyIndexes;
				const name =
					legacyIndexes.length > 1
						? `Tugas fitur (${legacyIndexes.length})`
						: (first !== undefined && feature.tasks[first]?.name) ||
							"Tugas fitur";
				subRows.push({ id: "__legacy", name, done });
			}
		} else {
			// AI-only leftovers: named groups with no official id keep their label.
			for (const g of groups) {
				if (!g.subfeatureName || officialIds.has(g.key)) continue;
				const done = isDone(g.taskIndexes);
				if (done) subDone += 1;
				subRows.push({ id: g.key, name: g.subfeatureName, done });
			}
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
		const isSkeleton = feature.tasks.length === 0;
		const subH = containerH(subRows.length);
		// Skeleton containers reserve room for the max visible rows so the swap to
		// real tasks (up to 3) does not jump the layout.
		const taskH = isSkeleton
			? containerH(MAX_VISIBLE_CONTAINER_ROWS)
			: containerH(taskRows.length);
		return {
			subRows,
			subDone,
			taskRows,
			taskPayloads,
			taskDone,
			subH,
			taskH,
			height: Math.max(FEATURE_H, subH, taskH),
			isSkeleton,
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

	for (let fi = 0; fi < displayFeatures.length; fi++) {
		const feature = displayFeatures[fi];
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
			phase: feature.phase,
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
			isSkeleton: plan.isSkeleton,
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
