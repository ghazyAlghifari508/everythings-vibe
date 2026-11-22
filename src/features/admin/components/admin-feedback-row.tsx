"use client";

import {
	ArrowDown01Icon,
	BubbleChatIcon,
	Bug02Icon,
	SparklesIcon,
} from "@hugeicons/core-free-icons";
import { Badge } from "@/components/ui/badge";
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
	type StatusIconName,
	StatusIndicator,
	type StatusTone,
	statusIcons,
} from "@/components/ui/status-indicator";
import type {
	AdminErrorReportItem,
	AdminFeedbackItem,
	FeedbackHandlingStatus,
} from "../types";

export interface AdminFeedbackRowItemProps {
	feedback: AdminFeedbackItem;
	isMutating?: boolean;
	onStatusChange?: (
		id: string,
		status: FeedbackHandlingStatus,
	) => Promise<void>;
	onArchiveChange?: (id: string, archived: boolean) => Promise<void>;
}

export function AdminFeedbackRowItem({
	feedback: f,
	isMutating = false,
	onStatusChange,
	onArchiveChange,
}: AdminFeedbackRowItemProps) {
	const type = f.type ?? "general";
	const status = f.handlingStatus ?? "new";
	const isArchived = Boolean(f.archivedAt);

	return (
		<tr className="transition-colors hover:bg-white/[0.02]">
			<td className="px-4 py-3 whitespace-nowrap">
				<Badge variant="secondary">
					<Icon
						icon={
							type === "bug"
								? Bug02Icon
								: type === "feature"
									? SparklesIcon
									: BubbleChatIcon
						}
						size={11}
					/>
					{type}
				</Badge>
			</td>

			<td className="px-4 py-3">
				<p className="font-normal text-snow whitespace-pre-wrap max-w-xl">
					{f.message}
				</p>
			</td>

			<td className="px-4 py-3 whitespace-nowrap">
				<p className="font-[510] text-snow">{f.userName || "Tanpa Nama"}</p>
				<p className="text-[11px] text-fog">{f.userEmail || "Anonymous"}</p>
			</td>

			<td className="px-4 py-3 whitespace-nowrap">
				<StatusBadge status={status} isArchived={isArchived} />
			</td>

			<td className="px-4 py-3 text-center whitespace-nowrap">
				<RowActionMenu
					id={f.id}
					status={status}
					isArchived={isArchived}
					isMutating={isMutating}
					onStatusChange={onStatusChange}
					onArchiveChange={onArchiveChange}
				/>
			</td>

			<td className="px-4 py-3 text-right text-fog whitespace-nowrap">
				{f.createdAt
					? new Date(f.createdAt).toLocaleDateString("id-ID", {
							day: "numeric",
							month: "short",
							year: "numeric",
							hour: "2-digit",
							minute: "2-digit",
						})
					: "-"}
			</td>
		</tr>
	);
}

export interface AdminErrorReportRowItemProps {
	error: AdminErrorReportItem;
	isMutating?: boolean;
	onStatusChange?: (
		id: string,
		status: FeedbackHandlingStatus,
	) => Promise<void>;
	onArchiveChange?: (id: string, archived: boolean) => Promise<void>;
}

