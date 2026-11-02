"use client";

import { memo } from "react";
import { getPaymentStatusInfo } from "@/features/billing/utils/payment-status";
import { cn, formatCurrency } from "@/lib/utils";
import type { AdminTransactionItem } from "../types";

export interface AdminTransactionRowProps {
	tx: AdminTransactionItem;
}

export const AdminTransactionRowItem = memo(function AdminTransactionRowItem({
	tx,
}: AdminTransactionRowProps) {
	const statusInfo = getPaymentStatusInfo(tx.status);

	const formattedDate = tx.createdAt
		? new Intl.DateTimeFormat("id-ID", {
				day: "numeric",
				month: "short",
				year: "numeric",
				hour: "2-digit",
				minute: "2-digit",
			}).format(new Date(tx.createdAt))
		: "-";

	const isTopUp = tx.plan.startsWith("topup");

	return (
		<tr className="transition-colors hover:bg-white/[0.02]">
			<td className="px-5 py-3.5 font-mono text-[11px] text-snow">
				{tx.orderId}
			</td>
			<td className="px-5 py-3.5">
				<div className="font-medium text-snow">
					{tx.userName ?? "Tanpa Nama"}
				</div>
				<div className="text-[11px] text-fog">{tx.userEmail ?? "-"}</div>
			</td>
			<td className="px-5 py-3.5">
				<span
					className={cn(
						"inline-flex items-center rounded px-2 py-0.5 text-[10px] font-semibold uppercase",
						tx.plan === "hengker"
							? "bg-amber-500/10 text-amber-300 border border-amber-500/20"
							: tx.plan === "pro"
								? "bg-indigo-500/10 text-indigo-300 border border-indigo-500/20"
								: isTopUp
									? "bg-cyan-500/10 text-cyan-300 border border-cyan-500/20"
									: "bg-graphite/20 text-fog border border-graphite",
					)}
				>
					{tx.plan}
				</span>
			</td>
			<td className="px-5 py-3.5 font-mono font-medium text-snow">
				{formatCurrency(tx.amount)}
			</td>
			<td className="px-5 py-3.5">
				<span
					className={cn(
						"inline-flex items-center rounded-md px-2.5 py-0.5 text-[11px] font-medium",
						statusInfo.className,
					)}
				>
					{statusInfo.label}
				</span>
			</td>
			<td className="px-5 py-3.5 text-fog">{formattedDate}</td>
		</tr>
	);
});
