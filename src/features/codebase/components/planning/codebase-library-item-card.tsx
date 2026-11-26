"use client";

import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { Link } from "@tanstack/react-router";
import { Icon } from "@/components/ui/icon";
import { ProjectActionsMenu } from "@/features/codebase/components/planning/project-actions-menu";
import {
	CODEBASE_LIBRARY_STATUS_LABELS,
	type CodebaseLibraryItem,
	libraryAnalysisLabels,
	NEW_REPOSITORY_HREF,
	resolveLibraryItemAction,
	resolveLibraryItemStatus,
} from "@/features/codebase/services/library";
import { RESUME_REPOSITORY_SEARCH } from "@/features/codebase/services/onboarding-intent";
import {
	clearPlanCodebaseProjectPointer,
	storePlanCodebasePointer,
	storePlanCodebaseProjectPointer,
	storePlanCodebaseStepPointer,
} from "@/features/codebase/services/plan-storage";

export const METADATA_SEPARATOR = " | ";

export function formatLibraryDate(value: string | null): string | null {
	if (!value) return null;
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return null;
	return new Intl.DateTimeFormat("id-ID", {
		day: "numeric",
		month: "short",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	}).format(date);
}

export function formatLibraryMetadata(
	item: Pick<CodebaseLibraryItem, "fileCount" | "planCount">,
	displayDate: string | null,
): string[] {
	return [
		item.fileCount !== null ? `${item.fileCount} file` : null,
		item.planCount > 0 ? `${item.planCount} rencana fitur` : null,
		displayDate ? `Diperbarui ${displayDate}` : null,
	].filter((part): part is string => part !== null && part.trim().length > 0);
}

/**
 * Point the onboarding flow at THIS repository before opening it, so recovery
 * resumes the existing codebase and anchor project instead of creating new
 * records.
 */
function beginRecoveryNavigation(item: CodebaseLibraryItem) {
	storePlanCodebasePointer(item.id, item.name);
	if (item.onboardingProjectId) {
		storePlanCodebaseProjectPointer(item.onboardingProjectId);
	} else {
		clearPlanCodebaseProjectPointer();
	}
	storePlanCodebaseStepPointer("sync");
}

export function CodebaseLibraryItemCard({
	item,
	selected,
	selectionActive,
	onToggleSelect,
	onRename,
	onDelete,
}: {
	item: CodebaseLibraryItem;
	selected: boolean;
	selectionActive: boolean;
	onToggleSelect: (id: string) => void;
	onRename: (id: string, name: string) => void;
	onDelete: (item: CodebaseLibraryItem) => Promise<void>;
}) {
	const stack = libraryAnalysisLabels(item);
	const displayDate =
		formatLibraryDate(item.snapshotCreatedAt) ??
		formatLibraryDate(item.updatedAt);
	const statusKey = resolveLibraryItemStatus(item);
	const status = CODEBASE_LIBRARY_STATUS_LABELS[statusKey];
	const action = resolveLibraryItemAction(item);
	const isAttention = statusKey === "needs_analysis";
	const isActionableStatus = statusKey !== "ready";
	const metaParts = formatLibraryMetadata(item, displayDate);
	const cardClassName =
		"flex min-w-0 flex-1 flex-col gap-2 rounded-xl p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo";

	const cardBody = (
		<>
			<span className="flex items-center justify-between gap-3">
				<span className="truncate text-base font-medium text-snow">
					{item.name}
				</span>
				{isActionableStatus ? (
					<span
						className={`shrink-0 text-xs ${isAttention ? "text-crimson" : "text-fog"}`}
					>
						{status}
					</span>
				) : null}
			</span>
			{item.summary ? (
				<span className="line-clamp-2 text-sm leading-6 text-fog">
					{item.summary}
				</span>
			) : null}
			{stack.length > 0 ? (
				<span className="text-xs text-slate">
					{stack.join(METADATA_SEPARATOR)}
				</span>
			) : null}
			{metaParts.length > 0 ? (
				<span className="text-[11px] text-slate">
					{metaParts.join(METADATA_SEPARATOR)}
				</span>
			) : null}
			{selectionActive ? null : (
				<span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-snow">
					{action.label}
					<Icon
						icon={ArrowRight01Icon}
						size={14}
						aria-hidden
						className="transition-transform group-hover:translate-x-0.5"
					/>
				</span>
			)}
		</>
	);

	return (
		<li
			className={`group flex items-stretch gap-1 rounded-xl border bg-charcoal/60 transition-colors hover:bg-charcoal ${
				selected ? "border-fog/40" : "border-graphite hover:border-fog/40"
			}`}
		>
			{selectionActive ? (
				<label className="flex shrink-0 cursor-pointer items-center pl-4 self-stretch">
					<input
						type="checkbox"
						checked={selected}
						onChange={() => onToggleSelect(item.id)}
						aria-label={`Pilih repository ${item.name}`}
						className="size-4 cursor-pointer accent-snow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
					/>
				</label>
			) : null}
			{selectionActive ? (
				<button
					type="button"
					onClick={() => onToggleSelect(item.id)}
					className={`${cardClassName} text-left`}
				>
					{cardBody}
				</button>
			) : action.recovery ? (
				<Link
					to={NEW_REPOSITORY_HREF}
					search={RESUME_REPOSITORY_SEARCH}
					onClick={() => beginRecoveryNavigation(item)}
					className={cardClassName}
				>
					{cardBody}
				</Link>
			) : (
				<Link
					to="/codebases/$id"
					params={{ id: item.id }}
					className={cardClassName}
				>
					{cardBody}
				</Link>
			)}
			{selectionActive ? null : (
				<ProjectActionsMenu
					item={item}
					onRename={onRename}
					onDelete={onDelete}
					onSelect={onToggleSelect}
				/>
			)}
		</li>
	);
}
