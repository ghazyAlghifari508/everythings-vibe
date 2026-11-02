"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";

export interface StudioDeleteProjectDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	name: string;
	onDelete: () => Promise<void>;
}

/** Confirms a permanent project deletion before the server action runs. */
export function StudioDeleteProjectDialog({
	open,
	onOpenChange,
	name,
	onDelete,
}: StudioDeleteProjectDialogProps) {
	const [deleting, setDeleting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!open) return;
		setError(null);
		setDeleting(false);
	}, [open]);

	async function confirmDelete() {
		if (deleting) return;
		setDeleting(true);
		setError(null);
		try {
			await onDelete();
			onOpenChange(false);
		} catch (failure) {
			setError(
				failure instanceof Error
					? failure.message
					: "Gagal menghapus project. Coba lagi.",
			);
		} finally {
			setDeleting(false);
		}
	}

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (deleting) return;
				onOpenChange(next);
			}}
		>
			<DialogContent className="max-w-sm">
				<DialogHeader>
					<DialogTitle>Hapus project?</DialogTitle>
					<DialogDescription>
						{`Project "${name}" akan dihapus permanen beserta seluruh layar, riwayat revisi, dan asetnya. Tindakan ini tidak dapat dibatalkan.`}
					</DialogDescription>
				</DialogHeader>
				{error ? (
					<p role="alert" className="text-sm text-crimson">
						{error}
					</p>
				) : null}
				<DialogFooter>
					<Button
						type="button"
						variant="secondary"
						disabled={deleting}
						onClick={() => onOpenChange(false)}
					>
						Batal
					</Button>
					<Button
						type="button"
						variant="destructive"
						disabled={deleting}
						onClick={() => void confirmDelete()}
					>
						{deleting ? "Menghapus..." : "Hapus project"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
