import { Link } from "@tanstack/react-router";
import {
	AlertTriangle,
	Check,
	ChevronRight,
	Loader2,
	Trash2,
} from "lucide-react";
import type { ScrapeMode } from "@/db/schema";
import type { buildHistoryDetailSearch } from "@/features/scrape/utils/scrape-history";
import {
	imageCountsLabel,
	type imageResultCounts,
} from "@/features/scrape/utils/scrape-images";
import { displaySiteName } from "@/features/scrape/utils/site-name";
import { formatDate } from "@/lib/utils";

export interface ScrapeHistoryItem {
	id: string;
	sourceUrl: string;
	domain: string;
	title: string | null;
	status: string;
	mode?: ScrapeMode;
	createdAt: string;
	imageCounts?: ReturnType<typeof imageResultCounts>;
}

export const SCRAPE_STATUS_INDONESIAN_LABELS: Record<string, string> = {
	completed: "Selesai",
	failed: "Gagal",
	queued: "Diproses",
	capturing: "Diproses",
	extracting: "Diproses",
	generating: "Diproses",
	saving: "Diproses",
	processing: "Diproses",
};

export function formatTimeAgo(dateString: string): string {
	const timestamp = new Date(dateString).getTime();
	if (Number.isNaN(timestamp)) return "baru saja";
	const diffSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
	if (diffSeconds < 60) return "baru saja";
	const minutes = Math.floor(diffSeconds / 60);
	if (minutes < 60) return `${minutes} menit lalu`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours} jam lalu`;
	const days = Math.floor(hours / 24);
	return `${days} hari lalu`;
}

export function modeLabel(mode?: ScrapeMode): string {
	if (mode === "crawl") return "Crawl";
	if (mode === "images") return "Images";
	return mode === "html" ? "HTML" : "DESIGN.md";
}

export function statusLabel(status: string): string {
	return SCRAPE_STATUS_INDONESIAN_LABELS[status] ?? "Diproses";
}

function isProcessingStatus(status: string): boolean {
	return status !== "completed" && status !== "failed";
}

export function ScrapeHistoryRow({
	item,
	detailSearch,
	deleting,
	onRequestDelete,
}: {
	item: ScrapeHistoryItem;
	detailSearch: ReturnType<typeof buildHistoryDetailSearch>;
	deleting: boolean;
	onRequestDelete: (item: ScrapeHistoryItem) => void;
}) {
	const siteName = displaySiteName(item.domain);
	const processing = isProcessingStatus(item.status);
	const failed = item.status === "failed";
	return (
		<li className="group flex items-center gap-2 p-4 transition-colors hover:bg-onyx/60">
			<Link
				to="/scrape/$id"
				params={{ id: item.id }}
				search={detailSearch}
				className="flex min-w-0 flex-1 flex-col gap-0.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
			>
				<span className="flex items-center gap-2">
					<span className="truncate text-sm font-semibold text-snow">
						{siteName}
					</span>
					<span className="shrink-0 text-xs text-fog">
						{modeLabel(item.mode)}
					</span>
					<span
						className={`inline-flex shrink-0 items-center gap-1 text-xs ${
							failed ? "text-rose-400" : "text-fog"
						}`}
					>
						{processing ? (
							<Loader2 size={12} aria-hidden="true" className="animate-spin" />
						) : failed ? (
							<AlertTriangle size={12} aria-hidden="true" />
						) : (
							<Check size={12} aria-hidden="true" />
						)}
						{statusLabel(item.status)}
					</span>
				</span>
				<span className="truncate font-mono text-[11px] text-fog">
					{item.domain} ·{" "}
					<time dateTime={item.createdAt}>{formatDate(item.createdAt)}</time>
				</span>
				{item.imageCounts && (
					<span className="text-xs text-fog">
						{imageCountsLabel(item.imageCounts)}
					</span>
				)}
			</Link>

			<ChevronRight
				size={16}
				aria-hidden="true"
				className="shrink-0 text-fog"
			/>

			<button
				type="button"
				onClick={() => onRequestDelete(item)}
				disabled={deleting}
				aria-label={`Hapus riwayat ${siteName}`}
				className="inline-flex size-10 shrink-0 items-center justify-center rounded-md border border-transparent text-fog transition-colors hover:border-graphite hover:bg-onyx hover:text-rose-400 disabled:opacity-50"
			>
				{deleting ? (
					<Loader2 size={14} className="animate-spin" />
				) : (
					<Trash2 size={14} aria-hidden="true" />
				)}
			</button>
		</li>
	);
}
