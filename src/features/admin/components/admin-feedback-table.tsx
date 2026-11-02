"use client";

import { InboxIcon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import type { AdminFeedbackItem } from "../types";
import { AdminFeedbackRowItem } from "./admin-feedback-row";
import { AdminPagination } from "./admin-pagination";

export interface AdminFeedbackTableProps {
	feedback: AdminFeedbackItem[];
	totalCount: number;
	page: number;
	pageSize: number;
	totalPages: number;
	hasFilter: boolean;
	onPageChange: (page: number) => void;
	onPageSizeChange: (pageSize: number) => void;
}

export function AdminFeedbackTable({
	feedback,
	totalCount,
	page,
	pageSize,
	totalPages,
	hasFilter,
	onPageChange,
	onPageSizeChange,
}: AdminFeedbackTableProps) {
	if (feedback.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center rounded-xl border border-graphite bg-charcoal/40 py-16 text-center">
				<div className="flex h-10 w-10 items-center justify-center rounded-full bg-obsidian border border-graphite text-fog mb-3">
					<Icon icon={InboxIcon} size={18} />
				</div>
				<p className="text-sm font-[510] text-snow">
					{hasFilter
						? "Tidak ada feedback yang cocok dengan filter"
						: "Belum ada feedback"}
				</p>
				<p className="mt-1 text-xs text-fog max-w-sm">
					{hasFilter
						? "Coba sesuaikan kata kunci pencarian atau ganti filter tipe feedback."
						: "Feedback dan bug report yang dikirimkan user dari halaman Settings akan tercatat di sini."}
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
							<th className="px-4 py-3 font-[510]">Tipe</th>
							<th className="px-4 py-3 font-[510]">Pesan Feedback</th>
							<th className="px-4 py-3 font-[510]">Pengirim</th>
							<th className="px-4 py-3 font-[510] text-right">Waktu</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-graphite">
						{feedback.map((f) => (
							<AdminFeedbackRowItem key={f.id} feedback={f} />
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
				entityName="feedback"
			/>
		</div>
	);
}
