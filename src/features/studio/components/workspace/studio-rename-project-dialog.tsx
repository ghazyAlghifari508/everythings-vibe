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
import { Input } from "@/components/ui/input";
import { STUDIO_PROJECT_TITLE_MAX_CHARS } from "@/features/studio/types/studio-constants";

export interface StudioRenameProjectDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** The name shown today; the field starts from it on every open. */
	name: string;
	onRename: (name: string) => Promise<void>;
}

/**
 * Renames an existing project through the shared Dialog, Input and Button
 * primitives. It only writes a label: no generation, no new project, no change
 * to the project id or to anything the canvas renders.
 */
export function StudioRenameProjectDialog({
	open,
	onOpenChange,
	name,
	onRename,
}: StudioRenameProjectDialogProps) {
	const [value, setValue] = useState(name);
	const [renaming, setRenaming] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!open) return;
		setValue(name);
		setError(null);
		setRenaming(false);
	}, [open, name]);

	const trimmed = value.trim();
	const canSubmit = trimmed.length > 0 && trimmed !== name.trim() && !renaming;

	async function submit() {
		if (!canSubmit) return;
		setRenaming(true);
		setError(null);
		try {
			await onRename(trimmed);
			onOpenChange(false);
		} catch (failure) {
			setError(
				failure instanceof Error
					? failure.message
					: "Gagal mengganti nama project. Coba lagi.",
			);
		} finally {
			setRenaming(false);
		}
	}

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				// The write is already in flight; closing now would hide its result.
				if (renaming) return;
				onOpenChange(next);
			}}
		>
			<DialogContent className="max-w-sm">
				<DialogHeader>
					<DialogTitle>Ganti nama project</DialogTitle>
					<DialogDescription>
						Nama ini dipakai di header dan riwayat project.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-1.5">
					<label
						htmlFor="studio-project-name"
						className="text-xs font-medium text-fog"
					>
						Nama project
					</label>
					<Input
						id="studio-project-name"
						value={value}
						onChange={(event) => setValue(event.target.value)}
						maxLength={STUDIO_PROJECT_TITLE_MAX_CHARS}
						placeholder="Nama project"
						autoFocus
						disabled={renaming}
					/>
					{error ? (
						<p role="alert" className="text-xs text-crimson">
							{error}
						</p>
					) : null}
				</div>
				<DialogFooter>
					<Button
						type="button"
						variant="secondary"
						disabled={renaming}
						onClick={() => onOpenChange(false)}
					>
						Batal
					</Button>
					<Button
						type="button"
						disabled={!canSubmit}
						onClick={() => void submit()}
					>
						{renaming ? "Menyimpan..." : "Simpan"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
