import {
	FAILED_PAYMENT_STATUSES,
	PENDING_PAYMENT_STATUSES,
	SUCCESS_PAYMENT_STATUSES,
} from "../services/admin-transactions-service";
import type { AdminTransactionItem, AdminTransactionStats } from "../types";

export function filterTransactionsClient(
	source: AdminTransactionItem[],
	search: string,
	activeStatus: string,
	activePlan: string,
): AdminTransactionItem[] {
	const q = search.toLowerCase().trim();

	return source.filter((tx) => {
		const matchesSearch =
			!q ||
			tx.orderId.toLowerCase().includes(q) ||
			tx.userName?.toLowerCase().includes(q) ||
			tx.userEmail?.toLowerCase().includes(q);

		const isSuccess = (SUCCESS_PAYMENT_STATUSES as readonly string[]).includes(
			tx.status,
		);
		const isPending = (PENDING_PAYMENT_STATUSES as readonly string[]).includes(
			tx.status,
		);
		const isFailed = (FAILED_PAYMENT_STATUSES as readonly string[]).includes(
			tx.status,
		);

		const matchesStatus =
			activeStatus === "all" ||
			(activeStatus === "success" && isSuccess) ||
			(activeStatus === "pending" && isPending) ||
			(activeStatus === "expire" && isFailed) ||
			(activeStatus === "failed" && isFailed) ||
			tx.status === activeStatus;

		const matchesPlan =
			activePlan === "all" ||
			(activePlan === "topup" && tx.plan.startsWith("topup")) ||
			tx.plan === activePlan;

		return matchesSearch && matchesStatus && matchesPlan;
	});
}

export function calculateFallbackTransactionStats(
	rows: AdminTransactionItem[],
	totalCount: number,
): AdminTransactionStats {
	let successCount = 0;
	let pendingCount = 0;
	let totalRevenue = 0;

	for (const t of rows) {
		if ((SUCCESS_PAYMENT_STATUSES as readonly string[]).includes(t.status)) {
			successCount++;
			totalRevenue += t.amount ?? 0;
		} else if (
			(PENDING_PAYMENT_STATUSES as readonly string[]).includes(t.status)
		) {
			pendingCount++;
		}
	}

	return {
		totalTransactions: totalCount,
		successCount,
		pendingCount,
		totalRevenue,
	};
}
