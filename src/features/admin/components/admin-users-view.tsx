"use client";

import {
	ArrowLeft01Icon,
	CrownIcon,
	Search01Icon,
	Shield01Icon,
	UserCheck01Icon,
	UserGroupIcon,
} from "@hugeicons/core-free-icons";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { useUIStore } from "@/store";
import type { AdminUserRow } from "../types";
import { AdminMetricCard } from "./admin-metric-card";
import { AdminUserRowItem } from "./admin-user-row";

export function AdminUsersView({
	rows,
	currentUserId,
}: {
	rows: AdminUserRow[];
	currentUserId: string;
}) {
	const [search, setSearch] = useState("");
	const [planFilter, setPlanFilter] = useState<string>("all");
	const [loadingAction, setLoadingAction] = useState<string | null>(null);
	const showToast = useUIStore((s) => s.showToast);

	const isMutating = loadingAction !== null;

	const handleAction = async (actionName: string, fn: () => Promise<void>) => {
		setLoadingAction(actionName);
		try {
			await fn();
			showToast("Aksi berhasil dijalankan", "success");
			window.location.reload();
		} catch (err) {
			console.error(err);
			showToast("Gagal menjalankan aksi", "error");
		} finally {
			setLoadingAction(null);
		}
	};

	const filteredRows = rows.filter(({ user, sub }) => {
		const matchesSearch =
			!search ||
			user.email.toLowerCase().includes(search.toLowerCase()) ||
			user.name?.toLowerCase().includes(search.toLowerCase());
		const matchesPlan =
			planFilter === "all" || (sub?.plan ?? "free") === planFilter;
		return matchesSearch && matchesPlan;
	});

	const freeCount = rows.filter(
		(r) => (r.sub?.plan ?? "free") === "free",
	).length;
	const proCount = rows.filter((r) => r.sub?.plan === "pro").length;
	const hengkerCount = rows.filter((r) => r.sub?.plan === "hengker").length;
	const adminCount = rows.filter(
		(r) =>
			Boolean(r.user.isAdmin) || (r.user as { role?: string }).role === "admin",
	).length;

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

			{/* Metric Summary Bar */}
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
				<AdminMetricCard
					label="Total Pengguna"
					value={rows.length}
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
						placeholder="Cari email atau nama pengguna..."
						className="w-full rounded-lg border border-graphite bg-charcoal py-2 pl-9 pr-4 text-xs font-inter text-snow placeholder:text-fog/60 focus:border-fog/40 focus:outline-none"
					/>
				</div>

				<div className="flex gap-1.5 overflow-x-auto">
					{(["all", "free", "pro", "hengker"] as const).map((p) => (
						<button
							key={p}
							type="button"
							onClick={() => setPlanFilter(p)}
							className={`rounded-md px-3 py-1.5 text-xs font-[510] capitalize transition-colors ${
								planFilter === p
									? "bg-snow text-onyx"
									: "border border-graphite bg-charcoal text-fog hover:border-fog/40 hover:text-snow"
							}`}
						>
							{p === "all" ? "Semua Paket" : p}
						</button>
					))}
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
						{filteredRows.length === 0 ? (
							<tr>
								<td colSpan={6} className="py-12 text-center text-fog">
									Tidak ada pengguna yang ditemukan.
								</td>
							</tr>
						) : (
							filteredRows.map(({ user, sub }) => (
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
			</div>
		</div>
	);
}
