"use client";

import {
	ArrowLeft01Icon,
	CheckmarkCircle02Icon,
	Clock01Icon,
	CreditCardIcon,
	Search01Icon,
} from "@hugeicons/core-free-icons";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";
import type {
	AdminTransactionItem,
	AdminTransactionStats,
	AdminTransactionsListResult,
	AdminTransactionsSearchParams,
} from "../types";
import {
	calculateFallbackTransactionStats,
	filterTransactionsClient,
} from "../utils/admin-transaction-utils";
import { AdminMetricCard } from "./admin-metric-card";
import { AdminPagination } from "./admin-pagination";
import { AdminTransactionRowItem } from "./admin-transaction-row";

export interface AdminTransactionsViewProps {
	transactionsResult?: AdminTransactionsListResult;
	transactions?: AdminTransactionItem[];
	stats?: AdminTransactionStats;
	searchParams?: Partial<AdminTransactionsSearchParams>;
}

export function AdminTransactionsView({
	transactionsResult,
	transactions: fallbackTransactions,
	stats,
	searchParams,
}: AdminTransactionsViewProps) {
	const navigate = useNavigate();

	const initialSearch = searchParams?.search ?? "";
	const [search, setSearch] = useState(initialSearch);
	const [clientPage, setClientPage] = useState(1);
	const [clientPageSize, setClientPageSize] = useState(20);
	const [clientStatusFilter, setClientStatusFilter] = useState<string>(
		searchParams?.status ?? "all",
	);
	const [clientPlanFilter, setClientPlanFilter] = useState<string>(
		searchParams?.plan ?? "all",
	);

	// Synchronize local search state when URL search param updates from navigation
	const prevSearchParamRef = useRef(searchParams?.search);
	useEffect(() => {
		if (
			searchParams?.search !== undefined &&
			searchParams.search !== prevSearchParamRef.current
		) {
			prevSearchParamRef.current = searchParams.search;
			setSearch(searchParams.search);
		}
	}, [searchParams?.search]);

	// Debounce search update (300ms) to trigger server-side query without typing lag
	const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
	useEffect(() => {
		if (!navigate) return;
		const trimmed = search.trim();
		if (trimmed === (searchParams?.search ?? "")) return;

		clearTimeout(searchTimeoutRef.current ?? undefined);

		searchTimeoutRef.current = setTimeout(() => {
			void navigate({
				to: "/admin/transactions",
				search: {
					page: 1,
					pageSize: searchParams?.pageSize ?? 20,
					search: trimmed,
					status: (searchParams?.status ??
						"all") as AdminTransactionsSearchParams["status"],
					plan: (searchParams?.plan ??
						"all") as AdminTransactionsSearchParams["plan"],
				},
			});
		}, 300);

		return () => {
			clearTimeout(searchTimeoutRef.current ?? undefined);
		};
	}, [
		search,
		searchParams?.search,
		searchParams?.pageSize,
		searchParams?.status,
		searchParams?.plan,
		navigate,
	]);

	const activeStatus = searchParams?.status ?? clientStatusFilter;
	const activePlan = searchParams?.plan ?? clientPlanFilter;

	const handleStatusChange = (status: string) => {
		setClientStatusFilter(status);
		setClientPage(1);
		if (navigate) {
			void navigate({
				to: "/admin/transactions",
				search: {
					page: 1,
					pageSize: searchParams?.pageSize ?? 20,
					search: search.trim(),
					status: status as AdminTransactionsSearchParams["status"],
					plan: activePlan as AdminTransactionsSearchParams["plan"],
				},
			});
		}
	};

	const handlePlanChange = (plan: string) => {
		setClientPlanFilter(plan);
		setClientPage(1);
		if (navigate) {
			void navigate({
				to: "/admin/transactions",
				search: {
					page: 1,
					pageSize: searchParams?.pageSize ?? 20,
					search: search.trim(),
					status: activeStatus as AdminTransactionsSearchParams["status"],
					plan: plan as AdminTransactionsSearchParams["plan"],
				},
			});
		}
	};

	const handlePageChange = (newPage: number) => {
		setClientPage(newPage);
		if (navigate) {
			void navigate({
				to: "/admin/transactions",
				search: {
					page: newPage,
					pageSize: searchParams?.pageSize ?? 20,
					search: search.trim(),
					status: activeStatus as AdminTransactionsSearchParams["status"],
					plan: activePlan as AdminTransactionsSearchParams["plan"],
				},
			});
		}
	};

	const handlePageSizeChange = (newPageSize: number) => {
		setClientPageSize(newPageSize);
		setClientPage(1);
		if (navigate) {
			void navigate({
				to: "/admin/transactions",
				search: {
					page: 1,
					pageSize: newPageSize,
					search: search.trim(),
					status: activeStatus as AdminTransactionsSearchParams["status"],
					plan: activePlan as AdminTransactionsSearchParams["plan"],
				},
			});
		}
	};

	// Determine rows, totalCount, and pagination data
	let displayedTransactions: AdminTransactionItem[] = [];
	let totalCount = 0;
	let page = 1;
	let pageSize = 20;
	let totalPages = 1;

	if (transactionsResult) {
		displayedTransactions = transactionsResult.transactions;
		totalCount = transactionsResult.totalCount;
		page = transactionsResult.page;
		pageSize = transactionsResult.pageSize;
		totalPages = transactionsResult.totalPages;
	} else {
		const filtered = filterTransactionsClient(
			fallbackTransactions ?? [],
			search,
			activeStatus,
			activePlan,
		);
		totalCount = filtered.length;
		page = clientPage;
		pageSize = clientPageSize;
		totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
		const offset = (page - 1) * pageSize;
		displayedTransactions = filtered.slice(offset, offset + pageSize);
	}

	// Calculate accurate KPI values (preferring server aggregated stats)
	const allFallbackRows =
		fallbackTransactions ?? transactionsResult?.transactions ?? [];
	const fallbackStats = calculateFallbackTransactionStats(
		allFallbackRows,
		totalCount,
	);

	const totalTransactionsCount = stats?.totalTransactions ?? totalCount;
	const successCount = stats?.successCount ?? fallbackStats.successCount;
	const pendingCount = stats?.pendingCount ?? fallbackStats.pendingCount;
	const totalRevenue = stats?.totalRevenue ?? fallbackStats.totalRevenue;

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

			{/* Header */}
			<header className="border-b border-graphite pb-6">
				<h1 className="text-2xl font-[510] text-snow">
					Transaksi Booster & Langganan
				</h1>
				<p className="mt-1 text-sm text-fog">
					Kelola riwayat pesanan kredit booster, status pembayaran Midtrans /
					Mayar, dan performa finansial.
				</p>
			</header>

			{/* Metric Summary Bar */}
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<AdminMetricCard
					label="Total Transaksi"
					value={totalTransactionsCount}
					subtext="Pesanan tercatat di sistem"
					icon={CreditCardIcon}
				/>
				<AdminMetricCard
					label="Transaksi Sukses"
					value={successCount}
					subtext="Berhasil terbayar"
					icon={CheckmarkCircle02Icon}
				/>
				<AdminMetricCard
					label="Menunggu Pembayaran"
					value={pendingCount}
					subtext="Status pending di payment gateway"
					icon={Clock01Icon}
				/>
				<AdminMetricCard
					label="Total Penerimaan"
					value={totalRevenue}
					subtext="Akumulasi pembayaran sukses"
					icon={CreditCardIcon}
					isCurrency={true}
				/>
			</div>

			{/* Filters & Page Controls Toolbar */}
			<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<div className="relative flex-1 max-w-md">
					<Icon
						icon={Search01Icon}
						size={15}
						className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fog"
					/>
					<input
						type="text"
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						placeholder="Cari order ID, email, atau nama pengguna..."
						className="w-full rounded-lg border border-graphite bg-charcoal py-2 pl-9 pr-4 text-xs font-inter text-snow placeholder:text-fog/60 focus:border-fog/40 focus:outline-none"
					/>
				</div>

				<div className="flex flex-wrap items-center gap-2">
					{/* Status Selector */}
					<div className="flex rounded-lg border border-graphite bg-charcoal p-0.5">
						{(
							[
								{ id: "all", label: "Semua Status" },
								{ id: "success", label: "Sukses" },
								{ id: "pending", label: "Pending" },
								{ id: "expire", label: "Expired" },
							] as const
						).map((tab) => (
							<button
								key={tab.id}
								type="button"
								onClick={() => handleStatusChange(tab.id)}
								className={`rounded-md px-2.5 py-1 text-xs font-[510] transition-colors ${
									activeStatus === tab.id
										? "bg-snow text-onyx shadow-sm"
										: "text-fog hover:text-snow"
								}`}
							>
								{tab.label}
							</button>
						))}
					</div>

					{/* Plan Selector */}
					<div className="flex rounded-lg border border-graphite bg-charcoal p-0.5">
						{(
							[
								{ id: "all", label: "Semua Paket" },
								{ id: "hengker", label: "Hengker" },
								{ id: "pro", label: "Pro" },
								{ id: "topup", label: "Top-up" },
							] as const
						).map((tab) => (
							<button
								key={tab.id}
								type="button"
								onClick={() => handlePlanChange(tab.id)}
								className={`rounded-md px-2.5 py-1 text-xs font-[510] transition-colors ${
									activePlan === tab.id
										? "bg-snow text-onyx shadow-sm"
										: "text-fog hover:text-snow"
								}`}
							>
								{tab.label}
							</button>
						))}
					</div>

					{/* Page Size Selector */}
					<select
						value={pageSize}
						onChange={(e) => handlePageSizeChange(Number(e.target.value))}
						aria-label="Baris per halaman"
						className="rounded-lg border border-graphite bg-charcoal px-2.5 py-1.5 text-xs font-[510] text-snow focus:border-fog/40 focus:outline-none"
					>
						{[10, 20, 50, 100].map((size) => (
							<option key={size} value={size}>
								{size} / halaman
							</option>
						))}
					</select>
				</div>
			</div>

			{/* Transactions Table */}
			<div className="overflow-hidden rounded-xl border border-graphite bg-charcoal shadow-sm">
				<div className="overflow-x-auto">
					<table className="w-full text-left text-xs font-inter min-w-[650px]">
						<thead className="border-b border-graphite bg-obsidian/40 text-fog">
							<tr>
								<th className="px-5 py-3 font-semibold">Order ID</th>
								<th className="px-5 py-3 font-semibold">Pengguna</th>
								<th className="px-5 py-3 font-semibold">Paket</th>
								<th className="px-5 py-3 font-semibold">Nominal</th>
								<th className="px-5 py-3 font-semibold">Status</th>
								<th className="px-5 py-3 font-semibold">Tanggal</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-graphite">
							{displayedTransactions.length === 0 ? (
								<tr>
									<td
										colSpan={6}
										className="px-5 py-10 text-center text-sm text-fog"
									>
										Tidak ada transaksi yang cocok dengan filter pencarian.
									</td>
								</tr>
							) : (
								displayedTransactions.map((tx: AdminTransactionItem) => (
									<AdminTransactionRowItem key={tx.id} tx={tx} />
								))
							)}
						</tbody>
					</table>
				</div>

				{/* Shared Admin Pagination */}
				<AdminPagination
					page={page}
					pageSize={pageSize}
					totalCount={totalCount}
					totalPages={totalPages}
					onPageChange={handlePageChange}
					onPageSizeChange={handlePageSizeChange}
					entityName="transaksi"
				/>
			</div>
		</div>
	);
}
