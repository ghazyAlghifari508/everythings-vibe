"use client";

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
import type { CodebaseLibraryItem } from "@/features/codebase/services/library";

export type CodebaseLibraryDeleteRequest =
	| { kind: "single"; item: CodebaseLibraryItem }
	| { kind: "bulk"; count: number }
	| { kind: "all"; count: number }
	| { kind: "all_filtered"; count: number };

/**
 * Confirmation dialog for saved-repository deletion.
 *
 * Scoped to real confirmed item counts: single item names the repository, bulk
 * selection names the selected count, and delete all names the entire owned
 * history (or all matching filter results) so destructive operations are
 * unambiguous.
 */
export function CodebaseLibraryDeleteDialog({
	request,
	deleting,
	onCancel,
	onConfirm,
}: {
	request: CodebaseLibraryDeleteRequest | null;
	deleting: boolean;
	onCancel: () => void;
	onConfirm: () => void;
}) {
	if (!request) return null;

	let title = "";
	let description = "";
	let confirmLabel = "";

	if (request.kind === "single") {
		title = "Hapus project?";
		description = `Project "${request.item.name}" akan dihapus dari Project Tersimpan beserta fitur, PRD, AC, dan task yang dibuat dari repository ini. Tindakan ini tidak dapat dibatalkan.`;
		confirmLabel = "Hapus project";
	} else if (request.kind === "bulk") {
		title = `Hapus ${request.count} repository?`;
		description =
			"Repository dan planning terkait akan dihapus. Tindakan ini tidak dapat dibatalkan.";
		confirmLabel = `Hapus ${request.count}`;
	} else if (request.kind === "all") {
		title = "Hapus seluruh History?";
		description = `${request.count} repository beserta planning terkait akan dihapus permanen.`;
		confirmLabel = "Hapus Semua";
	} else {
		title = `Hapus ${request.count} repository hasil filter?`;
		description = `${request.count} repository beserta planning terkait akan dihapus permanen.`;
		confirmLabel = "Hapus Semua";
	}

	return (
		<Dialog
			open={request !== null}
			onOpenChange={(open) => {
				if (!open) onCancel();
			}}
		>
			<DialogContent className="max-w-sm">
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>{description}</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<button
						type="button"
						onClick={onCancel}
						disabled={deleting}
						className="rounded-lg border border-graphite px-3 py-1.5 text-xs font-medium text-snow hover:bg-onyx disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
					>
						Batal
					</button>
					<button
						type="button"
						onClick={onConfirm}
						disabled={deleting}
						className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-rose-500 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
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
