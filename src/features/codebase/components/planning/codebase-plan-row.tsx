"use client";

import {
	ArchiveIcon,
	ArchiveRestoreIcon,
	Delete02Icon,
	Edit02Icon,
	MoreVerticalIcon,
	Tick01Icon,
} from "@hugeicons/core-free-icons";
import {
	DropdownMenuItem,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import {
	type ActivePlanCandidate,
	describePlanReadiness,
} from "@/features/codebase/services/active-plan";

/**
 * User-facing progress line for one plan row.
 *
 * Task progress leads when the plan carries tasks, because "12 task · 4
 * selesai" says more about where the work stands than a list of artifact
 * abbreviations. Otherwise the real artifact readiness is shown, and an
 * artifact-less plan reads as the resumable draft it is. No technical ids,
 * decorative dots, or timestamps.
 */
export function describePlanMeta(plan: ActivePlanCandidate): string {
	const total = plan.taskTotal ?? 0;
	if (total > 0) {
		const done = plan.taskCompleted ?? 0;
		return `${total} task · ${done} selesai`;
	}
	return describePlanReadiness(plan);
}

/**
 * One feature-plan row in the switcher.
 *
 * The row body is a `DropdownMenuItem` so the outer menu's built-in selection
 * and keyboard handling select the plan. The `⋯` management actions are a
 * native `DropdownMenuSub` (not a second top-level dropdown), so opening them
 * shares the same layer and never trips the parent menu's outside-dismiss.
 * Management entries render only when the caller supplies a handler, so a
 * read-only usage shows no dead affordance.
 */
export function CodebasePlanRow({
	plan,
	isActive,
	onSelect,
	onRename,
	onArchive,
	onDelete,
}: {
	plan: ActivePlanCandidate;
	isActive: boolean;
	onSelect: () => void;
	onRename?: () => void;
	onArchive?: () => void;
	onDelete?: () => void;
}) {
	const hasActions = Boolean(onRename || onArchive || onDelete);
	return (
		<div className="flex items-center gap-0.5 pr-1">
			<DropdownMenuItem
				data-testid={`codebase-plan-option-${plan.id}`}
				aria-current={isActive ? "true" : undefined}
				onSelect={() => onSelect()}
				className="flex min-w-0 flex-1 items-start justify-between gap-2"
			>
				<span className="flex min-w-0 flex-col gap-0.5">
					<span className="truncate text-[13px] text-snow">{plan.name}</span>
					<span className="text-[10.5px] text-slate">
						{describePlanMeta(plan)}
					</span>
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
			{hasActions ? (
				<DropdownMenuSub>
					<DropdownMenuSubTrigger
						hideArrow
						data-testid={`codebase-plan-actions-${plan.id}`}
						aria-label={`Kelola fitur ${plan.name}`}
						className="p-1 hover:bg-white/5 data-[state=open]:bg-white/5"
					>
						<Icon icon={MoreVerticalIcon} size={14} aria-hidden />
					</DropdownMenuSubTrigger>
					<DropdownMenuSubContent className="w-44" align="end">
						{onRename ? (
							<DropdownMenuItem
								data-testid={`codebase-plan-rename-${plan.id}`}
								onSelect={() => onRename()}
							>
								<Icon
									icon={Edit02Icon}
									size={14}
									aria-hidden
									className="mr-2 text-fog"
								/>
								Ubah nama
							</DropdownMenuItem>
						) : null}
						{onArchive ? (
							<DropdownMenuItem
								data-testid={`codebase-plan-archive-${plan.id}`}
								onSelect={() => onArchive()}
							>
								<Icon
									icon={plan.archivedAt ? ArchiveRestoreIcon : ArchiveIcon}
									size={14}
									aria-hidden
									className="mr-2 text-fog"
								/>
								{plan.archivedAt ? "Batalkan arsip" : "Arsipkan"}
							</DropdownMenuItem>
						) : null}
						{onDelete ? (
							<DropdownMenuItem
								data-testid={`codebase-plan-delete-${plan.id}`}
								onSelect={() => onDelete()}
								className="text-crimson focus:text-crimson"
							>
								<Icon
									icon={Delete02Icon}
									size={14}
									aria-hidden
									className="mr-2"
								/>
								Hapus fitur
							</DropdownMenuItem>
						) : null}
					</DropdownMenuSubContent>
				</DropdownMenuSub>
			) : null}
		</div>
	);
}
