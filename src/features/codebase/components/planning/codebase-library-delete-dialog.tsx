"use client";

import { Loading03Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
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
		description = "Project dan planning terkait akan dihapus permanen.";
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
			<DialogContent className="max-w-sm" hideCloseButton>
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>{description}</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button
						type="button"
						variant="secondary"
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
					>
						{deleting ? (
							<Icon
								icon={Loading03Icon}
								size={14}
								className="mr-1.5 animate-spin"
							/>
						) : null}
						{confirmLabel}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
