"use client";

import {
	AlertTriangle,
	CheckCircle2,
	Clock,
	RefreshCw,
	ShieldAlert,
	Undo2,
	XCircle,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { CreditOperationStage } from "@/db/schema";
import type {
	CreditComplexityMetrics,
	CreditOperationKind,
	CreditOperationState,
	CreditPricingVersion,
} from "@/lib/adaptive-credit";
import { cn, formatDate } from "@/lib/utils";
import { CreditUsageDetail } from "./credit-usage-detail";

export interface CreditOperationItem {
	id: string;
	projectId: string;
	projectName?: string | null;
	kind: CreditOperationKind;
	stage: CreditOperationStage;
	state: CreditOperationState;
	estimatedCredits: number;
	reservedCredits: number;
	maximumCredits: number;
	finalCharge?: number | null;
	pricingVersion: CreditPricingVersion;
	metrics: CreditComplexityMetrics;
	capApplied: boolean;
	createdAt: string | null;
	settledAt?: string | null;
}

export interface CreditUsageProps {
	availableCredits?: number;
	reservedCredits?: number;
	totalCreditsUsed?: number;
	operations: CreditOperationItem[];
	stageBreakdown?: Record<CreditOperationStage, number>;
}

type StageFilter = "all" | CreditOperationStage;
type StatusFilter = "all" | CreditOperationState;

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
				icon: <CheckCircle2 className="h-3 w-3" />,
			};
		case "released":
			return {
				label: "Dilepas",
				className: "bg-steel/20 text-fog border-steel/30",
				icon: <Undo2 className="h-3 w-3" />,
			};
		case "failed":
			return {
				label: "Gagal",
				className: "bg-crimson/10 text-crimson border-crimson/20",
				icon: <XCircle className="h-3 w-3" />,
			};
		case "reserved":
			return {
				label: "Direservasi",
				className: "bg-amber-500/10 text-amber-400 border-amber-500/20",
				icon: <Clock className="h-3 w-3" />,
			};
		case "running":
		case "settling":
			return {
				label: "Diproses",
				className: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
				icon: <RefreshCw className="h-3 w-3 animate-spin" />,
			};
		case "quarantined":
			return {
				label: "Dikarantina",
				className: "bg-indigo/10 text-indigo border-indigo/20",
				icon: <ShieldAlert className="h-3 w-3" />,
			};
		case "refunded":
			return {
				label: "Dikembalikan",
				className: "bg-indigo/10 text-indigo border-indigo/20",
				icon: <Undo2 className="h-3 w-3" />,
			};
		case "quoted":
			return {
				label: "Dikutip",
				className: "bg-steel/10 text-fog border-steel/20",
				icon: <Clock className="h-3 w-3" />,
			};
		default:
			return {
				label: state,
				className: "bg-steel/10 text-fog border-steel/20",
				icon: <AlertTriangle className="h-3 w-3" />,
			};
	}
}

