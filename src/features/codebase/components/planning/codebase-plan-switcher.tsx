"use client";

import {
	Add01Icon,
	ArrowDown01Icon,
	Layers01Icon,
	SearchIcon,
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
import { Input } from "@/components/ui/input";
import {
	type ActivePlanCandidate,
	describePlanReadiness,
} from "@/features/codebase/services/active-plan";
import { CodebasePlanRow } from "./codebase-plan-row";

export function CodebasePlanSwitcher({
	plans,
	archivedPlans = [],
	activePlanId,
	activePlanName,
	onSelectPlan,
	onCreateFeature,
	onRename,
	onArchive,
	onDelete,
}: {
	plans: readonly ActivePlanCandidate[];
	/** Archived features, shown collapsed so they stay recoverable. */
	archivedPlans?: readonly ActivePlanCandidate[];
	activePlanId: string | null;
	activePlanName: string | null;
	onSelectPlan: (projectId: string) => void;
	onCreateFeature: () => void;
	onRename?: (plan: ActivePlanCandidate) => void;
	onArchive?: (plan: ActivePlanCandidate) => void;
	onDelete?: (plan: ActivePlanCandidate) => void;
}) {
	const [open, setOpen] = useState(false);
	const [showArchived, setShowArchived] = useState(false);
	const [query, setQuery] = useState("");
	const normalized = query.trim().toLowerCase();
	const filtered = normalized
		? plans.filter((plan) => plan.name.toLowerCase().includes(normalized))
		: plans;
	const filteredArchived = normalized
		? archivedPlans.filter((plan) =>
				plan.name.toLowerCase().includes(normalized),
			)
		: archivedPlans;

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
			<DropdownMenuContent
				align="start"
				className="w-80 overflow-hidden"
				onCloseAutoFocus={(event) => event.preventDefault()}
			>
				<DropdownMenuLabel className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider">
					<span>Fitur repository</span>
					<span className="text-slate">{plans.length} fitur</span>
				</DropdownMenuLabel>
				<div className="px-2 pb-1.5">
					<div className="relative">
						<Icon
							icon={SearchIcon}
							size={14}
							aria-hidden
							className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate"
						/>
						<Input
							data-testid="codebase-plan-search"
							aria-label="Cari fitur"
							placeholder="Cari fitur..."
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							className="h-8 bg-charcoal pl-8 text-[12px]"
						/>
					</div>
				</div>
				<DropdownMenuSeparator />
				{/* Bounded scroll region: the list never grows past max-h, so a
				    repository with many features can't push the create action or
				    the create action off-screen. */}
				<div
					data-testid="codebase-plan-list"
					className="max-h-64 overflow-y-auto py-1"
				>
					{filtered.length === 0 ? (
						<p
							data-testid="codebase-plan-empty"
							className="px-3 py-4 text-center text-[11px] text-slate"
						>
							{normalized ? "Tidak ada fitur yang cocok." : "Belum ada fitur."}
						</p>
					) : (
						filtered.map((plan) => {
							const isActive = plan.id === activePlanId;
							return (
								<CodebasePlanRow
									key={plan.id}
									plan={plan}
									isActive={isActive}
									onSelect={() => {
										setOpen(false);
										if (!isActive) onSelectPlan(plan.id);
									}}
									onRename={onRename ? () => onRename(plan) : undefined}
									onArchive={onArchive ? () => onArchive(plan) : undefined}
									onDelete={onDelete ? () => onDelete(plan) : undefined}
								/>
							);
						})
					)}
				</div>
				{archivedPlans.length > 0 ? (
					<>
						<DropdownMenuSeparator />
						<DropdownMenuItem
							data-testid="codebase-plan-toggle-archived"
							onSelect={() => setShowArchived((current) => !current)}
							className="flex items-center justify-between text-[11px] text-slate"
						>
							<span>Diarsipkan</span>
							<span>{archivedPlans.length}</span>
						</DropdownMenuItem>
						{showArchived ? (
							<div
								data-testid="codebase-plan-archived-list"
								className="max-h-40 overflow-y-auto py-1"
							>
								{filteredArchived.length === 0 ? (
									<p className="px-3 py-3 text-center text-[11px] text-slate">
										Tidak ada fitur arsip yang cocok.
									</p>
								) : (
									filteredArchived.map((plan) => (
										<CodebasePlanRow
											key={plan.id}
											plan={plan}
											isActive={plan.id === activePlanId}
											onSelect={() => {
												setOpen(false);
												onSelectPlan(plan.id);
											}}
											onRename={onRename ? () => onRename(plan) : undefined}
											onArchive={onArchive ? () => onArchive(plan) : undefined}
											onDelete={onDelete ? () => onDelete(plan) : undefined}
										/>
									))
								)}
							</div>
						) : null}
					</>
				) : null}
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

export { describePlanReadiness };
