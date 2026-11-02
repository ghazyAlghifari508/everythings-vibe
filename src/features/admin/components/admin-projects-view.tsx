"use client";

import {
	ArrowLeft01Icon,
	File02Icon,
	GitBranchIcon,
	Search01Icon,
	ShieldCheckIcon,
	Task01Icon,
} from "@hugeicons/core-free-icons";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";
import type {
	AdminProjectItem,
	AdminProjectStats,
	AdminProjectsListResult,
	AdminProjectsSearchParams,
} from "../types";
import { AdminMetricCard } from "./admin-metric-card";
import { AdminPagination } from "./admin-pagination";
import { AdminProjectRowItem } from "./admin-project-row";

export interface AdminProjectsViewProps {
	projectsResult?: AdminProjectsListResult;
	projects?: AdminProjectItem[];
	stats?: AdminProjectStats;
	searchParams?: Partial<AdminProjectsSearchParams>;
}

export function AdminProjectsView({
	projectsResult,
	projects,
	stats,
	searchParams,
}: AdminProjectsViewProps) {
	const navigate = useNavigate();

	const initialSearch = searchParams?.search ?? "";
	const [search, setSearch] = useState(initialSearch);
	const [clientPage, setClientPage] = useState(1);
	const [clientPageSize, setClientPageSize] = useState(20);
	const [clientStep, setClientStep] = useState<string>("all");
	const [clientStatusFilter, setClientStatusFilter] = useState<
		"active" | "deleted" | "all"
	>("active");

	// Synchronize local search state when URL search param updates from navigation
	useEffect(() => {
		if (searchParams?.search !== undefined && searchParams.search !== search) {
			setSearch(searchParams.search);
		}
	}, [searchParams?.search, search]);

	// Debounce search update (300ms) to trigger server query without input lag
	const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
	useEffect(() => {
		if (!navigate) return;
		const trimmed = search.trim();
		if (trimmed === (searchParams?.search ?? "")) return;

		clearTimeout(searchTimeoutRef.current ?? undefined);

		searchTimeoutRef.current = setTimeout(() => {
			void navigate({
				to: "/admin/projects",
				search: {
					page: 1,
					pageSize: searchParams?.pageSize ?? 20,
					search: trimmed,
					step: searchParams?.step ?? "all",
					statusFilter: searchParams?.statusFilter ?? "active",
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
		searchParams?.step,
		searchParams?.statusFilter,
		navigate,
	]);

	const activeStep = searchParams?.step ?? clientStep;
	const activeStatusFilter = searchParams?.statusFilter ?? clientStatusFilter;

	const handleStepChange = (newStep: string) => {
		if (navigate && searchParams) {
			void navigate({
				to: "/admin/projects",
				search: {
					page: 1,
					pageSize: searchParams.pageSize,
					search: searchParams.search,
					step: newStep,
					statusFilter: searchParams.statusFilter,
				},
			});
		} else {
			setClientStep(newStep);
			setClientPage(1);
		}
	};

	const handleStatusFilterChange = (
		newStatus: "active" | "deleted" | "all",
	) => {
		if (navigate && searchParams) {
			void navigate({
				to: "/admin/projects",
				search: {
					page: 1,
					pageSize: searchParams.pageSize,
					search: searchParams.search,
					step: searchParams.step,
					statusFilter: newStatus,
				},
			});
		} else {
			setClientStatusFilter(newStatus);
			setClientPage(1);
		}
	};

	const handlePageChange = (newPage: number) => {
		if (navigate && searchParams) {
			void navigate({
				to: "/admin/projects",
				search: {
					page: newPage,
					pageSize: searchParams.pageSize,
					search: searchParams.search,
					step: searchParams.step,
					statusFilter: searchParams.statusFilter,
				},
			});
		} else {
			setClientPage(newPage);
		}
	};

	const handlePageSizeChange = (newPageSize: number) => {
		if (navigate && searchParams) {
			void navigate({
				to: "/admin/projects",
				search: {
					page: 1,
					pageSize: newPageSize,
					search: searchParams.search,
					step: searchParams.step,
					statusFilter: searchParams.statusFilter,
				},
			});
		} else {
			setClientPageSize(newPageSize);
			setClientPage(1);
		}
	};

	// Determine displayed rows, totalCount, and pagination data
	let displayedProjects: AdminProjectItem[] = [];
	let totalCount = 0;
	let page = 1;
	let pageSize = 20;
	let totalPages = 1;

	if (projectsResult) {
		displayedProjects = projectsResult.projects;
		totalCount = projectsResult.totalCount;
		page = projectsResult.page;
		pageSize = projectsResult.pageSize;
		totalPages = projectsResult.totalPages;
	} else {
		// Client-side fallback if rendered without server projectsResult
		const source = projects ?? [];
		const filtered = source.filter((proj) => {
			const q = search.toLowerCase();
			const matchesSearch =
				!search ||
				proj.name.toLowerCase().includes(q) ||
				proj.description?.toLowerCase().includes(q) ||
				proj.userName?.toLowerCase().includes(q) ||
				proj.userEmail?.toLowerCase().includes(q);

			const projStep = proj.step ?? "prd";
			const matchesStep = activeStep === "all" || projStep === activeStep;

			const isDeleted = proj.deletedAt !== null && proj.deletedAt !== undefined;
			const matchesStatus =
				activeStatusFilter === "all"
					? true
					: activeStatusFilter === "deleted"
						? isDeleted
						: !isDeleted;

			return matchesSearch && matchesStep && matchesStatus;
		});

		totalCount = filtered.length;
		page = clientPage;
		pageSize = clientPageSize;
		totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
		const offset = (page - 1) * pageSize;
		displayedProjects = filtered.slice(offset, offset + pageSize);
	}

	// Calculate accurate KPI values (preferring server aggregated stats)
	const allFallbackProjects = projects ?? projectsResult?.projects ?? [];
	const activeFallbackProjects = allFallbackProjects.filter(
		(p) => !p.deletedAt,
	);
	const totalProjectsCount =
		stats?.totalProjects ?? activeFallbackProjects.length;
	const prdCount =
		stats?.prdCount ??
		activeFallbackProjects.filter((p) => (p.step ?? "prd") === "prd").length;
	const acCount =
		stats?.acCount ??
		activeFallbackProjects.filter((p) => p.step === "ac").length;
	const taskCount =
		stats?.taskCount ??
		activeFallbackProjects.filter((p) => p.step === "task").length;

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
					Manajemen Proyek Pengguna
				</h1>
				<p className="mt-1 text-sm text-fog">
					Pantau seluruh proyek ide produk, tahapan pipeline AI (PRD &rarr; AC
					&rarr; Task), dan status eksekusi.
				</p>
			</header>

			{/* Metric Summary Bar */}
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<AdminMetricCard
					label="Total Proyek"
					value={totalProjectsCount}
					subtext="Proyek aktif di workspace"
					icon={GitBranchIcon}
				/>
				<AdminMetricCard
					label="Tahap PRD"
					value={prdCount}
					subtext="Perancangan spesifikasi produk"
					icon={File02Icon}
				/>
				<AdminMetricCard
					label="Tahap AC"
					value={acCount}
					subtext="Acceptance criteria gherkin"
					icon={ShieldCheckIcon}
				/>
				<AdminMetricCard
					label="Tahap Task / Kanban"
					value={taskCount}
					subtext="Pengerjaan breakdown task"
					icon={Task01Icon}
				/>
			</div>

			{/* Filters & Search Toolbar */}
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
						placeholder="Cari nama proyek, deskripsi, atau pembuat..."
						className="w-full rounded-lg border border-graphite bg-charcoal py-2 pl-9 pr-4 text-xs font-inter text-snow placeholder:text-fog/60 focus:border-fog/40 focus:outline-none"
					/>
				</div>

				<div className="flex flex-wrap items-center gap-2">
					{/* Stage Selector */}
					<div className="flex rounded-lg border border-graphite bg-charcoal p-0.5">
						{(
							[
								{ id: "all", label: "Semua Tahap" },
								{ id: "prd", label: "PRD" },
								{ id: "ac", label: "AC" },
								{ id: "task", label: "Task" },
							] as const
						).map((tab) => (
							<button
								key={tab.id}
								type="button"
								onClick={() => handleStepChange(tab.id)}
								className={`rounded-md px-3 py-1.5 text-xs font-[510] transition-colors ${
									activeStep === tab.id
										? "bg-snow text-onyx shadow-sm"
										: "text-fog hover:text-snow"
								}`}
							>
								{tab.label}
							</button>
						))}
					</div>

					{/* Deletion Audit Filter */}
					<select
						value={activeStatusFilter}
						onChange={(e) =>
							handleStatusFilterChange(
								e.target.value as "active" | "deleted" | "all",
							)
						}
						aria-label="Filter status proyek"
						className="rounded-lg border border-graphite bg-charcoal px-2.5 py-1.5 text-xs font-[510] text-snow focus:border-fog/40 focus:outline-none"
					>
						<option value="active">Aktif</option>
						<option value="deleted">Terhapus</option>
						<option value="all">Semua Status</option>
					</select>

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

			{/* Projects Table */}
			<div className="overflow-hidden rounded-xl border border-graphite bg-charcoal shadow-sm">
				<div className="overflow-x-auto">
					<table className="w-full text-left text-xs font-inter">
						<thead className="border-b border-graphite bg-obsidian/40 text-fog">
							<tr>
								<th className="px-5 py-3 font-semibold">Nama Proyek</th>
								<th className="px-5 py-3 font-semibold">Pemilik Akun</th>
								<th className="px-5 py-3 font-semibold">Tahap</th>
								<th className="px-5 py-3 font-semibold">Status</th>
								<th className="px-5 py-3 font-semibold">Tanggal Dibuat</th>
								<th className="px-5 py-3 font-semibold text-right">Aksi</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-graphite">
							{displayedProjects.length === 0 ? (
								<tr>
									<td
										colSpan={6}
										className="px-5 py-10 text-center text-sm text-fog"
									>
										Tidak ada proyek yang cocok dengan filter pencarian.
									</td>
								</tr>
							) : (
								displayedProjects.map((proj: AdminProjectItem) => (
									<AdminProjectRowItem key={proj.id} proj={proj} />
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
					entityName="proyek"
				/>
			</div>
		</div>
	);
}
