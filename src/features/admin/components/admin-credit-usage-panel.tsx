"use client";

import { Search01Icon } from "@hugeicons/core-free-icons";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon, type IconProps } from "@/components/ui/icon";
import {
	StatusIndicator,
	type StatusTone,
	statusIcons,
} from "@/components/ui/status-indicator";
import type { CreditOperationState } from "@/features/billing/services/adaptive-credit";
import type {
	AdminCreditSearchParams,
	AdminCreditUsageResult,
	AdminCreditUsageSummary,
} from "../types/admin-credit";
import {
	CREDIT_FUNDING_FILTERS,
	CREDIT_OPERATION_KIND_FILTERS,
	CREDIT_PRODUCT_FILTERS,
	CREDIT_STATUS_FILTERS,
} from "../types/admin-credit";
import {
	CREDIT_FUNDING_LABELS,
	CREDIT_OPERATION_LABELS,
	operationLabel,
	productFamilyLabel,
	toAdminCreditDetail,
} from "../utils/admin-credit-utils";
import { AdminCreditBreakdownChart } from "./admin-credit-breakdown-chart";
import { AdminCreditDetailDialog } from "./admin-credit-detail-dialog";
import { AdminMetricCard } from "./admin-metric-card";
import { AdminPagination } from "./admin-pagination";

interface AdminCreditUsagePanelProps {
	result: AdminCreditUsageResult;
	summary: AdminCreditUsageSummary;
	searchParams: AdminCreditSearchParams;
}

const STATE_PRESENTATION: Record<
	CreditOperationState,
	{ label: string; tone: StatusTone; icon: IconProps["icon"] }
> = {
	quoted: {
		label: "Ditawarkan",
		tone: "neutral",
		icon: statusIcons.neutral,
	},
	reserved: {
		label: "Direservasi",
		tone: "warning",
		icon: statusIcons.pending,
	},
	running: {
		label: "Berjalan",
		tone: "warning",
		icon: statusIcons.processing,
	},
	settling: {
		label: "Diselesaikan",
		tone: "warning",
		icon: statusIcons.processing,
	},
	quarantined: {
		label: "Dikarantina",
		tone: "danger",
		icon: statusIcons.alert,
	},
	settled: {
		label: "Selesai",
		tone: "success",
		icon: statusIcons.success,
	},
	released: {
		label: "Dilepas",
		tone: "neutral",
		icon: statusIcons.released,
	},
	failed: {
		label: "Gagal",
		tone: "danger",
		icon: statusIcons.failed,
	},
	refunded: {
		label: "Dikembalikan",
		tone: "success",
		icon: statusIcons.success,
	},
};

function formatDateTime(value: string | null): string {
	if (!value) return "Tidak ada data";
	return new Date(value).toLocaleString("id-ID", {
		dateStyle: "medium",
		timeStyle: "short",
	});
}

const selectClass =
	"h-9 rounded-lg border border-graphite bg-charcoal px-2.5 text-xs font-inter text-snow focus:border-fog/40 focus:outline-none";

