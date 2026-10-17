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

interface StudioAddFrameDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	busy: boolean;
	onSubmit: (input: { name: string; prompt: string }) => Promise<void>;
}

/**
 * Explicit add-screen flow, deliberately kept out of the composer so an add
 * request can never be inferred from prompt wording.
 */
export function StudioAddFrameDialog({
	open,
	onOpenChange,
	busy,
	onSubmit,
}: StudioAddFrameDialogProps) {
	const [name, setName] = useState("");
	const [prompt, setPrompt] = useState("");
	const [localError, setLocalError] = useState("");
	const canSubmit =
		name.trim().length > 0 && prompt.trim().length >= 10 && !busy;

	useEffect(() => {
		if (open) {
			setName("");
			setPrompt("");
			setLocalError("");
		}
	}, [open]);

	async function submit() {
		if (!canSubmit) {
			setLocalError(
				"Isi nama halaman dan instruksi minimal 10 karakter sebelum melanjutkan.",
			);
			return;
		}
		setLocalError("");
		await onSubmit({ name: name.trim(), prompt: prompt.trim() });
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>Tambah halaman baru</DialogTitle>
					<DialogDescription>
						AI membuat satu layar baru dan menyambungkannya ke project ini tanpa
						mengubah layar lain.
					</DialogDescription>
				</DialogHeader>
				<div className="flex flex-col gap-3">
					<label className="flex flex-col gap-1.5">
						<span className="text-xs text-fog">Nama halaman</span>
						<input
							type="text"
							value={name}
							onChange={(event) => setName(event.target.value)}
							placeholder="Contoh: Pengaturan Akun"
							className="min-h-11 rounded-lg border border-graphite bg-charcoal px-3 text-sm text-snow placeholder:text-fog focus:border-fog/40 focus:outline-none"
						/>
					</label>
					<label className="flex flex-col gap-1.5">
						<span className="text-xs text-fog">Instruksi halaman</span>
						<textarea
							value={prompt}
							onChange={(event) => setPrompt(event.target.value)}
							rows={4}
							placeholder="Jelaskan isi dan tujuan halaman ini..."
							className="resize-y rounded-lg border border-graphite bg-charcoal px-3 py-2 text-sm text-snow placeholder:text-fog focus:border-fog/40 focus:outline-none"
						/>
					</label>
					{localError ? (
						<p role="alert" className="text-sm text-crimson">
							{localError}
						</p>
					) : null}
				</div>
				<DialogFooter>
					<Button
						type="button"
						variant="secondary"
						onClick={() => onOpenChange(false)}
						disabled={busy}
					>
						Batal
					</Button>
					<Button
						type="button"
						onClick={() => void submit()}
						disabled={!canSubmit}
					>
						{busy ? "Menambahkan..." : "Tambah halaman"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
