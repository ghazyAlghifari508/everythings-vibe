"use client";

import { Delete02Icon, Loading03Icon } from "@hugeicons/core-free-icons";
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
import { Icon } from "@/components/ui/icon";
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
			<DialogContent className="max-w-md" closeAriaLabel="Tutup dialog">
				<DialogHeader className="gap-3 space-y-0 text-left">
					<div
						className="flex h-10 w-10 items-center justify-center rounded-lg border border-graphite/60 bg-charcoal text-crimson"
						aria-hidden="true"
					>
						<Icon icon={Delete02Icon} size={20} />
					</div>
					<div className="flex flex-col space-y-2">
						<DialogTitle className="break-words text-left text-lg font-semibold leading-snug tracking-tight text-snow [overflow-wrap:anywhere]">
							{`Hapus project "${name}"?`}
						</DialogTitle>
						<DialogDescription className="text-left text-sm leading-relaxed text-fog">
							Semua halaman, riwayat perubahan, dan aset dalam project ini akan
							dihapus permanen. Project yang dihapus tidak bisa dipulihkan.
						</DialogDescription>
					</div>
				</DialogHeader>
				{error ? (
					<p role="alert" className="text-sm text-crimson">
						{error}
					</p>
				) : null}
				<DialogFooter className="gap-2 sm:gap-0">
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
						aria-busy={deleting}
						onClick={() => void confirmDelete()}
					>
						{deleting ? (
							<>
								<Icon
									icon={Loading03Icon}
									size={14}
									className="mr-1.5 animate-spin"
									aria-hidden="true"
								/>
								Menghapus...
							</>
						) : (
							"Hapus project"
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
