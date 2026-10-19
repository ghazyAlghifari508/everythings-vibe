"use client";

import {
	Add01Icon,
	ArrowDown01Icon,
	Layers01Icon,
	Tick01Icon,
} from "@hugeicons/core-free-icons";
import { useState } from "react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import {
	type ActivePlanCandidate,
	describePlanReadiness,
} from "@/features/codebase/services/active-plan";

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
 * Switch between the user-facing feature plans of one repository.
 *
 * The trigger names the active plan, so the workspace always says which
 * feature is on screen. Each entry states its real artifact readiness,
 * because that is what tells a finished plan apart from a resumable draft.
 * The onboarding anchor never reaches this list: the caller filters it with
 * `selectUserFacingPlans`, so repository analysis context cannot pose as a
 * feature plan. Selecting a plan is a navigation choice: the parent drops the
 * previous plan's loaded artifacts and rehydrates from the server, so nothing
 * from one plan can be shown as another's. Creating a plan is an explicit
 * action of its own, never a side effect of sending a message.
 */
export function CodebasePlanSwitcher({
	plans,
	activePlanId,
	activePlanName,
	onSelectPlan,
	onCreateFeature,
}: {
	plans: readonly ActivePlanCandidate[];
	activePlanId: string | null;
	activePlanName: string | null;
	onSelectPlan: (projectId: string) => void;
	onCreateFeature: () => void;
}) {
	const [open, setOpen] = useState(false);

	return (
		<DropdownMenu open={open} onOpenChange={setOpen}>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					data-testid="codebase-plan-switcher"
					aria-label="Pilih fitur plan"
					aria-haspopup="menu"
					className="inline-flex min-h-8 max-w-44 shrink-0 items-center gap-1.5 rounded-md border border-graphite bg-obsidian px-2 text-[11px] text-fog transition hover:text-snow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
				>
					<Icon
						icon={Layers01Icon}
						size={12}
						aria-hidden
						className="shrink-0"
					/>
					<span className="truncate font-medium text-snow">
						{activePlanName ?? "Pilih fitur"}
					</span>
					<Icon
						icon={ArrowDown01Icon}
						size={12}
						aria-hidden
						className="shrink-0"
					/>
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-72">
				<DropdownMenuLabel className="text-[11px] font-semibold uppercase tracking-wider">
					Fitur repository
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
				{plans.map((plan) => {
					const isActive = plan.id === activePlanId;
					const updated = formatPlanDate(plan.updatedAt);
					const readiness = describePlanReadiness(plan);
					const status =
						plan.hasArtifacts && updated
							? `${readiness} · ${updated}`
							: readiness;
					return (
						<DropdownMenuItem
							key={plan.id}
							data-testid={`codebase-plan-option-${plan.id}`}
							aria-current={isActive ? "true" : undefined}
							onSelect={() => {
								if (!isActive) onSelectPlan(plan.id);
							}}
							className="flex items-start justify-between gap-2"
						>
							<span className="flex min-w-0 flex-col gap-0.5">
								<span className="truncate text-[13px] text-snow">
									{plan.name}
								</span>
								<span className="text-[10.5px] text-slate">{status}</span>
							</span>
							{isActive ? (
								<Icon
									icon={Tick01Icon}
									size={13}
									aria-hidden
									className="mt-0.5 shrink-0 text-emerald"
								/>
							) : null}
						</DropdownMenuItem>
					);
				})}
				<DropdownMenuSeparator />
				<DropdownMenuItem
					data-testid="codebase-plan-create-new"
					onSelect={() => onCreateFeature()}
					className="flex items-center gap-2"
				>
					<Icon
						icon={Add01Icon}
						size={13}
						aria-hidden
						className="shrink-0 text-fog"
					/>
					<span className="text-[13px] font-medium text-snow">
						Buat fitur baru
					</span>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

export { formatPlanDate };
