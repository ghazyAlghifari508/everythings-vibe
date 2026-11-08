import type { FlowStep } from "./flow-step";

export type WorkspaceView = "ask" | "fitur" | "prd" | "ac" | "task" | "kanban";
export interface WorkspaceAvailability {
	projectId: string;
	step: string | null;
	lastUrl: string | null;
	hasFeatures: boolean;
	hasPrd: boolean;
	hasAc: boolean;
	hasTasks: boolean;
	hasHandoff: boolean;
	featuresStatus: string | null;
}

export function workspaceView(path: string): WorkspaceView | null {
	const match =
		/^\/vibeplan\/[^/]+\/(ask|fitur|prd|ac|task|kanban)$/.exec(path) ??
		/^\/(ask|fitur|prd|ac|task|kanban)\/[^/]+$/.exec(path);
	const view = match?.[1];
	if (
		view === "ask" ||
		view === "fitur" ||
		view === "prd" ||
		view === "ac" ||
		view === "task" ||
		view === "kanban"
	)
		return view;
	return null;
}

export function workspaceProgress(data: WorkspaceAvailability): FlowStep {
	if (data.hasTasks) return "task";
	if (data.hasAc) return "ac";
	if (data.hasPrd) return "prd";
	if (data.hasFeatures) return "fitur";
	return "question";
}

export function accessibleWorkspaceView(
	view: WorkspaceView,
	data: WorkspaceAvailability,
): WorkspaceView {
	if (view === "ask") return view;
	if (
		view === "fitur" &&
		(data.hasHandoff ||
			data.hasFeatures ||
			data.hasPrd ||
			data.featuresStatus === "generating")
	)
		return view;
	if (view === "prd" && (data.hasFeatures || data.hasPrd)) return view;
	if (view === "ac" && data.hasPrd) return view;
	if (view === "task" && data.hasAc) return view;
	if (view === "kanban" && data.hasTasks) return view;
	return resolveWorkspaceResume({ ...data, lastUrl: null });
}

export function resolveWorkspaceResume(
	data: WorkspaceAvailability,
): WorkspaceView {
	const last = data.lastUrl;
	if (
		last &&
		(last === `/vibeplan/${data.projectId}/${workspaceView(last)}` ||
			last === `/${workspaceView(last)}/${data.projectId}`)
	) {
		const view = workspaceView(last);
		if (
			view &&
			accessibleWorkspaceView(view, { ...data, lastUrl: null }) === view
		)
			return view;
	}
	if (data.hasTasks) return "task";
	if (data.hasAc) return "ac";
	if (data.hasPrd) return "prd";
	if (
		data.hasFeatures ||
		data.hasHandoff ||
		data.featuresStatus === "generating"
	)
		return "fitur";
	return "ask";
}
