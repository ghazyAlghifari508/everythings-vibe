"use client";

import { FeatureGroup } from "@/features/greenfield/components/kanban/feature-group";
import type { TaskCard } from "@/features/greenfield/hooks/use-kanban-polling";
import { groupCardsByFeature } from "@/lib/kanban-utils";

export interface ColumnSpec {
	key: string;
	title: string;
	cards: TaskCard[];
	highlightInProgress?: boolean;
	highlightedCardId?: string | null;
}

export function CodebaseKanbanColumn({
	title,
	cards,
	highlightedCardId,
}: ColumnSpec) {
	const featureGroups = groupCardsByFeature(cards);
	const featuresList = Object.keys(featureGroups);

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
			<div className="flex flex-1 flex-col gap-2 p-2.5 overflow-y-auto">
				{featuresList.length === 0 ? (
					<p className="text-[11px] leading-4 text-slate">Kosong</p>
				) : (
					featuresList.map((featureName, idx) => (
						<FeatureGroup
							key={featureName}
							featureName={featureName}
							cards={featureGroups[featureName]}
							colorIndex={idx}
							highlightedCardId={highlightedCardId}
						/>
					))
				)}
			</div>
		</section>
	);
}
