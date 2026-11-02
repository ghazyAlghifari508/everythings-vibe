"use client";

import {
	BubbleChatIcon,
	Bug02Icon,
	SparklesIcon,
} from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import type { AdminErrorReportItem, AdminFeedbackItem } from "../types";

export interface AdminFeedbackRowItemProps {
	feedback: AdminFeedbackItem;
}

export function AdminFeedbackRowItem({
	feedback: f,
}: AdminFeedbackRowItemProps) {
	const type = f.type ?? "general";

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
}

export function AdminErrorReportRowItem({
	error: e,
}: AdminErrorReportRowItemProps) {
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