export function AdminCreditUsagePanel({
	result,
	summary,
	searchParams,
}: AdminCreditUsagePanelProps) {
	const navigate = useNavigate({ from: "/admin/credit" });
	const [search, setSearch] = useState(searchParams.search);
	const [detail, setDetail] = useState<ReturnType<
		typeof toAdminCreditDetail
	> | null>(null);
	const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const updateSearch = useCallback(
		(patch: Partial<AdminCreditSearchParams>) => {
			void navigate({ search: (prev) => ({ ...prev, ...patch }) });
		},
		[navigate],
	);

	const updateFilter = useCallback(
		(patch: Partial<AdminCreditSearchParams>) => {
			updateSearch({ ...patch, page: 1 });
		},
		[updateSearch],
	);

	useEffect(() => {
		if (search === searchParams.search) return;
		clearTimeout(searchTimeoutRef.current ?? undefined);
		searchTimeoutRef.current = setTimeout(() => {
			updateFilter({ search: search.trim() });
		}, 300);
		return () => clearTimeout(searchTimeoutRef.current ?? undefined);
	}, [search, searchParams.search, updateFilter]);

	const { success, partial, failed, refunded, quarantined, active } =
		summary.outcomeCounts;

	return (
		<div className="space-y-6">
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<AdminMetricCard
					label="Kredit terpakai"
					value={summary.settledCreditsUsed}
					subtext="Debit buku besar terverifikasi"
					icon={statusIcons.success}
				/>
				<AdminMetricCard
					label="Reservasi aktif"
					value={summary.activeReservedCredits}
					subtext="Hold operasi berjalan, bukan tagihan"
					icon={statusIcons.pending}
				/>
				<AdminMetricCard
					label="Kredit dikembalikan"
					value={summary.refundedCredits}
					subtext="Refund buku besar"
					icon={statusIcons.released}
				/>
				<AdminMetricCard
					label="Reservasi dilepas"
					value={summary.releasedReservationCredits}
					subtext={`${summary.releasedReservationCount} operasi dilepas, bukan refund`}
					icon={statusIcons.neutral}
				/>
			</div>

			<div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fog">
				<span>Sukses {success}</span>
				<span>Sebagian {partial}</span>
				<span>Gagal {failed}</span>
				<span>Dikembalikan {refunded}</span>
				<span>Dikarantina {quarantined}</span>
				<span>Aktif {active}</span>
			</div>

			{!summary.trialUsageAvailable && (
				<p className="text-xs text-fog">
					Trial Studio dan Scrape: belum tersedia. Penerapan trial belum
					diimplementasikan, sehingga tidak ada angka trial yang ditampilkan.
				</p>
			)}
			<p className="text-xs text-fog">
				Ringkasan mengikuti periode, fitur, operasi, status, dan sumber dana.
				Pencarian pengguna hanya memfilter tabel.
			</p>

			<AdminCreditBreakdownChart items={summary.breakdown} />

			<section className="space-y-4">
				<div className="flex flex-col gap-3">
					<div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
						<div className="relative w-full max-w-sm">
							<Icon
								icon={Search01Icon}
								size={15}
								className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fog"
							/>
							<input
								type="search"
								value={search}
								onChange={(event) => setSearch(event.target.value)}
								placeholder="Cari pengguna atau ID operasi"
								aria-label="Cari pengguna atau ID operasi"
								className="h-9 w-full rounded-lg border border-graphite bg-charcoal pl-9 pr-3 text-xs text-snow placeholder:text-fog/60 focus:border-fog/40 focus:outline-none"
							/>
						</div>
						<div className="flex flex-wrap items-center gap-2">
							<input
								type="date"
								value={searchParams.from ?? ""}
								onChange={(event) =>
									updateFilter({
										from: event.target.value || undefined,
									})
								}
								aria-label="Tanggal mulai"
								className={`${selectClass} [color-scheme:dark]`}
							/>
							<input
								type="date"
								value={searchParams.to ?? ""}
								onChange={(event) =>
									updateFilter({ to: event.target.value || undefined })
								}
								aria-label="Tanggal akhir"
								className={`${selectClass} [color-scheme:dark]`}
							/>
							<select
								value={searchParams.product}
								onChange={(event) =>
									updateFilter({
										product: event.target
											.value as AdminCreditSearchParams["product"],
									})
								}
								aria-label="Filter fitur"
								className={selectClass}
							>
								{CREDIT_PRODUCT_FILTERS.map((value) => (
									<option key={value} value={value}>
										{value === "all"
											? "Semua fitur"
											: productFamilyLabel(value)}
									</option>
								))}
							</select>
							<select
								value={searchParams.operation}
								onChange={(event) =>
									updateFilter({
										operation: event.target
											.value as AdminCreditSearchParams["operation"],
									})
								}
								aria-label="Filter operasi"
								className={selectClass}
							>
								{CREDIT_OPERATION_KIND_FILTERS.map((value) => (
									<option key={value} value={value}>
										{value === "all"
											? "Semua operasi"
											: CREDIT_OPERATION_LABELS[value]}
									</option>
								))}
							</select>
							<select
								value={searchParams.status}
								onChange={(event) =>
									updateFilter({
										status: event.target
											.value as AdminCreditSearchParams["status"],
									})
								}
								aria-label="Filter status"
								className={selectClass}
							>
								{CREDIT_STATUS_FILTERS.map((value) => (
									<option key={value} value={value}>
										{value === "all" ? "Semua status" : value}
									</option>
								))}
							</select>
							<select
								value={searchParams.fundingSource}
								onChange={(event) =>
									updateFilter({
										fundingSource: event.target
											.value as AdminCreditSearchParams["fundingSource"],
									})
								}
								aria-label="Filter sumber dana"
								className={selectClass}
							>
								{CREDIT_FUNDING_FILTERS.map((value) => (
									<option key={value} value={value}>
										{value === "all"
											? "Semua sumber dana"
											: CREDIT_FUNDING_LABELS[value]}
									</option>
								))}
							</select>
						</div>
					</div>
				</div>

				<div className="overflow-x-auto rounded-xl border border-graphite bg-charcoal">
					<table className="w-full min-w-[1024px] text-left text-xs font-inter">
						<thead className="border-b border-graphite text-[11px] text-mist">
							<tr>
								<th className="px-3 py-2.5 font-medium">Waktu</th>
								<th className="px-3 py-2.5 font-medium">Pengguna</th>
								<th className="px-3 py-2.5 font-medium">Fitur</th>
								<th className="px-3 py-2.5 font-medium">Aktivitas</th>
								<th className="px-3 py-2.5 font-medium">Resource</th>
								<th className="px-3 py-2.5 text-right font-medium">Estimasi</th>
								<th className="px-3 py-2.5 text-right font-medium">
									Reservasi
								</th>
								<th className="px-3 py-2.5 text-right font-medium">Tagihan</th>
								<th className="px-3 py-2.5 font-medium">Status</th>
								<th className="px-3 py-2.5 font-medium">Detail</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-graphite">
							{result.rows.length === 0 ? (
								<tr>
									<td colSpan={10} className="px-3 py-12 text-center text-fog">
										Tidak ada operasi kredit untuk filter ini.
									</td>
								</tr>
							) : (
								result.rows.map((row) => {
									const state = STATE_PRESENTATION[row.state];
									return (
										<tr key={row.id} className="hover:bg-white/[0.02]">
											<td className="whitespace-nowrap px-3 py-2.5 text-fog">
												{formatDateTime(row.createdAt)}
											</td>
											<td className="max-w-[180px] truncate px-3 py-2.5 text-snow">
												{row.userName ?? row.userEmail ?? "Tidak ada data"}
											</td>
											<td className="whitespace-nowrap px-3 py-2.5 text-fog">
												{productFamilyLabel(row.product)}
											</td>
											<td className="whitespace-nowrap px-3 py-2.5 text-fog">
												{operationLabel(row.operation)}
											</td>
											<td className="max-w-[180px] truncate px-3 py-2.5 text-fog">
												{row.resourceLabel ??
													row.resourceId ??
													"Tidak ada data"}
											</td>
											<td className="px-3 py-2.5 text-right font-mono text-snow">
												{row.estimatedCredits}
											</td>
											<td className="px-3 py-2.5 text-right font-mono text-snow">
												{row.reservedCredits}
											</td>
											<td className="px-3 py-2.5 text-right font-mono text-snow">
												{row.finalCharge ?? "Belum ada"}
											</td>
											<td className="px-3 py-2.5">
												<StatusIndicator tone={state.tone} icon={state.icon}>
													{state.label}
												</StatusIndicator>
											</td>
											<td className="px-3 py-2.5">
												<button
													type="button"
													onClick={() => setDetail(toAdminCreditDetail(row))}
													className="min-h-9 rounded-md px-2 text-xs font-[510] text-fog transition-colors hover:text-snow focus-visible:outline focus-visible:outline-1 focus-visible:outline-fog"
												>
													Detail
												</button>
											</td>
										</tr>
									);
								})
							)}
						</tbody>
					</table>
				</div>

				<AdminPagination
					page={result.page}
					pageSize={result.pageSize}
					totalCount={result.totalCount}
					totalPages={result.totalPages}
					onPageChange={(page) => updateSearch({ page })}
					onPageSizeChange={(pageSize) => updateSearch({ pageSize, page: 1 })}
					entityName="operasi kredit"
				/>
			</section>

			<AdminCreditDetailDialog
				detail={detail}
				onClose={() => setDetail(null)}
			/>
		</div>
	);
}
