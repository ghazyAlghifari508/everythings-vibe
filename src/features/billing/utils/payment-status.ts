export interface PaymentStatusInfo {
	label: string;
	className: string;
}

export function getPaymentStatusInfo(
	status: string | null | undefined,
): PaymentStatusInfo {
	switch (status) {
		case "success":
		case "settlement":
		case "capture":
			return {
				label: "Berhasil",
				className:
					"bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20",
			};
		case "pending":
			return {
				label: "Menunggu",
				className:
					"bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20",
			};
		case "cancel":
		case "cancelled":
			return {
				label: "Dibatalkan",
				className: "bg-zinc-500/10 text-zinc-400 border border-zinc-500/20",
			};
		case "expire":
		case "expired":
			return {
				label: "Kedaluwarsa",
				className: "bg-zinc-500/10 text-zinc-400 border border-zinc-500/20",
			};
		case "refund":
			return {
				label: "Dikembalikan",
				className:
					"bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20",
			};
		case "partial_refund":
			return {
				label: "Dikembalikan sebagian",
				className:
					"bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20",
			};
		case "chargeback":
		case "partial_chargeback":
			return {
				label: "Sengketa pembayaran",
				className:
					"bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20",
			};
		case "failed":
		case "deny":
			return {
				label: "Gagal",
				className:
					"bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20",
			};
		default:
			return {
				label: status || "Gagal",
				className: "bg-zinc-500/10 text-zinc-400 border border-zinc-500/20",
			};
	}
}
