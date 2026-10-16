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
	isSkeleton?: boolean;
}

export interface LayoutEdge {
	x1: number;
	y1: number;
	x2: number;
	y2: number;
	color: string;
	dashed?: boolean;
}
