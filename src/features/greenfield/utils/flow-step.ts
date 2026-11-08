// ponytail: pure step<->route mapping + flow ordering, no client deps. Lives
// outside the "use client" flow-step-nav.tsx so tests + server code can import
// it without dragging next/navigation (→ Buffer) into their graph.
// Ranking is defined here (not in @/lib/flow-progress) so progression policies
// can rank steps without a back-import cycle.

import { workspaceView } from "./workspace-routing";

export type FlowStep = "question" | "fitur" | "prd" | "ac" | "task";

/** Flow order. Index = progress rank; higher wins. */
const STEP_ORDER: readonly string[] = [
	"question",
	"fitur",
	"prd",
	"ac",
	"task",
];

export function stepRank(step: string | null | undefined): number {
	const i = STEP_ORDER.indexOf(step ?? "");
	// ponytail: unknown/null ranks as "prd" (the default landing), matching
	// stepToRoute's fallback so rank and route never disagree.
	return i === -1 ? STEP_ORDER.indexOf("prd") : i;
}

export function routeToStep(pathname: string): FlowStep {
	const view = workspaceView(pathname);
	if (view === "ask" || pathname === "/ask") return "question";
	if (view === "kanban") return "task";
	if (view) return view;
	if (pathname === "/fitur") return "fitur";
	return "prd";
}

export interface FlowStepCta {
	kind: "generate" | "navigate";
	label: string;
	targetStep: FlowStep;
}

/**
 * Derives state-aware CTA for the workspace navbar.
 * Prevents misleading "Generate AC" or "Generate Task" actions when the project
 * has already progressed past that stage (e.g. user opening /prd via browser history).
 */
export function getFlowStepCta(
	currentRouteStep: FlowStep,
	projectStep: string | null | undefined,
	hasPrd?: boolean,
): FlowStepCta | null {
	const dbRank = stepRank(projectStep);

	if (currentRouteStep === "question") {
		if (dbRank >= stepRank("task")) {
			return {
				kind: "navigate",
				label: "Kembali ke Task",
				targetStep: "task",
			};
		}
		if (dbRank >= stepRank("ac")) {
			return {
				kind: "navigate",
				label: "Kembali ke AC",
				targetStep: "ac",
			};
		}
		if (hasPrd) {
			return {
				kind: "navigate",
				label: "Kembali ke PRD",
				targetStep: "prd",
			};
		}
		if (dbRank >= stepRank("fitur")) {
			return {
				kind: "navigate",
				label: "Lihat Fitur",
				targetStep: "fitur",
			};
		}
		return {
			kind: "generate",
			label: "Lihat Fitur",
			targetStep: "fitur",
		};
	}

	if (currentRouteStep === "prd") {
		if (dbRank >= stepRank("task")) {
			return {
				kind: "navigate",
				label: "Kembali ke Task",
				targetStep: "task",
			};
		}
		if (dbRank >= stepRank("ac")) {
			return {
				kind: "navigate",
				label: "Lanjut ke AC",
				targetStep: "ac",
			};
		}
		if (dbRank < stepRank("prd")) {
			return {
				kind: "navigate",
				label: "Kembali ke Fitur",
				targetStep: "fitur",
			};
		}
		return {
			kind: "generate",
			label: "Generate AC",
			targetStep: "ac",
		};
	}

	if (currentRouteStep === "fitur") {
		if (dbRank >= stepRank("task")) {
			return {
				kind: "navigate",
				label: "Kembali ke Task",
				targetStep: "task",
			};
		}
		if (dbRank >= stepRank("ac")) {
			return {
				kind: "navigate",
				label: "Lanjut ke AC",
				targetStep: "ac",
			};
		}
		if (dbRank >= stepRank("prd")) {
			return {
				kind: "navigate",
				label: "Lanjut ke PRD",
				targetStep: "prd",
			};
		}
		return {
			kind: "generate",
			label: "Generate PRD",
			targetStep: "prd",
		};
	}
	if (currentRouteStep === "ac") {
		if (dbRank >= stepRank("task")) {
			return {
				kind: "navigate",
				label: "Kembali ke Task",
				targetStep: "task",
			};
		}
		return {
			kind: "generate",
			label: "Generate Task",
			targetStep: "task",
		};
	}

	return null;
}

/** Canonical UI routes; workflow progress is verified separately from the URL. */
export function stepToRoute(
	step: string | null | undefined,
	projectId: string,
): string {
	const view =
		step === "question"
			? "ask"
			: step === "fitur" ||
					step === "ac" ||
					step === "task" ||
					step === "kanban"
				? step
				: "prd";
	return `/vibeplan/${encodeURIComponent(projectId)}/${view}`;
}

export type StepRouteTarget =
	| { to: "/vibeplan/$id/ask"; params: { id: string } }
	| { to: "/vibeplan/$id/fitur"; params: { id: string } }
	| { to: "/vibeplan/$id/prd"; params: { id: string } }
	| { to: "/vibeplan/$id/ac"; params: { id: string } }
	| { to: "/vibeplan/$id/task"; params: { id: string } }
	| { to: "/vibeplan/$id/kanban"; params: { id: string } };

export function stepToRouteTarget(
	step: string | null | undefined,
	projectId: string,
): StepRouteTarget {
	switch (step) {
		case "question":
		case "ask":
			return { to: "/vibeplan/$id/ask", params: { id: projectId } };
		case "fitur":
			return { to: "/vibeplan/$id/fitur", params: { id: projectId } };
		case "ac":
			return { to: "/vibeplan/$id/ac", params: { id: projectId } };
		case "task":
			return { to: "/vibeplan/$id/task", params: { id: projectId } };
		case "kanban":
			return { to: "/vibeplan/$id/kanban", params: { id: projectId } };
		default:
			return { to: "/vibeplan/$id/prd", params: { id: projectId } };
	}
}
