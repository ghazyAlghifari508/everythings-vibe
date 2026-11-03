"use client";

import {
	Alert01Icon,
	ArrowLeft01Icon,
	ArrowRight01Icon,
	RefreshIcon,
} from "@hugeicons/core-free-icons";
import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import type { CreditOperationStage } from "@/db/schema";
import {
	type StageFilter,
	type StatusFilter,
	useCreditUsage,
} from "@/features/billing/hooks/use-credit-usage";
import type {
	CreditOperationItem,
	CreditUsagePagination,
	PaginatedCreditUsageResult,
} from "@/features/billing/types/credit-usage";
import {
	getActivityLabel,
	getStatusBadge,
	getStatusLabel,
} from "@/features/billing/utils/credit-usage-status";
import { cn, formatDate } from "@/lib/utils";
import { CreditUsageDetail } from "./credit-usage-detail";

export type { CreditOperationItem, StageFilter, StatusFilter };
export { getActivityLabel, getStatusBadge, getStatusLabel };

export interface CreditUsageProps {
	availableCredits?: number;
	reservedCredits?: number;
	totalCreditsUsed?: number;
	operations?: CreditOperationItem[];
	initialPagination?: CreditUsagePagination;
	stageBreakdown?: Record<CreditOperationStage, number>;
	onFetch?: (params: {
		page: number;
		pageSize: number;
		stage: StageFilter;
		status: StatusFilter;
	}) => Promise<PaginatedCreditUsageResult>;
}

export function CreditUsageSection(props: CreditUsageProps) {
	const {
		stageFilter,
		statusFilter,
		pageSize,
		currentPage,
		totalPages,
		total,
		items,
		loading,
		error,
		hasActiveFilter,
		handleStageChange,
		handleStatusChange,
		handleResetFilter,
		handleRetry,
		handlePageChange,
	} = useCreditUsage(props);

	const [selectedOp, setSelectedOp] = useState<CreditOperationItem | null>(
		null,
	);

	return (
		<div className="flex flex-col gap-6">
			{/* Usage History Card */}
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
								onChange={(e) =>
									handleStageChange(e.target.value as StageFilter)
								}
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
									handleStatusChange(e.target.value as StatusFilter)
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

						{hasActiveFilter && (
							<button
								type="button"
								onClick={handleResetFilter}
								className="text-xs text-indigo hover:underline"
							>
								Reset Filter
							</button>
						)}
					</div>
				</div>

				{/* State Presentation */}
				{loading ? (
					<div
						data-testid="credit-usage-loading"
						className="py-16 flex flex-col items-center justify-center gap-2 text-sm text-(--text-secondary)"
					>
						<Icon
							icon={RefreshIcon}
							size={20}
							className="animate-spin text-mist"
						/>
						<span>Memuat riwayat penggunaan kredit...</span>
					</div>
				) : error ? (
					<div
						data-testid="credit-usage-error"
						className="py-12 flex flex-col items-center justify-center gap-3 text-center"
					>
						<Icon icon={Alert01Icon} size={28} className="text-rose-400" />
						<p className="text-sm text-(--text-secondary) max-w-sm">{error}</p>
						<button
							type="button"
							onClick={handleRetry}
							className="min-h-9 rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-4 py-1.5 text-xs font-medium text-snow hover:bg-white/5 transition-colors"
						>
							Coba Lagi
						</button>
					</div>
				) : total === 0 && !hasActiveFilter ? (
					<div
						data-testid="credit-usage-empty"
						className="flex flex-col items-center justify-center p-12 text-center"
					>
						<p className="text-sm text-(--text-secondary)">
							Belum ada riwayat penggunaan kredit.
						</p>
					</div>
				) : items.length === 0 ? (
					<div
						data-testid="credit-usage-filtered-empty"
						className="flex flex-col items-center justify-center p-12 text-center"
					>
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
								{items.map((op) => {
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

				{/* Bounded pagination footer */}
				{total > 0 && !loading && !error && (
					<div className="p-4 border-t border-(--border-subtle) flex flex-wrap items-center justify-between gap-3 bg-(--bg-surface)/30">
						<div className="flex items-center gap-2 text-xs text-(--text-secondary)">
							<span>{pageSize} baris per halaman</span>
							<span className="hidden sm:inline text-fog/40">•</span>
							<span className="tabular-nums">
								Halaman {currentPage} dari {totalPages}
							</span>
						</div>

						<div className="flex items-center gap-2">
							<button
								type="button"
								data-testid="prev-page-btn"
								onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
								disabled={currentPage <= 1 || loading}
								className="min-h-9 inline-flex items-center gap-1.5 rounded-lg border border-(--border-subtle) bg-(--bg-card) px-3 py-1.5 text-xs font-medium text-snow hover:bg-(--bg-surface) transition-colors disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
							>
								<Icon icon={ArrowLeft01Icon} size={14} />
								<span>Sebelumnya</span>
							</button>
							<button
								type="button"
								data-testid="next-page-btn"
								onClick={() =>
									handlePageChange(Math.min(totalPages, currentPage + 1))
								}
								disabled={currentPage >= totalPages || loading}
								className="min-h-9 inline-flex items-center gap-1.5 rounded-lg border border-(--border-subtle) bg-(--bg-card) px-3 py-1.5 text-xs font-medium text-snow hover:bg-(--bg-surface) transition-colors disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
							>
								<span>Berikutnya</span>
								<Icon icon={ArrowRight01Icon} size={14} />
							</button>
						</div>
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
