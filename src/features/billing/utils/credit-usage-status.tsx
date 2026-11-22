import type { IconProps } from "@/components/ui/icon";
import { type StatusTone, statusIcons } from "@/components/ui/status-indicator";
import type {
	CreditOperationKind,
	CreditOperationState,
} from "@/features/billing/services/adaptive-credit";

export interface CreditStatusPresentation {
	label: string;
	tone: StatusTone;
	icon: IconProps["icon"];
}

export function getActivityLabel(kind: CreditOperationKind): string {
	switch (kind) {
		case "codebase_analysis":
			return "Codebase analysis";
		case "prd_generation":
			return "Generate PRD";
		case "ac_generation":
			return "Generate AC";
		case "task_generation":
			return "Generate Task";
		default:
			return kind;
	}
}

/**
 * Credit operation domain. Released is a credit reversal, never a paid charge;
 * quoted and reserved are not failures. Payment status has its own mapping.
 */
function getPresentation(
	state: CreditOperationState,
): CreditStatusPresentation {
	switch (state) {
		case "settled":
			return {
				label: "Berhasil",
				tone: "success",
				icon: statusIcons.success,
			};
		case "released":
			return {
				label: "Dilepas",
				tone: "neutral",
				icon: statusIcons.released,
			};
		case "failed":
			return {
				label: "Gagal",
				tone: "danger",
				icon: statusIcons.failed,
			};
		case "reserved":
			return {
				label: "Direservasi",
				tone: "warning",
				icon: statusIcons.pending,
			};
		case "running":
		case "settling":
			return {
				label: state === "running" ? "Diproses" : "Menyelesaikan",
				tone: "neutral",
				icon: statusIcons.processing,
			};
		case "quarantined":
			return {
				label: "Dikarantina",
				tone: "danger",
				icon: statusIcons.alert,
			};
		case "refunded":
			return {
				label: "Dikembalikan",
				tone: "neutral",
				icon: statusIcons.released,
			};
		case "quoted":
			return {
				label: "Dikutip",
				tone: "neutral",
				icon: statusIcons.pending,
			};
		default:
			return {
				label: state,
				tone: "neutral",
				icon: statusIcons.alert,
			};
	}
}

export function getStatusLabel(state: CreditOperationState): string {
	return getPresentation(state).label;
}

export function getStatusBadge(
	state: CreditOperationState,
): CreditStatusPresentation {
	return getPresentation(state);
}
