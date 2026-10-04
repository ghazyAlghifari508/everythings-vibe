"use client";

import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
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
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { CodebaseLibraryItem } from "@/lib/codebase-library";

function readServerErrorMessage(value: unknown, fallback: string): string {
	if (
		typeof value === "object" &&
		value !== null &&
		"error" in value &&
		typeof value.error === "string" &&
		value.error.trim().length > 0
	) {
		return value.error;
	}
	return fallback;
}

export function ProjectActionsMenu({
	item,
	onRename,
	onDelete,
}: {
	item: CodebaseLibraryItem;
	onRename: (id: string, name: string) => void;
	onDelete: (item: CodebaseLibraryItem) => Promise<void>;
}) {
	const [isRenameOpen, setRenameOpen] = useState(false);
	const [isDeleteOpen, setDeleteOpen] = useState(false);
	const [draftName, setDraftName] = useState(item.name);
	const [renameError, setRenameError] = useState<string | null>(null);
	const [isSaving, setSaving] = useState(false);
	const [isDeleting, setDeleting] = useState(false);

	useEffect(() => {
		if (isRenameOpen) {
			setDraftName(item.name);
			setRenameError(null);
		}
	}, [isRenameOpen, item.name]);

	const submitRename = async () => {
		const trimmed = draftName.trim();
		if (trimmed.length < 3) {
			setRenameError("Nama project minimal 3 karakter dan tidak boleh kosong.");
			return;
		}
		setRenameError(null);
		setSaving(true);
		try {
			const response = await fetch(
				`/api/codebases/${encodeURIComponent(item.id)}`,
				{
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ name: trimmed }),
				},
			);
			const body: unknown = await response.json().catch(() => null);
			if (!response.ok) {
				setRenameError(
					readServerErrorMessage(body, "Gagal mengganti nama project."),
				);
				return;
			}
			onRename(item.id, trimmed);
			setRenameOpen(false);
		} catch {
			setRenameError("Server tidak dapat dihubungi.");
		} finally {
			setSaving(false);
		}
	};

	const confirmDelete = async () => {
		setDeleting(true);
		await onDelete(item);
		setDeleting(false);
		setDeleteOpen(false);
	};

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						aria-label={`Aksi project ${item.name}`}
						className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-fog transition-colors hover:bg-white/5 hover:text-snow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
					>
						<MoreHorizontal size={16} aria-hidden />
					</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuItem onSelect={() => setRenameOpen(true)}>
						<Pencil size={14} aria-hidden className="mr-2 text-fog" />
						Ganti nama
					</DropdownMenuItem>
					<DropdownMenuItem
						onSelect={() => setDeleteOpen(true)}
						className="text-crimson focus:text-crimson"
					>
						<Trash2 size={14} aria-hidden className="mr-2" />
						Hapus project
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			<Dialog open={isRenameOpen} onOpenChange={setRenameOpen}>
				<DialogContent className="max-w-sm">
					<DialogHeader>
						<DialogTitle>Ganti nama project</DialogTitle>
						<DialogDescription>
							Nama ini dipakai di seluruh halaman workspace untuk project ini.
						</DialogDescription>
					</DialogHeader>
					<label className="flex flex-col gap-1.5">
						<span className="text-xs text-fog">Nama project</span>
						<input
							type="text"
							value={draftName}
							onChange={(e) => setDraftName(e.target.value)}
							className="min-h-11 rounded-lg border border-graphite bg-charcoal px-3 text-sm text-snow focus:border-fog/40 focus:outline-none"
						/>
					</label>
					{renameError ? (
						<p role="alert" className="text-sm text-crimson">
							{renameError}
						</p>
					) : null}
					<DialogFooter>
						<Button
							type="button"
							variant="secondary"
							onClick={() => setRenameOpen(false)}
							disabled={isSaving}
						>
							Batal
						</Button>
						<Button
							type="button"
							onClick={() => void submitRename()}
							disabled={isSaving}
						>
							{isSaving ? "Menyimpan..." : "Simpan"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog open={isDeleteOpen} onOpenChange={setDeleteOpen}>
				<DialogContent className="max-w-sm">
					<DialogHeader>
						<DialogTitle>Hapus project?</DialogTitle>
						<DialogDescription>
							{`Project "${item.name}" akan dihapus dari Project Tersimpan beserta fitur, PRD, AC, dan task yang dibuat dari repository ini. Tindakan ini tidak dapat dibatalkan.`}
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button
							type="button"
							variant="secondary"
							onClick={() => setDeleteOpen(false)}
							disabled={isDeleting}
						>
							Batal
						</Button>
						<Button
							type="button"
							variant="destructive"
							onClick={() => void confirmDelete()}
							disabled={isDeleting}
						>
							{isDeleting ? "Menghapus..." : "Hapus project"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}

export { readServerErrorMessage };
