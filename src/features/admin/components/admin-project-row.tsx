"use client";

import { LinkSquare02Icon } from "@hugeicons/core-free-icons";
import { Link } from "@tanstack/react-router";
import { Icon } from "@/components/ui/icon";
import type { AdminProjectItem } from "../types";

function getProjectTargetRoute(
	step: string | null | undefined,
): "/vibeplan/$id/prd" | "/vibeplan/$id/ac" | "/vibeplan/$id/task" {
	if (step === "task") return "/vibeplan/$id/task";
	if (step === "ac") return "/vibeplan/$id/ac";
	return "/vibeplan/$id/prd";
}

export interface AdminProjectRowProps {
	proj: AdminProjectItem;
}

export function AdminProjectRowItem({ proj }: AdminProjectRowProps) {
	const isDeleted = Boolean(proj.deletedAt);
	const stepBadgeColor =
		proj.step === "task"
			? "bg-indigo-500/10 text-indigo-300 border-indigo-500/20"
			: proj.step === "ac"
				? "bg-purple-500/10 text-purple-300 border-purple-500/20"
				: "bg-blue-500/10 text-blue-300 border-blue-500/20";

	return (
		<tr
			className={`transition-colors ${
				isDeleted
					? "bg-rose-950/[0.04] text-fog/80 hover:bg-rose-950/[0.08]"
					: "hover:bg-white/[0.02]"
			}`}
		>
			<td className="px-5 py-3.5">
				<div className="flex items-center gap-1.5 font-medium text-snow">
					<span>{proj.name}</span>
					{isDeleted && (
						<span className="rounded border border-rose-500/30 bg-rose-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-rose-300">
							Terhapus
						</span>
					)}
				</div>
				{proj.description && (
					<div className="mt-0.5 line-clamp-1 max-w-xs text-[11px] text-fog">
						{proj.description}
					</div>
				)}
			</td>
			<td className="px-5 py-3.5">
				<div className="font-medium text-snow">
					{proj.userName ?? "Tanpa Nama"}
				</div>
				<div className="text-[11px] text-fog">{proj.userEmail ?? "-"}</div>
			</td>
			<td className="px-5 py-3.5">
				<span
					className={`inline-flex items-center rounded border px-2 py-0.5 text-[10px] font-semibold uppercase ${stepBadgeColor}`}
				>
					{proj.step ?? "PRD"}
				</span>
			</td>
			<td className="px-5 py-3.5">
				{isDeleted ? (
					<span className="inline-flex items-center rounded border border-rose-500/20 bg-rose-500/10 px-2 py-0.5 text-[10px] font-medium text-rose-300">
						Terhapus
					</span>
				) : (
					<span className="inline-flex items-center rounded bg-white/5 px-2 py-0.5 text-[10px] font-medium text-mist capitalize">
						{proj.status ?? "draft"}
					</span>
				)}
			</td>
			<td className="px-5 py-3.5 text-fog">
				{proj.createdAt
					? new Intl.DateTimeFormat("id-ID", {
							day: "numeric",
							month: "short",
							year: "numeric",
						}).format(new Date(proj.createdAt))
					: "-"}
			</td>
			<td className="px-5 py-3.5 text-right">
				{isDeleted ? (
					<span
						title="Proyek telah dihapus dari workspace dan tidak dapat diakses"
						className="inline-flex items-center rounded-md border border-graphite/40 bg-white/[0.02] px-2.5 py-1 text-[11px] font-medium text-fog/40 cursor-not-allowed select-none"
					>
						<span>Tidak Dapat Diakses</span>
					</span>
				) : (
					<Link
						to={getProjectTargetRoute(proj.step)}
						params={{ id: proj.id }}
						className="inline-flex items-center gap-1.5 rounded-md border border-graphite bg-white/5 px-2.5 py-1 text-[11px] font-medium text-snow transition-colors hover:bg-white/10 hover:border-fog/40"
					>
						<span>Buka</span>
						<Icon icon={LinkSquare02Icon} size={12} className="text-fog" />
					</Link>
				)}
			</td>
		</tr>
	);
}
