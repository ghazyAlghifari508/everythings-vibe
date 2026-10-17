"use client";

import type { TaskCard } from "@/hooks/use-kanban-polling";
import { CodebaseKanbanCard } from "./codebase-kanban-board-card";

export interface ColumnSpec {
	key: string;
	title: string;
	cards: TaskCard[];
	highlightInProgress?: boolean;
}

export function CodebaseKanbanColumn({
	title,
	cards,
	highlightInProgress,
}: ColumnSpec) {
	return (
		<section
			data-testid={`codebase-kanban-col-${title}`}
			className="flex min-h-[220px] w-56 shrink-0 flex-col rounded-lg border border-graphite bg-obsidian"
		>
			<div className="flex items-center justify-between border-b border-graphite px-3 py-2">
				<h3 className="text-[11.5px] font-semibold text-mist">{title}</h3>
				<span className="rounded bg-charcoal px-1.5 py-px font-mono text-[10px] text-fog">
					{cards.length}
				</span>
			</div>
			<div className="flex flex-1 flex-col gap-2 p-2.5">
				{cards.length === 0 ? (
					<p className="text-[11px] leading-4 text-slate">Kosong</p>
				) : (
					cards.map((card) => (
						<CodebaseKanbanCard
							key={card.id}
							card={card}
							highlightInProgress={highlightInProgress}
						/>
					))
				)}
			</div>
		</section>
	);
}
