"use client";

import {
	ArrowLeft01Icon,
	CrownIcon,
	Search01Icon,
	Shield01Icon,
	UserCheck01Icon,
	UserGroupIcon,
} from "@hugeicons/core-free-icons";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { useUIStore } from "@/store";
import type {
	AdminUserRow,
	AdminUserStats,
	AdminUsersListResult,
	AdminUsersSearchParams,
} from "../types";
import { AdminMetricCard } from "./admin-metric-card";
import { AdminPagination } from "./admin-pagination";
import { AdminUserRowItem } from "./admin-user-row";

export interface AdminUsersViewProps {
	usersResult?: AdminUsersListResult;
	rows?: AdminUserRow[];
	stats?: AdminUserStats;
	currentUserId: string;
	searchParams?: AdminUsersSearchParams;
}

export function AdminUsersView({
	usersResult,
	rows: fallbackRows,
	stats,
	currentUserId,
	searchParams,
}: AdminUsersViewProps) {
	const navigate = useNavigate();
	const router = useRouter();

	const initialSearch = searchParams?.search ?? "";
	const [search, setSearch] = useState(initialSearch);
	const [clientPage, setClientPage] = useState(1);
	const [clientPageSize, setClientPageSize] = useState(20);
	const [clientPlan, setClientPlan] = useState<string>("all");
	const [loadingAction, setLoadingAction] = useState<string | null>(null);
	const showToast = useUIStore((s) => s.showToast);

	const isMutating = loadingAction !== null;

	// Synchronize local search if URL search param updates from outside
	useEffect(() => {
		if (searchParams?.search !== undefined && searchParams.search !== search) {
			setSearch(searchParams.search);
		}
	}, [searchParams?.search, search]);

	// Debounce search update (300ms) to trigger server-side query without typing lag
	const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
	useEffect(() => {
		if (!navigate) return;
		const trimmed = search.trim();
		if (trimmed === (searchParams?.search ?? "")) return;

		clearTimeout(searchTimeoutRef.current ?? undefined);

		searchTimeoutRef.current = setTimeout(() => {
			void navigate({
				to: "/admin/users",
				search: {
					page: 1,
					pageSize: searchParams?.pageSize ?? 20,
					search: trimmed,
					plan: searchParams?.plan ?? "all",
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
		searchParams?.plan,
		navigate,
	]);

	const activePlan = searchParams?.plan ?? clientPlan;

	const handlePlanChange = (p: "all" | "free" | "pro" | "hengker") => {
		if (navigate) {
			void navigate({
				to: "/admin/users",
				search: {
					page: 1,
					pageSize: searchParams?.pageSize ?? 20,
					search: searchParams?.search ?? "",
					plan: p,
				},
			});
		} else {
			setClientPlan(p);
			setClientPage(1);
		}
	};

	const handlePageChange = (nextPage: number) => {
		if (navigate) {
			void navigate({
				to: "/admin/users",
				search: {
					page: nextPage,
					pageSize: searchParams?.pageSize ?? 20,
					search: searchParams?.search ?? "",
					plan: searchParams?.plan ?? "all",
				},
			});
		} else {
			setClientPage(nextPage);
		}
	};

	const handlePageSizeChange = (nextPageSize: number) => {
		if (navigate) {
			void navigate({
				to: "/admin/users",
				search: {
					page: 1,
					pageSize: nextPageSize,
					search: searchParams?.search ?? "",
					plan: searchParams?.plan ?? "all",
				},
			});
		} else {
			setClientPageSize(nextPageSize);
			setClientPage(1);
		}
	};

	const handleAction = async (actionName: string, fn: () => Promise<void>) => {
		setLoadingAction(actionName);
		try {
			await fn();
			showToast("Aksi berhasil dijalankan", "success");
			if (router) {
				await router.invalidate();
			}
		} catch (err) {
			console.error(err);
			showToast("Gagal menjalankan aksi", "error");
		} finally {
			setLoadingAction(null);
		}
	};

	// Determine rows, totalCount, and pagination data
	let displayedRows: AdminUserRow[] = [];
	let totalCount = 0;
	let page = 1;
	let pageSize = 20;
	let totalPages = 1;

	if (usersResult) {
		displayedRows = usersResult.rows;
		totalCount = usersResult.totalCount;
		page = usersResult.page;
		pageSize = usersResult.pageSize;
		totalPages = usersResult.totalPages;
	} else {
		// Client-side fallback if rendered without server usersResult
		const sourceRows = fallbackRows ?? [];
		const filtered = sourceRows.filter(({ user, sub }) => {
			const q = search.toLowerCase();
			const matchesSearch =
				!search ||
				user.email.toLowerCase().includes(q) ||
				user.name?.toLowerCase().includes(q);
			const matchesPlan =
				activePlan === "all" || (sub?.plan ?? "free") === activePlan;
			return matchesSearch && matchesPlan;
		});
		totalCount = filtered.length;
		page = clientPage;
		pageSize = clientPageSize;
		totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
		const offset = (page - 1) * pageSize;
		displayedRows = filtered.slice(offset, offset + pageSize);
	}

	// Calculate accurate KPI values (preferring server aggregated stats)
	const allFallbackRows = fallbackRows ?? usersResult?.rows ?? [];
	const freeCount =
		stats?.freeCount ??
		allFallbackRows.filter((r) => (r.sub?.plan ?? "free") === "free").length;
	const proCount =
		stats?.proCount ??
		allFallbackRows.filter((r) => r.sub?.plan === "pro").length;
	const hengkerCount =
		stats?.hengkerCount ??
		allFallbackRows.filter((r) => r.sub?.plan === "hengker").length;
	const adminCount =
		stats?.adminCount ??
		allFallbackRows.filter(
			(r) => Boolean(r.user.isAdmin) || r.user.role === "admin",
		).length;
	const totalUsers = stats?.totalUsers ?? totalCount;

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
				<h1 className="text-2xl font-[510] text-snow">Manajemen Pengguna</h1>
				<p className="mt-1 text-sm text-fog">
					Kelola hak akses, status paket langganan, dan batasan akun pengguna.
				</p>
			</header>

			{/* Accurate Metric Summary Bar */}
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
				<AdminMetricCard
					label="Total Pengguna"
					value={totalUsers}
					subtext="Akun pengguna terdaftar"
					icon={UserGroupIcon}
				/>
				<AdminMetricCard
					label="Paket Free"
					value={freeCount}
					subtext="Pengguna tier gratis"
					icon={UserGroupIcon}
				/>
				<AdminMetricCard
					label="Paket Pro"
					value={proCount}
					subtext="Pengguna paket Pro"
					icon={UserCheck01Icon}
				/>
				<AdminMetricCard
					label="Paket Hengker"
					value={hengkerCount}
					subtext="Pengguna tier tertinggi"
					icon={CrownIcon}
				/>
				<AdminMetricCard
					label="Administrator"
					value={adminCount}
					subtext="Akses penuh ke sistem"
					icon={Shield01Icon}
				/>
			</div>

			{/* Filters & Page Size Controls */}
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
						placeholder="Cari email atau nama pengguna..."
						className="w-full rounded-lg border border-graphite bg-charcoal py-2 pl-9 pr-4 text-xs font-inter text-snow placeholder:text-fog/60 focus:border-fog/40 focus:outline-none"
					/>
				</div>

				<div className="flex flex-wrap items-center gap-2">
					<div className="flex gap-1.5 overflow-x-auto">
						{(["all", "free", "pro", "hengker"] as const).map((p) => (
							<button
								key={p}
								type="button"
								onClick={() => handlePlanChange(p)}
								className={`rounded-md px-3 py-1.5 text-xs font-[510] capitalize transition-colors ${
									activePlan === p
										? "bg-snow text-onyx font-semibold"
										: "border border-graphite bg-charcoal text-fog hover:border-fog/40 hover:text-snow"
								}`}
							>
								{p === "all" ? "Semua Paket" : p}
							</button>
						))}
					</div>

					<div className="flex items-center gap-1.5">
						<select
							value={pageSize}
							onChange={(e) => handlePageSizeChange(Number(e.target.value))}
							aria-label="Baris per halaman"
							className="rounded-md border border-graphite bg-charcoal px-2.5 py-1.5 text-xs font-[510] text-snow focus:border-fog/40 focus:outline-none"
						>
							{[10, 20, 50, 100].map((size) => (
								<option key={size} value={size}>
									{size} / halaman
								</option>
							))}
						</select>
					</div>
				</div>
			</div>

			{/* Users Table */}
			<div className="overflow-x-auto rounded-xl border border-graphite bg-charcoal shadow-[var(--shadow-inset)]">
				<table className="w-full text-left text-xs font-inter">
					<thead>
						<tr className="border-b border-graphite bg-obsidian text-fog">
							<th className="px-4 py-3.5 font-[510]">Pengguna</th>
							<th className="px-4 py-3.5 font-[510]">Paket</th>
							<th className="px-4 py-3.5 font-[510]">Kredit</th>
							<th className="px-4 py-3.5 font-[510]">Hak Akses</th>
							<th className="px-4 py-3.5 font-[510]">Status</th>
							<th className="px-4 py-3.5 font-[510] text-right">Aksi</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-graphite">
						{displayedRows.length === 0 ? (
							<tr>
								<td colSpan={6} className="py-12 text-center text-fog">
									Tidak ada pengguna yang ditemukan.
								</td>
							</tr>
						) : (
							displayedRows.map(({ user, sub }) => (
								<AdminUserRowItem
									key={user.id}
									user={user}
									sub={sub}
									currentUserId={currentUserId}
									isMutating={isMutating}
									onAction={handleAction}
								/>
							))
						)}
					</tbody>
				</table>

				<AdminPagination
					page={page}
					pageSize={pageSize}
					totalCount={totalCount}
					totalPages={totalPages}
					onPageChange={handlePageChange}
					onPageSizeChange={handlePageSizeChange}
					entityName="pengguna"
				/>
			</div>
		</div>
	);
}
