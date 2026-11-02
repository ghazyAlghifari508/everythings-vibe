"use client";

import {
	ArrowDown01Icon,
	BubbleChatIcon,
	Bug02Icon,
	SparklesIcon,
} from "@hugeicons/core-free-icons";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
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
				<span
					className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
						type === "bug"
							? "bg-rose-500/10 text-rose-300 border border-rose-500/20"
							: type === "feature"
								? "bg-indigo-500/10 text-indigo-300 border border-indigo-500/20"
								: "bg-white/5 text-fog border border-graphite"
					}`}
				>
					{type === "bug" ? (
						<Icon icon={Bug02Icon} size={10} />
					) : type === "feature" ? (
						<Icon icon={SparklesIcon} size={10} />
					) : (
						<Icon icon={BubbleChatIcon} size={10} />
					)}
					{type}
				</span>
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

function StatusBadge({
	status = "new",
	isArchived = false,
}: {
	status?: FeedbackHandlingStatus;
	isArchived?: boolean;
}) {
	if (isArchived) {
		return (
			<span className="inline-flex items-center rounded-md border border-graphite/60 bg-white/5 px-2 py-0.5 text-[10px] font-[510] text-fog">
				Diarsipkan
			</span>
		);
	}
	if (status === "resolved") {
		return (
			<span className="inline-flex items-center rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-[510] text-emerald-400">
				Selesai
			</span>
		);
	}
	if (status === "in_progress") {
		return (
			<span className="inline-flex items-center rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] font-[510] text-amber-300">
				Diproses
			</span>
		);
	}
	return (
		<span className="inline-flex items-center rounded-md border border-sky-500/20 bg-sky-500/10 px-2 py-0.5 text-[10px] font-[510] text-sky-300">
			Baru
		</span>
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
