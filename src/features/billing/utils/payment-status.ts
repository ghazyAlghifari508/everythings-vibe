import type { IconProps } from "@/components/ui/icon";
import { type StatusTone, statusIcons } from "@/components/ui/status-indicator";

export interface PaymentStatusInfo {
	label: string;
	tone: StatusTone;
	icon: IconProps["icon"];
}

/**
 * Payment domain only. Credit operations keep their own mapping in
 * credit-usage-status.tsx; never merge the two business states.
 */
export function getPaymentStatusInfo(
	status: string | null | undefined,
): PaymentStatusInfo {
	switch (status) {
		case "success":
		case "settlement":
		case "capture":
		case "paid":
			return {
				label: "Berhasil",
				tone: "success",
				icon: statusIcons.success,
			};
		case "pending":
			return {
				label: "Menunggu",
				tone: "warning",
				icon: statusIcons.pending,
			};
		case "cancel":
		case "cancelled":
			return {
				label: "Dibatalkan",
				tone: "neutral",
				icon: statusIcons.released,
			};
		case "expire":
		case "expired":
			return {
				label: "Kedaluwarsa",
				tone: "neutral",
				icon: statusIcons.alert,
			};
		case "refund":
			return {
				label: "Dikembalikan",
				tone: "neutral",
				icon: statusIcons.released,
			};
		case "partial_refund":
			return {
				label: "Dikembalikan sebagian",
				tone: "neutral",
				icon: statusIcons.released,
			};
		case "chargeback":
		case "partial_chargeback":
			return {
				label: "Sengketa pembayaran",
				tone: "warning",
				icon: statusIcons.alert,
			};
		case "failed":
		case "deny":
			return {
				label: "Gagal",
				tone: "danger",
				icon: statusIcons.failed,
			};
		default:
			return {
				label: status || "Gagal",
				tone: "neutral",
				icon: statusIcons.alert,
			};
	}
}
