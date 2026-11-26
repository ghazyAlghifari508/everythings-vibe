"use client";

import {
	Alert02Icon,
	Calendar01Icon,
	CheckmarkCircle01Icon,
	CheckmarkSquare02Icon,
	Layers01Icon,
	PlayIcon,
} from "@hugeicons/core-free-icons";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icon";
import type { TaskCard } from "@/features/greenfield/hooks/use-kanban-polling";
import { TASK_STATUS_LABELS } from "@/lib/kanban-utils";
import { PriorityIndicator } from "./priority-indicator";

export interface TaskDetailDialogProps {
	card: TaskCard;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function TaskDetailDialog({
	card,
	open,
	onOpenChange,
}: TaskDetailDialogProps) {
	const formatTime = (isoString: string | null) => {
		if (!isoString) return "";
		const date = new Date(isoString);
		return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
	};

	const formatDate = (isoString: string | null) => {
		if (!isoString) return "";
		const date = new Date(isoString);
		return date.toLocaleDateString([], { month: "short", day: "numeric" });
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				data-testid="task-detail-dialog"
				className="!flex !flex-col max-w-lg max-h-[85vh] p-6 bg-obsidian border border-graphite rounded-xl overflow-hidden"
			>
				<DialogHeader className="shrink-0 pb-3 border-b border-graphite/40">
					<div className="flex items-center gap-2 text-xs font-semibold text-indigo uppercase tracking-wider mb-1">
						<Icon icon={Layers01Icon} size={14} />
						Detail Task
					</div>
					<DialogTitle className="text-xl font-bold text-snow leading-snug">
						{card.name}
					</DialogTitle>
					<DialogDescription className="text-xs text-fog mt-1">
						Fitur:{" "}
						<span className="font-[510] text-snow">{card.featureName}</span>
					</DialogDescription>
				</DialogHeader>

				<div className="flex-1 min-h-0 overflow-y-auto pr-1.5 mt-4 space-y-4 custom-scrollbar">
					{/* Priority & Status Section */}
					<div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
						<div className="flex items-center justify-between rounded-lg border border-graphite/40 bg-onyx/60 p-3">
							<span className="text-xs text-fog font-medium">
								Tingkat Kepentingan
							</span>
							<PriorityIndicator priority={card.priority} />
						</div>
						<div className="flex items-center justify-between rounded-lg border border-graphite/40 bg-onyx/60 p-3">
							<span className="text-xs text-fog font-medium">Status Task</span>
							<span
								className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold uppercase ${
									card.status === "completed"
										? "bg-emerald/15 text-emerald border border-emerald/30"
										: card.status === "in_progress"
											? "bg-indigo/15 text-indigo border border-indigo/30"
											: card.status === "failed"
												? "bg-crimson/15 text-crimson border border-crimson/30"
												: "bg-steel/15 text-mist border border-steel/30"
								}`}
							>
								{card.status === "completed" && (
									<Icon icon={CheckmarkCircle01Icon} size={13} />
								)}
								{card.status === "in_progress" && (
									<Icon icon={PlayIcon} size={13} />
								)}
								{card.status === "failed" && (
									<Icon icon={Alert02Icon} size={13} />
								)}
								{TASK_STATUS_LABELS[card.status] ?? card.status}
							</span>
						</div>
					</div>

					{/* Description */}
					{card.description && (
						<div>
							<h4 className="text-xs font-semibold text-snow mb-1.5">
								Deskripsi
							</h4>
							<div className="text-xs text-snow/90 bg-onyx/80 p-3 rounded-lg border border-graphite/50 whitespace-pre-wrap leading-relaxed">
								{card.description}
							</div>
						</div>
					)}

					{/* Subtasks Checklist */}
					{card.type === "task" &&
						card.subtasks &&
						card.subtasks.length > 0 && (
							<div>
								<div className="flex items-center justify-between mb-2">
									<h4 className="text-xs font-semibold text-snow">Subtasks</h4>
									<span className="text-[11px] text-fog font-mono bg-onyx px-2 py-0.5 rounded border border-graphite/40">
										{card.subtaskCompleted ?? 0} / {card.subtaskCount ?? 0}{" "}
										Selesai
									</span>
								</div>
								<ul className="space-y-2 bg-onyx/60 p-3 rounded-lg border border-graphite/50 max-h-56 overflow-y-auto custom-scrollbar">
									{card.subtasks.map((sub) => (
										<li
											key={sub.name}
											className="flex items-start gap-2.5 text-xs p-1.5 rounded hover:bg-white/5 transition-colors"
										>
											<div className="mt-0.5 shrink-0">
												{sub.status === "completed" ? (
													<Icon
														icon={CheckmarkSquare02Icon}
														size={15}
														className="text-emerald"
													/>
												) : sub.status === "in_progress" ? (
													<Icon
														icon={PlayIcon}
														size={15}
														className="text-indigo animate-pulse"
													/>
												) : sub.status === "failed" ? (
													<Icon
														icon={Alert02Icon}
														size={15}
														className="text-crimson"
													/>
												) : (
													<div className="h-3.5 w-3.5 rounded-sm border border-graphite/80 bg-transparent mt-0.5" />
												)}
											</div>
											<span
												className={`leading-relaxed ${sub.status === "completed" ? "text-fog line-through" : "text-snow"}`}
											>
												{sub.name}
											</span>
										</li>
									))}
								</ul>
							</div>
						)}

					{/* Timestamps */}
					<div className="grid grid-cols-2 gap-3 text-xs">
						<div className="rounded-lg border border-graphite/50 bg-onyx/60 p-3">
							<span className="block text-[10px] text-fog uppercase tracking-wider font-semibold">
								Mulai Kerja
							</span>
							<span className="font-mono text-xs text-snow/90 flex items-center gap-1.5 mt-1.5">
								<Icon icon={Calendar01Icon} size={13} className="text-indigo" />
								{card.startedAt
									? `${formatDate(card.startedAt)} ${formatTime(card.startedAt)}`
									: "-"}
							</span>
						</div>
						<div className="rounded-lg border border-graphite/50 bg-onyx/60 p-3">
							<span className="block text-[10px] text-fog uppercase tracking-wider font-semibold">
								Selesai / Gagal
							</span>
							<span className="font-mono text-xs text-snow/90 flex items-center gap-1.5 mt-1.5">
								<Icon icon={Calendar01Icon} size={13} className="text-indigo" />
								{card.completedAt
									? `${formatDate(card.completedAt)} ${formatTime(card.completedAt)}`
									: "-"}
							</span>
						</div>
					</div>

					{/* Dependencies */}
					{card.type === "task" &&
						card.dependencies &&
						card.dependencies.length > 0 && (
							<div>
								<h4 className="text-xs font-semibold text-snow mb-1.5">
									Bergantung pada Task
								</h4>
								<ul className="space-y-1.5">
									{card.dependencies.map((depId) => (
										<li
											key={depId}
											className="text-xs text-amber font-mono bg-amber/10 px-2.5 py-1.5 rounded-md border border-amber/20 truncate"
											title={depId}
										>
											Task ID: {depId}
										</li>
									))}
								</ul>
							</div>
						)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
