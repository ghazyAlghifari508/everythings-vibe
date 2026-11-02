"use client";

import { CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import type { AdminErrorReportItem } from "../types";
import { AdminErrorReportRowItem } from "./admin-feedback-row";
import { AdminPagination } from "./admin-pagination";

export interface AdminErrorReportTableProps {
	errors: AdminErrorReportItem[];
	totalCount: number;
	page: number;
	pageSize: number;
	totalPages: number;
	hasFilter: boolean;
	onPageChange: (page: number) => void;
	onPageSizeChange: (pageSize: number) => void;
}

export function AdminErrorReportTable({
	errors,
	totalCount,
	page,
	pageSize,
	totalPages,
	hasFilter,
	onPageChange,
	onPageSizeChange,
}: AdminErrorReportTableProps) {
	if (errors.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center rounded-xl border border-graphite bg-charcoal/40 py-16 text-center">
				<div className="flex h-10 w-10 items-center justify-center rounded-full bg-obsidian border border-graphite text-emerald-400 mb-3">
					<Icon icon={CheckmarkCircle02Icon} size={18} />
				</div>
				<p className="text-sm font-[510] text-snow">
					{hasFilter
						? "Tidak ada laporan error yang cocok"
						: "Semua sistem berjalan normal"}
				</p>
				<p className="mt-1 text-xs text-fog max-w-sm">
					{hasFilter
						? "Coba sesuaikan kata kunci pencarian untuk menemukan error yang dicari."
						: "Tidak ada error client-side yang dilaporkan saat ini."}
				</p>
			</div>
		);
	}

	return (
		<div className="overflow-hidden rounded-xl border border-graphite bg-charcoal shadow-[var(--shadow-inset)]">
			<div className="overflow-x-auto">
				<table className="w-full text-left text-xs">
					<thead>
						<tr className="border-b border-graphite bg-obsidian text-fog">
							<th className="px-4 py-3 font-[510]">Error Message</th>
							<th className="px-4 py-3 font-[510]">Konteks / Stack</th>
							<th className="px-4 py-3 font-[510]">User</th>
							<th className="px-4 py-3 font-[510] text-right">Waktu</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-graphite">
						{errors.map((e) => (
							<AdminErrorReportRowItem key={e.id} error={e} />
						))}
					</tbody>
				</table>
			</div>

			<AdminPagination
				page={page}
				pageSize={pageSize}
				totalCount={totalCount}
				totalPages={totalPages}
				onPageChange={onPageChange}
				onPageSizeChange={onPageSizeChange}
				entityName="laporan error"
			/>
		</div>
	);
}
