import { Loader2 } from "lucide-react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { displaySiteName } from "@/lib/site-name";
import type { ScrapeHistoryItem } from "./scrape-history-list-item";

export function ScrapeHistoryDeleteDialog({
	target,
	deleting,
	onCancel,
	onConfirm,
}: {
	target: ScrapeHistoryItem | null;
	deleting: boolean;
	onCancel: () => void;
	onConfirm: () => void;
}) {
	return (
		<Dialog
			open={target !== null}
			onOpenChange={(open) => {
				if (!open) onCancel();
			}}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Hapus Riwayat Scrape?</DialogTitle>
					<DialogDescription>
						Apakah kamu yakin ingin menghapus riwayat scrape untuk{" "}
						{target ? displaySiteName(target.domain) : "website ini"}? Tindakan
						ini tidak dapat dibatalkan.
					</DialogDescription>
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
						{deleting ? <Loader2 size={12} className="animate-spin" /> : null}
						Konfirmasi Hapus
					</button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
