"use client";

import { CODEBASE_LIBRARY_PAGE_SIZE } from "@/lib/constants";

export function LibraryPagination({
	clampedPage,
	totalPages,
	totalItems,
	onPageChange,
}: {
	clampedPage: number;
	totalPages: number;
	totalItems: number;
	onPageChange: (page: number) => void;
}) {
	if (totalItems <= CODEBASE_LIBRARY_PAGE_SIZE) return null;
	return (
		<nav
			aria-label="Pagination"
			className="flex items-center justify-between border-t border-graphite pt-4"
		>
			<button
				type="button"
				onClick={() => onPageChange(Math.max(1, clampedPage - 1))}
				disabled={clampedPage <= 1}
				className="min-h-11 rounded-md border border-graphite bg-charcoal px-4 text-sm text-snow transition-colors hover:border-fog/40 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
			>
				Sebelumnya
			</button>
			<span className="text-sm text-fog">
				Halaman {clampedPage} dari {totalPages}
			</span>
			<button
				type="button"
				onClick={() => onPageChange(Math.min(totalPages, clampedPage + 1))}
				disabled={clampedPage >= totalPages}
				className="min-h-11 rounded-md border border-graphite bg-charcoal px-4 text-sm text-snow transition-colors hover:border-fog/40 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
			>
				Selanjutnya
			</button>
		</nav>
	);
}
