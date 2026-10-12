"use client";

import { Check, Layers } from "lucide-react";
import { useState } from "react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ActivePlanCandidate } from "@/lib/codebase-active-plan";

function formatPlanDate(value: string | null): string | null {
	if (!value) return null;
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return null;
	return new Intl.DateTimeFormat("id-ID", {
		day: "numeric",
		month: "short",
		year: "numeric",
	}).format(date);
}

/**
 * Switch between the feature plans of one repository.
 *
 * A codebase holds many independent plans, so the workspace needs a way to see
 * them and move between them. Each entry states whether the plan already holds
 * planning, because that is what tells a real plan apart from one that was
 * created and never used. Selecting a plan is a navigation choice: the parent
 * drops the previous plan's loaded artifacts and rehydrates from the server, so
 * nothing from one plan can be shown as another's.
 */
export function CodebasePlanSwitcher({
	plans,
	activePlanId,
	onSelectPlan,
}: {
	plans: readonly ActivePlanCandidate[];
	activePlanId: string | null;
	onSelectPlan: (projectId: string) => void;
}) {
	const [open, setOpen] = useState(false);
	const withPlanning = plans.filter((plan) => plan.hasArtifacts).length;

	return (
		<DropdownMenu open={open} onOpenChange={setOpen}>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					data-testid="codebase-plan-switcher"
					aria-label="Pilih fitur plan"
					className="inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-md border border-graphite bg-obsidian px-2 text-[11px] text-fog transition hover:text-snow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
				>
					<Layers size={12} aria-hidden />
					<span className="font-mono">
						{plans.length} fitur
						{withPlanning > 0 ? ` · ${withPlanning} berisi` : ""}
					</span>
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-72">
				<DropdownMenuLabel>Fitur di repository ini</DropdownMenuLabel>
				<DropdownMenuSeparator />
				{plans.map((plan) => {
					const isActive = plan.id === activePlanId;
					const updated = formatPlanDate(plan.updatedAt);
					return (
						<DropdownMenuItem
							key={plan.id}
							data-testid={`codebase-plan-option-${plan.id}`}
							onSelect={() => {
								if (!isActive) onSelectPlan(plan.id);
							}}
							className="flex items-start justify-between gap-2"
						>
							<span className="flex min-w-0 flex-col gap-0.5">
								<span className="truncate text-[13px] text-snow">
									{plan.name}
								</span>
								<span className="text-[10.5px] text-slate">
									{plan.hasArtifacts
										? `Sudah ada planning${updated ? ` · ${updated}` : ""}`
										: "Belum ada planning"}
								</span>
							</span>
							{isActive ? (
								<Check
									size={13}
									aria-hidden
									className="mt-0.5 shrink-0 text-emerald"
								/>
							) : null}
						</DropdownMenuItem>
					);
				})}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

export { formatPlanDate };
