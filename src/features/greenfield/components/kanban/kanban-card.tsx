"use client";

import {
	ArrowRight01Icon,
	CheckmarkSquare02Icon,
} from "@hugeicons/core-free-icons";
import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import type { TaskCard } from "@/features/greenfield/hooks/use-kanban-polling";
import { TaskDetailDialog } from "./task-detail-dialog";

export { PriorityIndicator } from "./priority-indicator";

export interface KanbanCardProps {
	card: TaskCard;
	colorIndex: number;
	highlighted?: boolean;
}

export function KanbanCard({
	card,
	colorIndex: _colorIndex,
	highlighted = false,
}: KanbanCardProps) {
	const [isOpen, setIsOpen] = useState(false);

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
		<>
			<article
				data-testid="codebase-kanban-card"
				className="flex w-full flex-col"
			>
				<button
					type="button"
					data-testid="kanban-card"
					onClick={() => setIsOpen(true)}
					aria-label={`Detail task: ${card.name}`}
					className={`group relative flex w-full cursor-pointer flex-col rounded-lg border border-graphite bg-obsidian p-3 text-left shadow-sm transition-all duration-200 hover:border-steel hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo ${
						highlighted ? "ring-2 ring-amber animate-flash" : ""
					}`}
				>
					<p className="w-full font-inter text-sm font-[510] leading-snug text-snow [overflow-wrap:anywhere]">
						{card.name}
					</p>

					{card.description && (
						<p className="mt-1 line-clamp-2 text-xs text-fog [overflow-wrap:anywhere]">
							{card.description}
						</p>
					)}

					<div className="mt-3 flex min-w-0 flex-wrap items-center gap-2">
						{/* Feature Badge */}
						<span className="inline-flex min-w-0 max-w-full items-center gap-1 truncate rounded-md border border-graphite/40 bg-white/5 px-2 py-0.5 text-[10px] text-mist">
							{card.featureName}
						</span>

						{/* Subtasks Count */}
						{card.type === "task" &&
						typeof card.subtaskCount === "number" &&
						card.subtaskCount > 0 ? (
							<span className="inline-flex items-center gap-1 text-[10px] text-fog">
								<Icon icon={CheckmarkSquare02Icon} size={10} />
								{card.subtaskCompleted ?? 0}/{card.subtaskCount} subtask
							</span>
						) : null}

						{/* Dependencies Badge */}
						{card.type === "task" &&
							card.dependencies &&
							card.dependencies.length > 0 && (
								<span className="inline-flex items-center gap-1 text-[10px] text-amber/80">
									<Icon icon={ArrowRight01Icon} size={10} />
									dep: {card.dependencies.length}
								</span>
							)}
					</div>

					{/* Timestamps */}
					{(card.startedAt || card.completedAt) && (
						<div className="mt-2.5 flex w-full items-center justify-between border-t border-graphite/40 pt-2 text-[10px] text-fog/60">
							{card.status === "in_progress" && card.startedAt && (
								<span>Mulai: {formatTime(card.startedAt)}</span>
							)}
							{(card.status === "completed" || card.status === "failed") &&
								card.completedAt && (
									<span>
										Selesai: {formatDate(card.completedAt)}{" "}
										{formatTime(card.completedAt)}
									</span>
								)}
						</div>
					)}
				</button>
			</article>

			<TaskDetailDialog card={card} open={isOpen} onOpenChange={setIsOpen} />
		</>
	);
}
