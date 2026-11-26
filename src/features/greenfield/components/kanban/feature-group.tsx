"use client";

import type { TaskCard } from "@/features/greenfield/hooks/use-kanban-polling";
import { KanbanCard } from "./kanban-card";

interface FeatureGroupProps {
	featureName: string;
	cards: TaskCard[];
	colorIndex: number;
	highlightedCardId?: string | null;
}

const ACCENT_COLORS = [
	"bg-indigo",
	"bg-emerald",
	"bg-amber",
	"bg-crimson",
	"bg-steel",
];

export function FeatureGroup({
	featureName,
	cards,
	colorIndex,
	highlightedCardId,
}: FeatureGroupProps) {
	const idx = colorIndex % ACCENT_COLORS.length;
	const accentClass = ACCENT_COLORS[idx];

	return (
		<div className="flex flex-col gap-2 rounded-lg border border-graphite/40 bg-onyx/50 p-2.5">
			{/* Feature Group Header */}
			<div className="flex min-w-0 items-center gap-2 px-1.5 py-0.5">
				<div className={`h-3 w-1 shrink-0 rounded-sm ${accentClass}`} />
				<span className="min-w-0 truncate font-inter text-xs font-semibold text-fog/95">
					{featureName}
				</span>
				<span className="ml-auto shrink-0 rounded-full bg-white/5 px-1.5 py-0.2 text-[9px] text-fog/50">
					{cards.length}
				</span>
			</div>

			{/* Cards List */}
			<div className="flex flex-col gap-2.5">
				{cards.map((card) => (
					<KanbanCard
						key={card.id}
						card={card}
						colorIndex={colorIndex}
						highlighted={highlightedCardId === card.id}
					/>
				))}
			</div>
		</div>
	);
}
