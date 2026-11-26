"use client";

import { memo } from "react";
import { Badge } from "@/components/ui/badge";
import { StatusIndicator } from "@/components/ui/status-indicator";
import { getPaymentStatusInfo } from "@/features/billing/utils/payment-status";
import { formatCurrency } from "@/lib/utils";
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
	const planLabel = isTopUp
		? tx.plan.replace(/^topup-?/i, "Top-up ")
		: tx.plan === "hengker"
			? "Hengker"
			: tx.plan === "pro"
				? "Pro"
				: tx.plan;
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
				<Badge>{planLabel}</Badge>
			</td>
			<td className="px-5 py-3.5 font-mono font-medium text-snow">
				{formatCurrency(tx.amount)}
			</td>
			<td className="px-5 py-3.5">
				<StatusIndicator tone={statusInfo.tone} icon={statusInfo.icon}>
					{statusInfo.label}
				</StatusIndicator>
			</td>
			<td className="px-5 py-3.5 text-fog">{formattedDate}</td>
		</tr>
	);
});
