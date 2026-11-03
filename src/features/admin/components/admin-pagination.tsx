"use client";

import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";

export interface AdminPaginationProps {
	page: number;
	pageSize: number;
	totalCount: number;
	totalPages: number;
	onPageChange: (page: number) => void;
	onPageSizeChange?: (pageSize: number) => void;
	pageSizeOptions?: number[];
	entityName?: string;
	className?: string;
}

export function calculatePageWindow(
	page: number,
	totalPages: number,
): Array<{ type: "page"; page: number } | { type: "gap"; after: number }> {
	if (totalPages <= 7) {
		return Array.from({ length: totalPages }, (_, i) => ({
			type: "page",
			page: i + 1,
		}));
	}

	const rawNumbers = [
		1,
		2,
		page - 1,
		page,
		page + 1,
		totalPages - 1,
		totalPages,
	].filter((n) => n >= 1 && n <= totalPages);

	const sortedNumbers = Array.from(new Set(rawNumbers)).sort((a, b) => a - b);
	const windowed: Array<
		{ type: "page"; page: number } | { type: "gap"; after: number }
	> = [];

	for (let i = 0; i < sortedNumbers.length; i++) {
		const current = sortedNumbers[i];
		const prev = sortedNumbers[i - 1];
		if (prev !== undefined && current - prev > 1) {
			windowed.push({ type: "gap", after: prev });
		}
		windowed.push({ type: "page", page: current });
	}

	return windowed;
}

export function AdminPagination({
	page,
	pageSize,
	totalCount,
	totalPages,
	onPageChange,
	onPageSizeChange,
	pageSizeOptions = [10, 20, 50, 100],
	entityName = "pengguna",
	className = "",
}: AdminPaginationProps) {
	if (totalCount === 0) {
		return (
			<div
				className={`flex items-center justify-between border-t border-graphite px-4 py-3 text-xs text-fog ${className}`}
			>
				<span>Tidak ada {entityName} yang ditampilkan.</span>
			</div>
		);
	}

	const from = (page - 1) * pageSize + 1;
	const to = Math.min(page * pageSize, totalCount);
	const pages = calculatePageWindow(page, totalPages);

	return (
		<nav
			aria-label="Navigasi halaman"
			className={`flex flex-wrap items-center justify-between gap-3 border-t border-graphite bg-charcoal/50 px-4 py-3 text-xs font-inter text-fog ${className}`}
		>
			{/* Range Info */}
			<div className="flex items-center gap-3">
				<span>
					Menampilkan{" "}
					<strong className="font-semibold text-snow">
						{from}–{to}
					</strong>{" "}
					dari{" "}
					<strong className="font-semibold text-snow">
						{totalCount.toLocaleString("id-ID")}
					</strong>{" "}
					{entityName}
				</span>

				{onPageSizeChange && (
					<div className="hidden items-center gap-1.5 sm:flex">
						<span className="text-fog/70">Tampilkan:</span>
						<select
							value={pageSize}
							onChange={(e) => onPageSizeChange(Number(e.target.value))}
							aria-label="Jumlah per halaman"
							className="rounded border border-graphite bg-obsidian px-2 py-1 text-xs text-snow focus:border-fog/40 focus:outline-none"
						>
							{pageSizeOptions.map((opt) => (
								<option key={opt} value={opt}>
									{opt} / hal
								</option>
							))}
						</select>
					</div>
				)}
			</div>

			{/* Desktop Page Window */}
			<div className="hidden items-center gap-1 sm:flex">
				<button
					type="button"
					onClick={() => onPageChange(page - 1)}
					disabled={page <= 1}
					aria-label="Halaman sebelumnya"
					className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-md border border-graphite bg-charcoal text-snow transition-colors hover:border-fog/40 disabled:cursor-not-allowed disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
				>
					<Icon icon={ArrowLeft01Icon} size={14} aria-hidden="true" />
				</button>

				{pages.map((entry) =>
					entry.type === "gap" ? (
						<span
							key={`gap-after-${entry.after}`}
							aria-hidden="true"
							className="px-1 text-xs text-fog/60"
						>
							...
						</span>
					) : (
						<button
							key={`page-${entry.page}`}
							type="button"
							onClick={() => onPageChange(entry.page)}
							aria-label={`Halaman ${entry.page}`}
							aria-current={entry.page === page ? "page" : undefined}
							className={`inline-flex min-h-8 min-w-8 items-center justify-center rounded-md px-2 text-xs font-[510] tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo ${
								entry.page === page
									? "bg-snow text-onyx font-semibold"
									: "border border-graphite bg-charcoal text-fog hover:border-fog/40 hover:text-snow"
							}`}
						>
							{entry.page}
						</button>
					),
				)}

				<button
					type="button"
					onClick={() => onPageChange(page + 1)}
					disabled={page >= totalPages}
					aria-label="Halaman berikutnya"
					className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-md border border-graphite bg-charcoal text-snow transition-colors hover:border-fog/40 disabled:cursor-not-allowed disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
				>
					<Icon icon={ArrowRight01Icon} size={14} aria-hidden="true" />
				</button>
			</div>

			{/* Mobile Page Controls */}
			<div className="flex items-center gap-2 sm:hidden">
				<span className="text-xs text-fog tabular-nums">
					{page} / {totalPages}
				</span>
				<button
					type="button"
					onClick={() => onPageChange(page - 1)}
					disabled={page <= 1}
					aria-label="Halaman sebelumnya"
					className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-md border border-graphite bg-charcoal text-snow transition-colors hover:border-fog/40 disabled:cursor-not-allowed disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
				>
					<Icon icon={ArrowLeft01Icon} size={14} aria-hidden="true" />
				</button>
				<button
					type="button"
					onClick={() => onPageChange(page + 1)}
					disabled={page >= totalPages}
					aria-label="Halaman berikutnya"
					className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-md border border-graphite bg-charcoal text-snow transition-colors hover:border-fog/40 disabled:cursor-not-allowed disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
				>
					<Icon icon={ArrowRight01Icon} size={14} aria-hidden="true" />
				</button>
			</div>
		</nav>
	);
}
