import {
	Alert01Icon,
	CancelCircleIcon,
	CheckmarkCircle01Icon,
	Clock01Icon,
	RefreshIcon,
	ShieldAlertIcon,
	Undo02Icon,
} from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import type {
	CreditOperationKind,
	CreditOperationState,
} from "@/features/billing/services/adaptive-credit";

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

export function getStatusLabel(state: CreditOperationState): string {
	switch (state) {
		case "settled":
			return "Berhasil";
		case "released":
			return "Dilepas";
		case "failed":
			return "Gagal";
		case "reserved":
			return "Direservasi";
		case "running":
			return "Diproses";
		case "settling":
			return "Menyelesaikan";
		case "quarantined":
			return "Dikarantina";
		case "refunded":
			return "Dikembalikan";
		case "quoted":
			return "Dikutip";
		default:
			return state;
	}
}

export function getStatusBadge(state: CreditOperationState) {
	switch (state) {
		case "settled":
			return {
				label: "Berhasil",
				className: "bg-emerald/10 text-emerald border-emerald/20",
				icon: (
					<Icon icon={CheckmarkCircle01Icon} size={12} className="h-3 w-3" />
				),
			};
		case "released":
			return {
				label: "Dilepas",
				className: "bg-steel/20 text-fog border-steel/30",
				icon: <Icon icon={Undo02Icon} size={12} className="h-3 w-3" />,
			};
		case "failed":
			return {
				label: "Gagal",
				className: "bg-crimson/10 text-crimson border-crimson/20",
				icon: <Icon icon={CancelCircleIcon} size={12} className="h-3 w-3" />,
			};
		case "reserved":
			return {
				label: "Direservasi",
				className: "bg-amber-500/10 text-amber-400 border-amber-500/20",
				icon: <Icon icon={Clock01Icon} size={12} className="h-3 w-3" />,
			};
		case "running":
		case "settling":
			return {
				label: "Diproses",
				className: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
				icon: (
					<Icon icon={RefreshIcon} size={12} className="h-3 w-3 animate-spin" />
				),
			};
		case "quarantined":
			return {
				label: "Dikarantina",
				className: "bg-indigo/10 text-indigo border-indigo/20",
				icon: <Icon icon={ShieldAlertIcon} size={12} className="h-3 w-3" />,
			};
		case "refunded":
			return {
				label: "Dikembalikan",
				className: "bg-indigo/10 text-indigo border-indigo/20",
				icon: <Icon icon={Undo02Icon} size={12} className="h-3 w-3" />,
			};
		case "quoted":
			return {
				label: "Dikutip",
				className: "bg-steel/10 text-fog border-steel/20",
				icon: <Icon icon={Clock01Icon} size={12} className="h-3 w-3" />,
			};
		default:
			return {
				label: state,
				className: "bg-steel/10 text-fog border-steel/20",
				icon: <Icon icon={Alert01Icon} size={12} className="h-3 w-3" />,
			};
	}
}
