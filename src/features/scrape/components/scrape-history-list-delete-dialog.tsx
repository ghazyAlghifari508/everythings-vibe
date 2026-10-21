import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
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
			? `${bulkCount ?? 0} hasil yang dipilih akan dihapus permanen.`
			: `Apakah kamu yakin ingin menghapus riwayat scrape untuk ${displaySiteName(single.domain)}? Tindakan ini tidak dapat dibatalkan.`;
	const confirmLabel =
		single === null ? `Hapus ${bulkCount} hasil` : "Konfirmasi Hapus";
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
					<Button
						type="button"
						variant="outline"
						onClick={onCancel}
						disabled={deleting}
					>
						Batal
					</Button>
					<Button
						type="button"
						variant="destructive"
						onClick={onConfirm}
						disabled={deleting}
						isLoading={deleting}
					>
						{confirmLabel}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
