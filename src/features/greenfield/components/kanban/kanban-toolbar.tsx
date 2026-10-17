"use client";

import { Check, ChevronDown, Layers } from "lucide-react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FeatureIcon } from "@/features/greenfield/components/whiteboard/whiteboard-icons";
import { cn } from "@/lib/utils";

export interface KanbanPhase {
	id: string;
	label: string;
	name: string;
}

interface KanbanToolbarProps {
	phases: KanbanPhase[];
	selectedPhase: string | null;
	selectedPhaseLabel: string;
	progress: { total: number; done: number; pct: number };
	onSelectPhase: (phase: string | null) => void;
}

/** Phase filter and scoped progress bar above the columns. */
export function KanbanToolbar({
	phases,
	selectedPhase,
	selectedPhaseLabel,
	progress,
	onSelectPhase,
}: KanbanToolbarProps) {
	const items: Array<{ id: string | null; label: string; name: string }> = [
		{ id: null, label: "Semua", name: "Semua" },
		...phases,
	];

	return (
		<div className="flex flex-col gap-3 sm:flex-row sm:items-center pt-4 pb-3 shrink-0">
			{/* Left: Phase Filter */}
			<div className="flex items-center gap-2 shrink-0">
				<span className="text-xs font-medium text-fog">Fase:</span>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<button
							type="button"
							className="inline-flex items-center justify-between gap-2 rounded-md border border-graphite bg-charcoal px-3 py-1.5 text-xs font-medium text-snow hover:border-steel hover:bg-steel/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo transition-colors cursor-pointer"
							aria-label="Filter berdasarkan fase project"
						>
							<span className="flex items-center gap-1.5 min-w-0">
								<span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center text-fog">
									{selectedPhase ? (
										<FeatureIcon label={selectedPhase} size={13} />
									) : (
										<Layers size={13} aria-hidden="true" />
									)}
								</span>
								<span
									className="max-w-[150px] sm:max-w-[190px] truncate"
									title={selectedPhaseLabel}
								>
									{selectedPhaseLabel}
								</span>
							</span>
							<ChevronDown
								size={13}
								className="text-fog shrink-0"
								aria-hidden="true"
							/>
						</button>
					</DropdownMenuTrigger>
					<DropdownMenuContent
						align="start"
						className="w-56 sm:w-64 max-h-72 overflow-y-auto custom-scrollbar p-1"
					>
						{items.map((item) => {
							const isSelected = selectedPhase === item.id;
							return (
								<DropdownMenuItem
									key={item.id ?? "all"}
									onClick={() => onSelectPhase(item.id)}
									className={cn(
										"flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs rounded cursor-pointer transition-colors",
										isSelected
											? "bg-steel/15 text-snow font-semibold dark:bg-steel/25"
											: "text-mist hover:text-snow hover:bg-steel/10",
									)}
								>
									<div className="flex items-center gap-2 min-w-0 flex-1">
										<span className="flex h-4 w-4 shrink-0 items-center justify-center text-fog">
											{item.id === null ? (
												<Layers size={13} aria-hidden="true" />
											) : (
												<FeatureIcon label={item.name} size={13} />
											)}
										</span>
										<span className="truncate" title={item.label}>
											{item.label}
										</span>
									</div>
									{isSelected && (
										<Check
											size={13}
											className="text-snow shrink-0 ml-auto"
											aria-hidden="true"
										/>
									)}
								</DropdownMenuItem>
							);
						})}
					</DropdownMenuContent>
				</DropdownMenu>
			</div>

			{/* Right: Progress info & bar spanning remaining horizontal space */}
			<div className="flex-1 flex items-center gap-3 sm:ml-4 min-w-0">
				<div
					className="flex-1 min-w-[100px] h-2 rounded-full bg-steel/30 dark:bg-steel/40 overflow-hidden"
					role="progressbar"
					aria-valuenow={progress.pct}
					aria-valuemin={0}
					aria-valuemax={100}
					aria-label="Progress penyelesaian task"
				>
					<div
						className="h-full rounded-full bg-indigo transition-all duration-500 ease-out"
						style={{ width: `${progress.pct}%` }}
					/>
				</div>
				<span className="shrink-0 text-xs text-fog font-mono tabular-nums whitespace-nowrap">
					{progress.done}/{progress.total} task selesai ({progress.pct}%)
				</span>
			</div>
		</div>
	);
}
