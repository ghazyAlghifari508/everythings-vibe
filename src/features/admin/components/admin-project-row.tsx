"use client";

import { LinkSquare02Icon } from "@hugeicons/core-free-icons";
import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { StatusBadge } from "@/components/ui/status-badge";
import { StatusIndicator } from "@/components/ui/status-indicator";
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
	const stepLabels: Record<string, string> = {
		idea: "Ide",
		questions: "Tanya Jawab",
		prd: "PRD",
		ac: "AC",
		task: "Task",
	};
	const step = (proj.step ?? "prd").toLowerCase();

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
				<Badge>{stepLabels[step] ?? step}</Badge>
			</td>
			<td className="px-5 py-3.5">
				{isDeleted ? (
					<StatusBadge tone="danger">Terhapus</StatusBadge>
				) : (
					<StatusIndicator tone="neutral">
						{proj.status ?? "draft"}
					</StatusIndicator>
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
