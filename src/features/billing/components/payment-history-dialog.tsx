"use client";

import {
	Alert01Icon,
	ArrowLeft01Icon,
	ArrowRight01Icon,
	RefreshIcon,
} from "@hugeicons/core-free-icons";
import { useCallback, useEffect, useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icon";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import {
	loadPaymentHistory,
	type PaginatedPaymentHistoryResult,
} from "../services/payment-history.functions";
import { getPaymentStatusInfo } from "../utils/payment-status";

interface PaymentHistoryDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

const STATUS_FILTERS = [
	{ id: "all", label: "Semua" },
	{ id: "success", label: "Berhasil" },
	{ id: "failed", label: "Gagal" },
	{ id: "refund", label: "Dikembalikan" },
] as const;

export function PaymentHistoryDialog({
	open,
	onOpenChange,
}: PaymentHistoryDialogProps) {
	const [page, setPage] = useState(1);
	const [statusFilter, setStatusFilter] = useState<string>("all");
	const [result, setResult] = useState<PaginatedPaymentHistoryResult | null>(
		null,
	);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const fetchHistory = useCallback(async (p: number, s: string) => {
		setLoading(true);
		setError(null);
		try {
			const res = await loadPaymentHistory({
				data: { page: p, pageSize: 10, status: s },
			});
			setResult(res);
		} catch {
			setError("Gagal memuat riwayat pembayaran. Silakan coba lagi.");
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		if (open) {
			fetchHistory(page, statusFilter);
		}
	}, [open, page, statusFilter, fetchHistory]);

	const handleFilterChange = (newStatus: string) => {
		setStatusFilter(newStatus);
		setPage(1);
	};

	const totalPages = result?.totalPages ?? 1;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-6 overflow-hidden">
				<DialogHeader className="shrink-0 pb-4 border-b border-graphite/40">
					<DialogTitle className="text-xl font-bold font-inter font-[510] text-snow">
						Riwayat Pembayaran
					</DialogTitle>
					<DialogDescription className="text-xs text-fog mt-1">
						Daftar seluruh transaksi pembayaran dan status faktur akunmu.
					</DialogDescription>
				</DialogHeader>

				{/* Status filter bar */}
				<div className="shrink-0 pt-3 pb-1 flex flex-wrap gap-1.5 items-center">
					{STATUS_FILTERS.map((f) => {
						const isSelected = statusFilter === f.id;
						return (
							<button
								key={f.id}
								type="button"
								onClick={() => handleFilterChange(f.id)}
								className={`min-h-9 rounded-md px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo ${
									isSelected
										? "bg-snow text-onyx shadow-sm"
										: "border border-graphite bg-charcoal/60 text-fog hover:border-fog/40 hover:text-snow"
								}`}
							>
								{f.label}
							</button>
						);
					})}
				</div>

				{/* Transactions content area */}
				<div className="flex-1 min-h-[240px] overflow-y-auto py-2">
					{loading && !result ? (
						<div
							data-testid="payment-history-loading"
							className="py-16 flex flex-col items-center justify-center gap-2 text-sm text-fog"
						>
							<Icon
								icon={RefreshIcon}
								size={20}
								className="animate-spin text-mist"
							/>
							<span>Memuat riwayat pembayaran...</span>
						</div>
					) : error ? (
						<div
							data-testid="payment-history-error"
							className="py-12 flex flex-col items-center justify-center gap-3 text-center"
						>
							<Icon icon={Alert01Icon} size={28} className="text-rose-400" />
							<p className="text-sm text-fog max-w-sm">{error}</p>
							<button
								type="button"
								onClick={() => fetchHistory(page, statusFilter)}
								className="min-h-10 rounded-md border border-graphite bg-charcoal px-4 text-xs font-medium text-snow hover:bg-white/5"
							>
								Coba Lagi
							</button>
						</div>
					) : result && result.items.length === 0 ? (
						<div
							data-testid="payment-history-empty"
							className="py-16 text-center text-sm text-fog"
						>
							Tidak ada transaksi yang ditemukan.
						</div>
					) : result ? (
						<div className="divide-y divide-graphite/40">
							{result.items.map((item) => {
								const statusInfo = getPaymentStatusInfo(item.status);
								return (
									<div
										key={item.id}
										className="flex items-center justify-between py-3.5 text-sm"
									>
										<div className="min-w-0 pr-3">
											<div className="flex items-center gap-2">
												<span className="font-medium text-snow">
													{formatCurrency(item.amount)}
												</span>
												{item.plan && (
													<span className="rounded bg-graphite/40 px-1.5 py-0.5 text-[10px] font-mono uppercase text-fog">
														{item.plan}
													</span>
												)}
											</div>
											<div className="mt-0.5 text-xs text-fog">
												{item.createdAt ? formatDateTime(item.createdAt) : "—"}
											</div>
										</div>
										<div className="shrink-0">
											<span
												className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusInfo.className}`}
											>
												{statusInfo.label}
											</span>
										</div>
									</div>
								);
							})}
						</div>
					) : null}
				</div>

				{/* Bounded pagination footer */}
				{result && (
					<div className="shrink-0 flex items-center justify-between border-t border-graphite/40 pt-4">
						<button
							type="button"
							onClick={() => setPage((p) => Math.max(1, p - 1))}
							disabled={page <= 1 || loading}
							className="min-h-11 inline-flex items-center gap-1.5 rounded-md border border-graphite bg-charcoal px-3 text-xs font-medium text-snow transition-colors hover:border-fog/40 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
						>
							<Icon icon={ArrowLeft01Icon} size={14} />
							<span>Sebelumnya</span>
						</button>

						<span className="text-xs text-fog tabular-nums">
							Halaman {page} dari {totalPages}
						</span>

						<button
							type="button"
							onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
							disabled={page >= totalPages || loading}
							className="min-h-11 inline-flex items-center gap-1.5 rounded-md border border-graphite bg-charcoal px-3 text-xs font-medium text-snow transition-colors hover:border-fog/40 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
						>
							<span>Selanjutnya</span>
							<Icon icon={ArrowRight01Icon} size={14} />
						</button>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}
