import { Loading03Icon } from "@hugeicons/core-free-icons";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icon";
import { displaySiteName } from "@/features/scrape/utils/site-name";
import type { ScrapeHistoryItem } from "./scrape-history-list-item";

export type ScrapeHistoryDeleteRequest =
	| { kind: "single"; item: ScrapeHistoryItem }
	| { kind: "bulk"; count: number };

export function ScrapeHistoryDeleteDialog({
	request,
	deleting,
	onCancel,
	onConfirm,
}: {
	request: ScrapeHistoryDeleteRequest | null;
	deleting: boolean;
	onCancel: () => void;
	onConfirm: () => void;
}) {
	const single = request?.kind === "single" ? request.item : null;
	const bulkCount = request?.kind === "bulk" ? request.count : null;
	const title =
		single === null && bulkCount !== null
			? `Hapus ${bulkCount} hasil scrape?`
			: "Hapus Riwayat VibeScrape?";
	const description =
		single === null
			? "Hasil yang dipilih akan dihapus permanen."
			: `Apakah kamu yakin ingin menghapus riwayat scrape untuk ${displaySiteName(single.domain)}? Tindakan ini tidak dapat dibatalkan.`;
	const confirmLabel =
		single === null ? `Hapus ${bulkCount}` : "Konfirmasi Hapus";
	return (
		<Dialog
			open={request !== null}
			onOpenChange={(open) => {
				if (!open) onCancel();
			}}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>{description}</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<button
						type="button"
						onClick={onCancel}
						disabled={deleting}
						className="rounded-lg border border-graphite px-3 py-1.5 text-xs font-medium text-snow hover:bg-onyx disabled:opacity-50"
					>
						Batal
					</button>
					<button
						type="button"
						onClick={onConfirm}
						disabled={deleting}
						className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-rose-500 disabled:opacity-50"
					>
						{deleting ? (
							<Icon icon={Loading03Icon} size={12} className="animate-spin" />
						) : null}
						{confirmLabel}
					</button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
