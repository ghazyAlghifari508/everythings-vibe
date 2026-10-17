"use client";

import type { TaskCard } from "@/hooks/use-kanban-polling";

export function CodebaseKanbanCard({
	card,
	highlightInProgress,
}: {
	card: TaskCard;
	highlightInProgress?: boolean;
}) {
	return (
		<article
			data-testid="codebase-kanban-card"
			className={`flex flex-col gap-1.5 rounded-md border bg-charcoal p-2.5 ${
				highlightInProgress ? "border-indigo/40 bg-indigo/5" : "border-graphite"
			}`}
		>
			<span className="w-fit max-w-full truncate rounded border border-graphite bg-obsidian px-1 py-px font-mono text-[9.5px] uppercase text-fog">
				{card.featureName}
			</span>
			<p className="text-xs font-semibold leading-5 text-snow">{card.name}</p>
			{highlightInProgress ? (
				<span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-indigo">
					<span
						aria-hidden="true"
						className="h-1.5 w-1.5 animate-pulse rounded-full bg-indigo motion-reduce:animate-none"
					/>
					Agent coding...
				</span>
			) : null}
			<span className="font-mono text-[10px] text-fog">
				{typeof card.subtaskCompleted === "number" &&
				typeof card.subtaskCount === "number"
					? `${card.subtaskCompleted}/${card.subtaskCount} subtask`
					: card.status}
			</span>
		</article>
	);
}
