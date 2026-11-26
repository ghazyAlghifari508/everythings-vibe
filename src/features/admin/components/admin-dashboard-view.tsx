"use client";

import {
	ArrowLeft01Icon,
	ArrowUpRight01Icon,
	CheckmarkCircle02Icon,
	Coins01Icon,
	CreditCardIcon,
	Layers01Icon,
	UserGroupIcon,
} from "@hugeicons/core-free-icons";
import { Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";
import {
	ADMIN_DASHBOARD_CREDIT_WINDOW_DAYS,
	ADMIN_DASHBOARD_TREND_DAYS,
} from "@/lib/constants";
import { getAdminTrendMetrics } from "../services";
import type { AdminDashboardMetrics, DailyTrendPoint } from "../types";
import { AdminCreditBreakdownChart } from "./admin-credit-breakdown-chart";
import { AdminDashboardActivity } from "./admin-dashboard-activity";
import { AdminMetricCard } from "./admin-metric-card";
import { TrendLineChart } from "./trend-line-chart";

function formatDay(dateKey: string): string {
	const [year, month, day] = dateKey.split("-");
	if (!year || !month || !day) return dateKey;
	return `${Number(day)}/${Number(month)}`;
}

export function AdminDashboardView({
	metrics,
}: {
	metrics: AdminDashboardMetrics;
}) {
	const [trendData, setTrendData] = useState<DailyTrendPoint[]>(
		metrics.trendData || [],
	);
	const [trendDays, setTrendDays] = useState<number>(
		ADMIN_DASHBOARD_TREND_DAYS,
	);
	const [isLoadingTrend, setIsLoadingTrend] = useState<boolean>(false);
	const [trendError, setTrendError] = useState<boolean>(false);

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
	const documentTaskCount =
		(metrics.prdCount ?? 0) +
		(metrics.acCount ?? 0) +
		(metrics.tasksCount ?? 0);
	const windowLabel = `${formatDay(metrics.creditWindowStart)} sampai ${formatDay(metrics.creditWindowEnd)}`;

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
					Ringkasan Platform
				</h1>
				<p className="mt-1 text-sm text-fog">
					Ringkasan pengguna, pendapatan, kredit, dan operasi berhasil di semua
					produk.
				</p>
			</header>

			{/* Primary KPI row */}
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<AdminMetricCard
					label="Total Pengguna"
					value={metrics.usersCount}
					subtext={`${hengkerCount} Hengker, ${proCount} Pro`}
					icon={UserGroupIcon}
				/>
				<AdminMetricCard
					label="Pendapatan Bulan Ini"
					value={metrics.currentMonthRevenue}
					subtext="Pembayaran sukses bulan ini"
					icon={CreditCardIcon}
					isCurrency={true}
				/>
				<AdminMetricCard
					label="Kredit Terpakai"
					value={metrics.settledCreditsUsed}
					subtext={`Debit buku besar, ${windowLabel}`}
					icon={Coins01Icon}
				/>
				<AdminMetricCard
					label="Operasi Berhasil"
					value={metrics.successfulOperations}
					subtext={`${metrics.partialOperations} sebagian, retry tidak dihitung`}
					icon={CheckmarkCircle02Icon}
				/>
			</div>

			{/* Supporting operational summary, kept out of the primary KPI row */}
			<section
				aria-label="Ringkasan operasional"
				className="grid grid-cols-1 divide-y divide-graphite rounded-xl border border-graphite bg-charcoal/60 sm:grid-cols-3 sm:divide-x sm:divide-y-0 shadow-[var(--shadow-inset)]"
			>
				<Link
					to="/admin/feedback"
					className="flex min-h-11 items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-white/[0.02] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-fog/40"
				>
					<div className="min-w-0">
						<p className="text-xs font-medium text-mist">Tiket aktif</p>
						<p className="mt-1 text-lg font-light text-snow">
							{metrics.activeTicketsCount}
						</p>
						<p className="truncate text-[11px] text-fog">
							{metrics.activeFeedbackCount} saran, {metrics.activeErrorCount}{" "}
							error
						</p>
					</div>
					<Icon icon={ArrowUpRight01Icon} size={16} className="text-fog" />
				</Link>
				<Link
					to="/admin/projects"
					className="flex min-h-11 items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-white/[0.02] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-fog/40"
				>
					<div className="min-w-0">
						<p className="text-xs font-medium text-mist">Proyek aktif</p>
						<p className="mt-1 text-lg font-light text-snow">
							{metrics.activeProjectsCount}
						</p>
						<p className="truncate text-[11px] text-fog">
							Proyek terhapus tidak dihitung
						</p>
					</div>
					<Icon icon={ArrowUpRight01Icon} size={16} className="text-fog" />
				</Link>
				<div className="flex items-center justify-between gap-3 px-4 py-3">
					<div className="min-w-0">
						<p className="text-xs font-medium text-mist">Dokumen &amp; Task</p>
						<p className="mt-1 text-lg font-light text-snow">
							{documentTaskCount}
						</p>
						<p className="truncate text-[11px] text-fog">
							{metrics.prdCount} PRD, {metrics.acCount} AC, {metrics.tasksCount}{" "}
							Task
						</p>
					</div>
					<Icon icon={Layers01Icon} size={16} className="text-fog" />
				</div>
			</section>

			{/* Trend line chart */}
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

			{/* Credit usage per product family, reusing the Kredit page primitive */}
			<section className="space-y-2">
				<AdminCreditBreakdownChart
					items={metrics.creditBreakdown}
					periodLabel={`${ADMIN_DASHBOARD_CREDIT_WINDOW_DAYS} hari`}
				/>
				<div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-fog">
					<span>Jendela {windowLabel}</span>
					<Link
						to="/admin/credit"
						search={{
							tab: "usage",
							page: 1,
							pageSize: 20,
							from: metrics.creditWindowStart,
							to: metrics.creditWindowEnd,
							product: "all",
							operation: "all",
							status: "all",
							search: "",
							fundingSource: "all",
						}}
						className="inline-flex min-h-11 items-center gap-1.5 font-medium text-fog transition-colors hover:text-snow"
					>
						Lihat rincian kredit
						<Icon icon={ArrowUpRight01Icon} size={14} />
					</Link>
				</div>
			</section>

			<AdminDashboardActivity metrics={metrics} />
		</div>
	);
}
