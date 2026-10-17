"use client";

import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";

interface KanbanResetDialogProps {
	open: boolean;
	isResetting: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirm: () => void;
}

/** Confirmation dialog for resetting every task back to pending. */
export function KanbanResetDialog({
	open,
	isResetting,
	onOpenChange,
	onConfirm,
}: KanbanResetDialogProps) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>Reset progress task?</DialogTitle>
					<DialogDescription>
						Status semua task dikembalikan ke <strong>pending</strong> supaya
						agent bisa mengerjakannya dari awal. Task, PRD, dan AC tidak diubah,
						dan tidak ada kredit yang terpakai.
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button
						variant="ghost"
						onClick={() => onOpenChange(false)}
						disabled={isResetting}
					>
						Batal
					</Button>
					<Button onClick={onConfirm} disabled={isResetting}>
						{isResetting ? "Mereset..." : "Reset Progress"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