export function CreditUsageSection({ operations }: CreditUsageProps) {
	const [stageFilter, setStageFilter] = useState<StageFilter>("all");
	const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
	const [selectedOp, setSelectedOp] = useState<CreditOperationItem | null>(
		null,
	);

	const filteredOperations = useMemo(() => {
		return operations.filter((op) => {
			if (stageFilter !== "all" && op.stage !== stageFilter) {
				return false;
			}
			if (statusFilter !== "all" && op.state !== statusFilter) {
				return false;
			}
			return true;
		});
	}, [operations, stageFilter, statusFilter]);

	return (
		<div className="flex flex-col gap-6">
			{/* Usage History Table */}
			<div className="rounded-xl border border-(--border-subtle) bg-(--bg-card) overflow-hidden">
				<div className="p-5 pb-4 flex flex-wrap items-center justify-between gap-4 border-b border-(--border-subtle)">
					<div>
						<h3 className="font-inter text-lg font-bold text-snow">
							Riwayat Penggunaan Kredit
						</h3>
						<p className="mt-0.5 text-xs text-(--text-secondary)">
							Log aktivitas dan rincian kredit yang terpakai per operasi.
						</p>
					</div>

					{/* Filter Bar */}
					<div className="flex flex-wrap items-center gap-3">
						<div className="flex items-center gap-2">
							<label
								htmlFor="filter-stage-select"
								className="text-xs font-medium text-(--text-secondary)"
							>
								Tahap:
							</label>
							<select
								id="filter-stage-select"
								data-testid="filter-stage"
								value={stageFilter}
								onChange={(e) => setStageFilter(e.target.value as StageFilter)}
								className="rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-3 py-1.5 text-xs font-medium text-snow focus:border-indigo focus:outline-none"
							>
								<option value="all">Semua Tahap</option>
								<option value="codebase">Codebase</option>
								<option value="prd">PRD</option>
								<option value="ac">AC</option>
								<option value="task">Task</option>
							</select>
						</div>

						<div className="flex items-center gap-2">
							<label
								htmlFor="filter-status-select"
								className="text-xs font-medium text-(--text-secondary)"
							>
								Status:
							</label>
							<select
								id="filter-status-select"
								data-testid="filter-status"
								value={statusFilter}
								onChange={(e) =>
									setStatusFilter(e.target.value as StatusFilter)
								}
								className="rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-3 py-1.5 text-xs font-medium text-snow focus:border-indigo focus:outline-none"
							>
								<option value="all">Semua Status</option>
								<option value="settled">Berhasil</option>
								<option value="released">Dilepas</option>
								<option value="failed">Gagal</option>
								<option value="reserved">Direservasi</option>
								<option value="running">Diproses</option>
								<option value="quarantined">Dikarantina</option>
								<option value="refunded">Dikembalikan</option>
							</select>
						</div>

						{(stageFilter !== "all" || statusFilter !== "all") && (
							<button
								type="button"
								onClick={() => {
									setStageFilter("all");
									setStatusFilter("all");
								}}
								className="text-xs text-indigo hover:underline"
							>
								Reset Filter
							</button>
						)}
					</div>
				</div>

				{operations.length === 0 ? (
					<div className="flex flex-col items-center justify-center p-12 text-center">
						<p className="text-sm text-(--text-secondary)">
							Belum ada riwayat penggunaan kredit.
						</p>
					</div>
				) : filteredOperations.length === 0 ? (
					<div className="flex flex-col items-center justify-center p-12 text-center">
						<p className="text-sm text-(--text-secondary)">
							Tidak ada riwayat penggunaan kredit yang sesuai dengan filter yang
							dipilih.
						</p>
					</div>
				) : (
					<div className="overflow-x-auto">
						<table className="w-full text-left text-sm">
							<thead className="border-y border-(--border-subtle) bg-(--bg-surface) text-xs uppercase text-(--text-secondary)">
								<tr>
									<th className="px-5 py-3 font-medium">Waktu</th>
									<th className="px-5 py-3 font-medium">Aktivitas</th>
									<th className="px-5 py-3 font-medium">Project</th>
									<th className="px-5 py-3 font-medium">Estimasi</th>
									<th className="px-5 py-3 font-medium">Terpakai</th>
									<th className="px-5 py-3 font-medium">Status</th>
									<th className="px-5 py-3 font-medium text-right">Aksi</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-(--border-subtle)">
								{filteredOperations.map((op) => {
									const badge = getStatusBadge(op.state);
									return (
										<tr
											key={op.id}
											data-testid={`row-${op.id}`}
											className="hover:bg-(--bg-surface)/50 transition-colors"
										>
											<td className="whitespace-nowrap px-5 py-3.5 text-xs text-(--text-secondary)">
												{op.createdAt ? formatDate(op.createdAt) : "—"}
											</td>
											<td className="whitespace-nowrap px-5 py-3.5 font-medium text-snow">
												{getActivityLabel(op.kind)}
											</td>
											<td className="whitespace-nowrap px-5 py-3.5 text-xs text-fog max-w-[180px] truncate">
												{op.projectName || "Proyek Tanpa Nama"}
											</td>
											<td className="whitespace-nowrap px-5 py-3.5 text-xs font-mono text-(--text-secondary)">
												{op.estimatedCredits} kr
											</td>
											<td className="whitespace-nowrap px-5 py-3.5 text-xs font-mono font-medium text-snow">
												{op.finalCharge !== null && op.finalCharge !== undefined
													? `${op.finalCharge} kr`
													: "—"}
											</td>
											<td className="whitespace-nowrap px-5 py-3.5">
												<span
													className={cn(
														"inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
														badge.className,
													)}
												>
													{badge.icon}
													{badge.label}
												</span>
											</td>
											<td className="whitespace-nowrap px-5 py-3.5 text-right">
												<button
													type="button"
													data-testid={`detail-btn-${op.id}`}
													onClick={() => setSelectedOp(op)}
													className="rounded-lg border border-(--border-subtle) px-3 py-1 text-xs font-medium text-snow hover:bg-(--bg-surface) transition-colors"
												>
													Detail
												</button>
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				)}
			</div>

			{/* Detail Modal */}
			{selectedOp && (
				<CreditUsageDetail
					selectedOp={selectedOp}
					activityLabel={getActivityLabel(selectedOp.kind)}
					onClose={() => setSelectedOp(null)}
				/>
			)}
		</div>
	);
}
