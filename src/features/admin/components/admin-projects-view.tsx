"use client";

import {
	ArrowLeft01Icon,
	File02Icon,
	GitBranchIcon,
	LinkSquare02Icon,
	Search01Icon,
	ShieldCheckIcon,
	Task01Icon,
} from "@hugeicons/core-free-icons";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import type { AdminProjectItem } from "../types";
import { AdminMetricCard } from "./admin-metric-card";

function getProjectTargetRoute(
	step: string | null | undefined,
): "/prd/$id" | "/ac/$id" | "/task/$id" {
	if (step === "task") return "/task/$id";
	if (step === "ac") return "/ac/$id";
	return "/prd/$id";
}

export function AdminProjectsView({
	projects,
}: {
	projects: AdminProjectItem[];
}) {
	const [search, setSearch] = useState("");
	const [stepFilter, setStepFilter] = useState<string>("all");

	const normalizedProjects = projects.map((p) => ({
		...p,
		step: p.step ?? "prd",
	}));

	const filteredProjects = normalizedProjects.filter(
		(proj: AdminProjectItem) => {
			const q = search.toLowerCase();
			const matchesSearch =
				!search ||
				proj.name.toLowerCase().includes(q) ||
				proj.description?.toLowerCase().includes(q) ||
				proj.userName?.toLowerCase().includes(q) ||
				proj.userEmail?.toLowerCase().includes(q);

			const matchesStep = stepFilter === "all" || proj.step === stepFilter;

			return matchesSearch && matchesStep;
		},
	);

	const prdCount = normalizedProjects.filter((p) => p.step === "prd").length;
	const acCount = normalizedProjects.filter((p) => p.step === "ac").length;
	const taskCount = normalizedProjects.filter((p) => p.step === "task").length;

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
					value={projects.length}
					subtext="Proyek dibuat di workspace"
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

			{/* Filters */}
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
							onClick={() => setStepFilter(tab.id)}
							className={`rounded-md px-3 py-1.5 text-xs font-[510] transition-colors ${
								stepFilter === tab.id
									? "bg-snow text-onyx shadow-sm"
									: "text-fog hover:text-snow"
							}`}
						>
							{tab.label}
						</button>
					))}
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
							{filteredProjects.length === 0 ? (
								<tr>
									<td
										colSpan={6}
										className="px-5 py-10 text-center text-sm text-fog"
									>
										Tidak ada proyek yang cocok dengan filter pencarian.
									</td>
								</tr>
							) : (
								filteredProjects.map((proj: AdminProjectItem) => {
									const stepBadgeColor =
										proj.step === "task"
											? "bg-indigo-500/10 text-indigo-300 border-indigo-500/20"
											: proj.step === "ac"
												? "bg-purple-500/10 text-purple-300 border-purple-500/20"
												: "bg-blue-500/10 text-blue-300 border-blue-500/20";

									return (
										<tr
											key={proj.id}
											className="transition-colors hover:bg-white/[0.02]"
										>
											<td className="px-5 py-3.5">
												<div className="font-medium text-snow">{proj.name}</div>
												{proj.description && (
													<div className="mt-0.5 line-clamp-1 max-w-xs text-[11px] text-fog">
														{proj.description}
													</div>
												)}
											</td>
											<td className="px-5 py-3.5">
												<div className="font-medium text-snow">
													{proj.userName ?? "Tanpa Nama"}
												</div>
												<div className="text-[11px] text-fog">
													{proj.userEmail ?? "-"}
												</div>
											</td>
											<td className="px-5 py-3.5">
												<span
													className={`inline-flex items-center rounded border px-2 py-0.5 text-[10px] font-semibold uppercase ${stepBadgeColor}`}
												>
													{proj.step ?? "PRD"}
												</span>
											</td>
											<td className="px-5 py-3.5">
												<span className="inline-flex items-center rounded bg-white/5 px-2 py-0.5 text-[10px] font-medium text-mist capitalize">
													{proj.status ?? "draft"}
												</span>
											</td>
											<td className="px-5 py-3.5 text-fog">
												{proj.createdAt
													? new Intl.DateTimeFormat("id-ID", {
															day: "numeric",
															month: "short",
															year: "numeric",
														}).format(new Date(proj.createdAt))
													: "-"}
											</td>
											<td className="px-5 py-3.5 text-right">
												<Link
													to={getProjectTargetRoute(proj.step)}
													params={{ id: proj.id }}
													className="inline-flex items-center gap-1.5 rounded-md border border-graphite bg-white/5 px-2.5 py-1 text-[11px] font-medium text-snow transition-colors hover:bg-white/10 hover:border-fog/40"
												>
													<span>Buka</span>
													<Icon
														icon={LinkSquare02Icon}
														size={12}
														className="text-fog"
													/>
												</Link>
											</td>
										</tr>
									);
								})
							)}
						</tbody>
					</table>
				</div>
			</div>
		</div>
	);
}
