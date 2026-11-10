"use client";

import { KanbanCard } from "@/features/greenfield/components/kanban/kanban-card";
import type { TaskCard } from "@/features/greenfield/hooks/use-kanban-polling";

export interface CodebaseKanbanCardProps {
	card: TaskCard;
	colorIndex?: number;
	highlighted?: boolean;
	highlightInProgress?: boolean;
}

export function CodebaseKanbanCard({
	card,
	colorIndex = 0,
	highlighted = false,
}: CodebaseKanbanCardProps) {
	return (
		<KanbanCard card={card} colorIndex={colorIndex} highlighted={highlighted} />
	);
}
