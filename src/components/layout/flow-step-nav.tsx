"use client";

import { Tick01Icon } from "@hugeicons/core-free-icons";
import { useLocation } from "@tanstack/react-router";
import { Icon } from "@/components/ui/icon";
import { type FlowStep, stepRank } from "@/features/greenfield/utils/flow-step";
import {
	type WorkspaceAvailability,
	workspaceView,
} from "@/features/greenfield/utils/workspace-routing";
import { cn } from "@/lib/utils";

export type StepId = FlowStep;

const STEPS = [
	{ id: "ask", label: "Ask" },
	{ id: "fitur", label: "Fitur" },
	{ id: "prd", label: "PRD" },
	{ id: "ac", label: "AC" },
	{ id: "task", label: "Task" },
	{ id: "kanban", label: "Kanban" },
] as const;

/**
 * Pure visual status indicator showing project progress.
 * Non-clickable: conveys "where the project is", not "where to navigate".
 */
export function FlowStepNav(props?: {
	step?: FlowStep | string | null;
	taskStatus?: string | null;
	availability?: WorkspaceAvailability;
}) {
	const pathname = useLocation({ select: (l) => l.pathname });
	const view = workspaceView(pathname);
	const dbRank = stepRank(props?.step ?? "question");
	const completed = {
		ask: Boolean(
			props?.availability?.hasHandoff ||
				props?.availability?.hasFeatures ||
				props?.availability?.hasPrd ||
				props?.availability?.hasAc ||
				props?.availability?.hasTasks,
		),
		fitur: Boolean(props?.availability?.hasFeatures),
		prd: Boolean(props?.availability?.hasPrd),
		ac: Boolean(props?.availability?.hasAc),
		task: Boolean(props?.availability?.hasTasks),
		kanban: false,
	};

	return (
		<ol
			aria-label="Progress alur proyek"
			className="flex items-center gap-1.5 md:gap-2 select-none"
		>
			{STEPS.map((s, idx) => {
				const isCurrentRoute = s.id === view;
				const isCompleted = completed[s.id];
				const isActive = isCurrentRoute;
				const isLocked = !isCompleted && !isActive;
				const connectorActive = idx <= dbRank;

				return (
					<li
						key={s.id}
						className="flex items-center gap-1.5 md:gap-2"
						aria-current={isActive ? "step" : undefined}
					>
						{idx > 0 && (
							<span
								aria-hidden
								className={cn(
									"hidden h-px w-4 transition-colors duration-300 md:block",
									connectorActive ? "bg-indigo/60" : "bg-graphite",
								)}
							/>
						)}
						<div className="flex items-center gap-1.5 cursor-default">
							<span
								className={cn(
									"flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-[510] transition-colors duration-300",
									isCompleted && "bg-emerald text-charcoal",
									isActive && "bg-indigo text-white",
									isLocked && "border border-graphite text-fog",
								)}
								aria-hidden="true"
							>
								{isCompleted ? (
									<Icon icon={Tick01Icon} size={12} strokeWidth={3} />
								) : (
									idx + 1
								)}
							</span>
							<span
								className={cn(
									"hidden font-inter text-sm transition-colors duration-300 md:block",
									isActive
										? "font-[510] text-snow"
										: isCompleted
											? "font-normal text-snow"
											: "font-normal text-fog",
								)}
							>
								{s.label}
								{isCompleted && <span className="sr-only"> (Selesai)</span>}
								{isActive && <span className="sr-only"> (Tahap saat ini)</span>}
							</span>
						</div>
					</li>
				);
			})}
		</ol>
	);
}

/**
 * The existing-codebase onboarding is two steps, not three.
 *
 * Copying the prompt, watching the agent connect, and watching the upload land
 * are all part of one instruction screen, so a separate "watch the sync" step
 * would only repeat the same status the user is already looking at. The
 * conclusion step is the only place after it.
 */
export type CodebasePlanStep = "sync" | "summary";

const CODEBASE_STEPS: Array<{ id: CodebasePlanStep; label: string }> = [
	{ id: "sync", label: "Sync Codebase" },
	{ id: "summary", label: "Kesimpulan Codebase" },
];

export function CodebaseStepNav(props: {
	step?: CodebasePlanStep;
	onSelectStep?: (step: CodebasePlanStep) => void;
}) {
	const currentStep = props.step ?? "sync";
	// Derived from the list rather than hand-indexed, so adding or removing a
	// step cannot leave the connector and the completed marks disagreeing with
	// the labels.
	const currentIdx = Math.max(
		0,
		CODEBASE_STEPS.findIndex((s) => s.id === currentStep),
	);

	return (
		<ol
			aria-label="Tahapan sinkronisasi codebase"
			className="flex items-center gap-1.5 md:gap-2 select-none"
		>
			{CODEBASE_STEPS.map((s, idx) => {
				const isCompleted = currentIdx > idx;
				const isActive = currentIdx === idx;
				const isLocked = currentIdx < idx;
				const connectorActive = idx <= currentIdx;

				return (
					<li
						key={s.id}
						className="flex items-center gap-1.5 md:gap-2"
						aria-current={isActive ? "step" : undefined}
					>
						{idx > 0 && (
							<span
								aria-hidden
								className={cn(
									"hidden h-px w-4 transition-colors duration-300 md:block",
									connectorActive ? "bg-indigo/60" : "bg-graphite",
								)}
							/>
						)}
						<button
							type="button"
							disabled={isLocked || !props.onSelectStep}
							onClick={() => props.onSelectStep?.(s.id)}
							className={cn(
								"flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo rounded transition",
								isLocked || !props.onSelectStep
									? "cursor-default"
									: "cursor-pointer hover:opacity-80",
							)}
						>
							<span
								className={cn(
									"flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-[510] transition-colors duration-300",
									isCompleted && "bg-emerald text-charcoal",
									isActive && "bg-indigo text-white",
									isLocked && "border border-graphite text-fog",
								)}
								aria-hidden="true"
							>
								{isCompleted ? (
									<Icon icon={Tick01Icon} size={12} strokeWidth={3} />
								) : (
									idx + 1
								)}
							</span>
							<span
								className={cn(
									"hidden font-inter text-sm transition-colors duration-300 md:block",
									isActive
										? "font-[510] text-snow"
										: isCompleted
											? "font-normal text-snow"
											: "font-normal text-fog",
								)}
							>
								{s.label}
								{isCompleted && <span className="sr-only"> (Selesai)</span>}
								{isActive && <span className="sr-only"> (Tahap saat ini)</span>}
							</span>
						</button>
					</li>
				);
			})}
		</ol>
	);
}
