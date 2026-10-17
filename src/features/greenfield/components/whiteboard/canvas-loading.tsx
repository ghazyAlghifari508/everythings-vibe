"use client";

import { useMemo } from "react";
import type { TaskTree } from "@/features/greenfield/services/task-tree";
import { layoutTaskGraph } from "../../utils/whiteboard-layout";
import { Edges } from "./canvas-connectors";

/**
 * Loading representation only. It mirrors the real tree's spatial language by
 * running a fixed, synthetic tree through the SAME `layoutTaskGraph` the actual
 * tasks use, so node geometry, depth, and edge routing can never drift from the
 * rendered board. Labels are never rendered (only shimmer bars), so no fake task
 * data is shown, and the shape is deliberately irregular — varied feature
 * heights, task counts, subtask counts, and detail depth — so the loading state
 * reads like a task tree instead of a symmetric placeholder.
 */
export const SKELETON_TREE: TaskTree = {
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
export function SkeletonDiagram() {
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
