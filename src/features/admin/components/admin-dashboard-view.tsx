"use client";

import {
	ArrowLeft01Icon,
	ArrowUpRight01Icon,
	BubbleChatIcon,
	CreditCardIcon,
	GitBranchIcon,
	Layers01Icon,
	UserGroupIcon,
} from "@hugeicons/core-free-icons";
import { Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { StatusIndicator } from "@/components/ui/status-indicator";
import { getPaymentStatusInfo } from "@/features/billing/utils/payment-status";
import { formatCurrency } from "@/lib/utils";
import { getAdminTrendMetrics } from "../services";
import type { AdminDashboardMetrics, DailyTrendPoint } from "../types";
import { AdminMetricCard } from "./admin-metric-card";
import { TrendLineChart } from "./trend-line-chart";

function PaymentStatusLabel({ status }: { status: string }) {
	const info = getPaymentStatusInfo(status);
	return (
		<StatusIndicator tone={info.tone} icon={info.icon}>
			{info.label}
		</StatusIndicator>
	);
}

function PlanBadge({ plan }: { plan: string }) {
	const labels: Record<string, string> = {
		hengker: "Hengker",
		pro: "Pro",
	};
	return <Badge>{labels[plan.toLowerCase()] ?? plan}</Badge>;
}

function StepBadge({ step }: { step: string | null }) {
	const labels: Record<string, string> = {
		idea: "Ide",
		questions: "Tanya Jawab",
		prd: "PRD",
		ac: "AC",
		kanban: "Kanban",
	};
	const value = (step ?? "draft").toLowerCase();
	return <Badge>{labels[value] ?? value}</Badge>;
}

function formatShortDate(date: Date | string | null | undefined): string {
	if (!date) return "-";
	const d = new Date(date);
	return d.toLocaleDateString("id-ID", {
		day: "numeric",
		month: "short",
		hour: "2-digit",
		minute: "2-digit",
	});
}

export function AdminDashboardView({
	metrics,
}: {
	metrics: AdminDashboardMetrics;
}) {
	const [trendData, setTrendData] = useState<DailyTrendPoint[]>(
		metrics.trendData || [],
	);
	const [isLoadingTrend, setIsLoadingTrend] = useState<boolean>(false);
	const [trendError, setTrendError] = useState<boolean>(false);
	const [trendDays, setTrendDays] = useState<number>(7);
	const trendRequestRef = useRef(0);

	const handleRangeChange = async (days: number) => {
		const requestId = ++trendRequestRef.current;
		setIsLoadingTrend(true);
		setTrendError(false);
		try {
			const res = await getAdminTrendMetrics({ data: { days } });
			if (requestId === trendRequestRef.current) {
				setTrendData(res);
				setTrendDays(days);
			}
		} catch (err) {
			console.error("Failed to fetch trend data:", err);
			if (requestId === trendRequestRef.current) {
				setTrendError(true);
			}
		} finally {
			if (requestId === trendRequestRef.current) {
				setIsLoadingTrend(false);
			}
		}
	};

	const hengkerCount =
		metrics.planDistribution?.find((p) => p.plan === "hengker")?.count ?? 0;
	const proCount =
		metrics.planDistribution?.find((p) => p.plan === "pro")?.count ?? 0;
	const totalPipelineOutputs =
		(metrics.prdCount ?? 0) +
		(metrics.acCount ?? 0) +
		(metrics.tasksCount ?? 0);
	const openTicketsCount =
		(metrics.feedbackCount ?? 0) + (metrics.errorCount ?? 0);

	return (
		<div className="mx-auto max-w-7xl space-y-8 font-inter">
			{/* Quick Workspace Back Link */}
			<div className="flex items-center">
				<Link
					to="/"
					className="inline-flex items-center gap-1.5 text-xs font-[510] text-fog transition-colors hover:text-snow"
				>
					<Icon icon={ArrowLeft01Icon} size={14} />
					<span>Kembali ke Workspace</span>
				</Link>
			</div>

			{/* Page Header */}
			<header className="border-b border-graphite pb-6">
				<h1 className="font-inter text-2xl font-[510] text-snow">
					System Overview
				</h1>
				<p className="mt-1 text-sm text-fog">
					Metrik real-time pengguna, aktivitas pipeline AI, dan performa
					finansial platform.
				</p>
			</header>

			{/* 5 Key Metric Cards */}
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
				<AdminMetricCard
					label="Total Pengguna"
					value={metrics.usersCount}
					subtext={`${hengkerCount} Hengker, ${proCount} Pro`}
					icon={UserGroupIcon}
				/>
				<AdminMetricCard
					label="Status Pipeline"
					value={totalPipelineOutputs}
					subtext={`${metrics.prdCount} PRD, ${metrics.acCount} AC, ${metrics.tasksCount} Task`}
					icon={Layers01Icon}
				/>
				<AdminMetricCard
					label="Proyek Siap"
					value={metrics.projectsCount}
					subtext="Proyek ide produk aktif"
					icon={GitBranchIcon}
				/>
				<AdminMetricCard
					label="Tiket Terbuka"
					value={openTicketsCount}
					subtext={`${metrics.feedbackCount} Saran, ${metrics.errorCount} Error`}
					icon={BubbleChatIcon}
				/>
				<AdminMetricCard
					label="Pendapatan Bulan Ini"
					value={metrics.currentMonthRevenue}
					subtext="Total pembayaran sukses bulan ini"
					icon={CreditCardIcon}
					isCurrency={true}
				/>
			</div>

			{/* Trend Line Chart Section */}
			<section className="relative">
				<TrendLineChart
					initialData={metrics.trendData}
					data={trendData}
					onRangeChange={handleRangeChange}
					className={
						isLoadingTrend
							? "opacity-70 transition-opacity"
							: "transition-opacity"
					}
				/>
				{isLoadingTrend && (
					<div className="absolute right-6 top-6 flex items-center gap-2 rounded-full border border-graphite bg-obsidian/80 px-3 py-1 text-[11px] text-fog backdrop-blur">
						<span className="h-1.5 w-1.5 animate-ping rounded-full bg-emerald-400" />
						Memperbarui grafik...
					</div>
				)}
				{trendError && !isLoadingTrend && (
					<div className="absolute right-6 top-6 flex items-center gap-2 rounded-full border border-graphite bg-obsidian/80 px-3 py-1 text-[11px] text-snow backdrop-blur">
						Gagal memuat rentang grafik.
						<button
							type="button"
							onClick={() => handleRangeChange(trendDays)}
							className="font-[510] text-snow underline underline-offset-2 hover:text-mist"
						>
							Coba lagi
						</button>
					</div>
				)}
			</section>

			{/* Bottom Two-Column Activity Cards */}
			<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
				{/* Card 1: Transaksi Booster Terbaru */}
				<section className="flex flex-col justify-between rounded-xl border border-graphite bg-charcoal p-5 sm:p-6 shadow-[var(--shadow-inset)]">
					<div>
						<div className="mb-4 flex items-center justify-between">
							<div>
								<h2 className="text-base font-[510] text-snow">
									Transaksi Booster Terbaru
								</h2>
								<p className="text-xs text-fog">
									Riwayat pesanan kredit & paket Mayar / Midtrans
								</p>
							</div>
							<Link
								to="/admin/transactions"
								className="text-xs font-medium text-fog hover:text-snow transition-colors"
							>
								Lihat Semua
							</Link>
						</div>

						{!metrics.recentTransactions ||
						metrics.recentTransactions.length === 0 ? (
							<div className="py-12 text-center text-xs text-fog">
								Belum ada transaksi booster tercatat.
							</div>
						) : (
							<div className="divide-y divide-graphite rounded-lg border border-graphite bg-obsidian">
								{metrics.recentTransactions.map((tx) => (
									<div
										key={tx.id}
										className="flex flex-col gap-2 p-3.5 sm:flex-row sm:items-center sm:justify-between transition-colors hover:bg-white/[0.02]"
									>
										<div className="min-w-0 flex-1 pr-2">
											<div className="flex items-center gap-2">
												<span className="font-mono text-xs font-medium text-snow">
													{tx.orderId}
												</span>
												<PlanBadge plan={tx.plan} />
											</div>
											<p className="mt-1 truncate text-xs text-fog">
												{tx.userName || tx.userEmail || "Anonymous"}
											</p>
											<p className="truncate text-xs text-fog">
												{formatShortDate(tx.createdAt)}
											</p>
										</div>

										<div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
											<PaymentStatusLabel status={tx.status} />
											<span className="font-mono text-xs font-medium text-snow">
												{formatCurrency(tx.amount)}
											</span>
										</div>
									</div>
								))}
							</div>
						)}
					</div>
				</section>

				{/* Card 2: Proyek Terbaru */}
				<section className="flex flex-col justify-between rounded-xl border border-graphite bg-charcoal p-5 sm:p-6 shadow-[var(--shadow-inset)]">
					<div>
						<div className="mb-4 flex items-center justify-between">
							<div>
								<h2 className="text-base font-[510] text-snow">
									Proyek Terbaru
								</h2>
								<p className="text-xs text-fog">
									Aktivitas pembuatan proyek paling akhir
								</p>
							</div>
							<Link
								to="/admin/projects"
								className="text-xs font-medium text-fog hover:text-snow transition-colors"
							>
								Kelola Proyek
							</Link>
						</div>

						{!metrics.recentProjects || metrics.recentProjects.length === 0 ? (
							<div className="py-12 text-center text-xs text-fog">
								Belum ada proyek yang dibuat.
							</div>
						) : (
							<div className="divide-y divide-graphite rounded-lg border border-graphite bg-obsidian">
								{metrics.recentProjects.map((p) => (
									<div
										key={p.id}
										className="flex items-center justify-between p-3.5 transition-colors hover:bg-white/[0.02]"
									>
										<div className="min-w-0 flex-1 pr-3">
											<p className="truncate text-sm font-[510] text-snow">
												{p.name}
											</p>
											<p className="mt-0.5 truncate text-xs text-fog">
												{p.userName || p.userEmail}
											</p>
											<p className="truncate text-xs text-fog">
												{formatShortDate(p.createdAt)}
											</p>
										</div>

										<div className="flex items-center gap-2.5 shrink-0">
											<StepBadge step={p.step} />
											<Link
												to="/prd/$id"
												params={{ id: p.id }}
												className="rounded p-1 text-fog hover:bg-white/5 hover:text-snow transition-colors"
												title="Buka proyek"
											>
												<Icon icon={ArrowUpRight01Icon} size={16} />
											</Link>
										</div>
									</div>
								))}
							</div>
						)}
					</div>
				</section>
			</div>
		</div>
	);
}