export function AdminErrorReportRowItem({
	error: e,
	isMutating = false,
	onStatusChange,
	onArchiveChange,
}: AdminErrorReportRowItemProps) {
	const status = e.handlingStatus ?? "new";
	const isArchived = Boolean(e.archivedAt);

	return (
		<tr className="transition-colors hover:bg-white/[0.02]">
			<td className="px-4 py-3 font-mono text-rose-300 max-w-xs truncate">
				{e.errorMessage}
			</td>
			<td className="px-4 py-3 font-mono text-fog max-w-md truncate">
				{e.context || "-"}
			</td>
			<td className="px-4 py-3 text-fog whitespace-nowrap">
				<p className="font-[510] text-snow">{e.userName || "-"}</p>
				<p className="text-[11px] text-fog">{e.userEmail || "-"}</p>
			</td>
			<td className="px-4 py-3 whitespace-nowrap">
				<StatusBadge status={status} isArchived={isArchived} />
			</td>
			<td className="px-4 py-3 text-center whitespace-nowrap">
				<RowActionMenu
					id={e.id}
					status={status}
					isArchived={isArchived}
					isMutating={isMutating}
					onStatusChange={onStatusChange}
					onArchiveChange={onArchiveChange}
				/>
			</td>
			<td className="px-4 py-3 text-right text-fog whitespace-nowrap">
				{e.createdAt
					? new Date(e.createdAt).toLocaleDateString("id-ID", {
							day: "numeric",
							month: "short",
							year: "numeric",
							hour: "2-digit",
							minute: "2-digit",
						})
					: "-"}
			</td>
		</tr>
	);
}

const statusPresentation: Record<
	FeedbackHandlingStatus | "archived",
	{ label: string; tone: StatusTone; icon: StatusIconName }
> = {
	new: { label: "Baru", tone: "neutral", icon: "neutral" },
	in_progress: { label: "Diproses", tone: "warning", icon: "processing" },
	resolved: { label: "Selesai", tone: "success", icon: "success" },
	archived: { label: "Diarsipkan", tone: "neutral", icon: "neutral" },
};

function StatusBadge({
	status = "new",
	isArchived = false,
}: {
	status?: FeedbackHandlingStatus;
	isArchived?: boolean;
}) {
	const presentation = statusPresentation[isArchived ? "archived" : status];
	return (
		<StatusIndicator
			tone={presentation.tone}
			icon={statusIcons[presentation.icon]}
		>
			{presentation.label}
		</StatusIndicator>
	);
}

function RowActionMenu({
	id,
	status = "new",
	isArchived = false,
	isMutating = false,
	onStatusChange,
	onArchiveChange,
}: {
	id: string;
	status?: FeedbackHandlingStatus;
	isArchived?: boolean;
	isMutating?: boolean;
	onStatusChange?: (
		id: string,
		status: FeedbackHandlingStatus,
	) => Promise<void>;
	onArchiveChange?: (id: string, archived: boolean) => Promise<void>;
}) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					disabled={isMutating}
					className="inline-flex items-center gap-1 rounded border border-graphite bg-obsidian px-2 py-1 text-[11px] font-[510] text-snow hover:border-fog/40 hover:bg-white/5 transition-colors disabled:opacity-50"
					aria-label={`Kelola item ${id}`}
				>
					<span>Kelola</span>
					<Icon icon={ArrowDown01Icon} size={10} className="text-fog" />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-40">
				<DropdownMenuLabel className="text-[11px] text-fog font-medium">
					Ubah Status
				</DropdownMenuLabel>
				{status !== "new" && (
					<DropdownMenuItem
						onClick={() => onStatusChange?.(id, "new")}
						className="text-xs cursor-pointer"
					>
						Tandai Baru
					</DropdownMenuItem>
				)}
				{status !== "in_progress" && (
					<DropdownMenuItem
						onClick={() => onStatusChange?.(id, "in_progress")}
						className="text-xs cursor-pointer"
					>
						Tandai Diproses
					</DropdownMenuItem>
				)}
				{status !== "resolved" && (
					<DropdownMenuItem
						onClick={() => onStatusChange?.(id, "resolved")}
						className="text-xs cursor-pointer"
					>
						Tandai Selesai
					</DropdownMenuItem>
				)}
				<DropdownMenuSeparator className="bg-graphite" />
				<DropdownMenuItem
					onClick={() => onArchiveChange?.(id, !isArchived)}
					className="text-xs cursor-pointer"
				>
					{isArchived ? "Kembalikan dari Arsip" : "Arsipkan Laporan"}
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
