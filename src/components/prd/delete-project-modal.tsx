"use client";

import { Trash2, X } from "lucide-react";

interface DeleteProjectModalProps {
	isOpen: boolean;
	onClose: () => void;
	onConfirm: () => void;
	isDeleting: boolean;
}

/**
 * Confirmation dialog for deleting a project.
 * Extracted from prd-detail.tsx.
 */
export function DeleteProjectModal({
	isOpen,
	onClose,
	onConfirm,
	isDeleting,
}: DeleteProjectModalProps) {
	if (!isOpen) return null;

	return (
		<>
			{/* biome-ignore lint/a11y/noStaticElementInteractions: backdrop click is a mouse shortcut; keyboard dismiss via the Batal button */}
			{/* biome-ignore lint/a11y/useKeyWithClickEvents: backdrop click is a mouse shortcut; keyboard dismiss via the Batal button */}
			<div
				className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 animate-in fade-in duration-200"
				onClick={onClose}
			>
				{/* biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation only, no action to keyboard-activate */}
				<div
					className="w-full max-w-md overflow-hidden rounded-xl bg-obsidian shadow-[var(--shadow-overlay)] animate-in zoom-in-95 duration-200"
					onClick={(e) => e.stopPropagation()}
					role="dialog"
					aria-modal="true"
					aria-labelledby="delete-project-title"
				>
					<div className="p-6">
						<div className="mb-4 flex items-start justify-between">
							<div className="flex h-12 w-12 items-center justify-center rounded-full bg-crimson/10 text-crimson">
								<Trash2 size={24} strokeWidth={2} />
							</div>
							<button type="button" onClick={onClose} aria-label="Tutup dialog">
								<X size={20} />
							</button>
						</div>

						<h3
							id="delete-project-title"
							className="mb-2 mt-2 font-inter text-xl font-[510] text-snow"
						>
							Hapus Proyek?
						</h3>
						<p className="mb-6 font-inter text-sm leading-relaxed text-fog">
							Proyek dan riwayat PRD terkait akan dihapus. Tindakan ini tidak
							bisa dibatalkan.
						</p>

						<div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
							<button
								type="button"
								onClick={onClose}
								className="rounded-md bg-charcoal px-4 py-3 text-center font-inter text-sm font-[510] text-mist shadow-[var(--shadow-inset)] transition-colors hover:bg-white/5"
								disabled={isDeleting}
							>
								Batal
							</button>
							<button
								type="button"
								onClick={onConfirm}
								className="rounded-md bg-crimson px-4 py-3 text-center font-inter text-sm font-[510] text-white transition-opacity hover:opacity-90 disabled:opacity-50"
								disabled={isDeleting}
							>
								{isDeleting ? "Menghapus..." : "Hapus Proyek"}
							</button>
						</div>
					</div>
				</div>
			</div>
		</>
	);
}
