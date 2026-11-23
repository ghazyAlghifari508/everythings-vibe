"use client";

import { Button } from "@/components/ui/button";
import type { StudioElementEditing } from "../../hooks/use-studio-element-editing";

/**
 * One compact, workspace-level line for element operations. It stays visible
 * whether or not the floating chat is open; there is no candidate modal and no
 * large success panel. Legacy unapproved candidates keep explicit controls and
 * are never auto applied.
 */
export function StudioElementFeedback({
	editing,
}: {
	editing: StudioElementEditing;
}) {
	const pending = editing.pending;
	const undoRow = editing.undo;
	if (!pending && !undoRow && !editing.error) return null;
	return (
		<div
			data-testid="studio-element-feedback"
			className="absolute right-3 bottom-3 z-30 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center justify-end gap-2 rounded-lg border border-iron bg-obsidian/95 px-3 py-1.5 text-xs text-snow shadow-lg backdrop-blur-sm sm:right-6"
		>
			{pending?.status === "generating" ? (
				<span>Menyiapkan revisi elemen…</span>
			) : pending ? (
				<>
					<span className="max-w-64 truncate">{pending.summary}</span>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="min-h-11"
						disabled={editing.busy}
						onClick={() => void editing.transition(pending, "cancel")}
					>
						Batalkan
					</Button>
					{pending.status === "preview" ? (
						<Button
							type="button"
							variant="outline"
							size="sm"
							className="min-h-11"
							disabled={editing.busy}
							onClick={() => void editing.transition(pending, "apply")}
						>
							Terapkan
						</Button>
					) : null}
				</>
			) : undoRow ? (
				<>
					<span>Perubahan diterapkan</span>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="min-h-11"
						disabled={editing.busy}
						onClick={() => void editing.transition(undoRow, "undo")}
					>
						Undo
					</Button>
				</>
			) : null}
			{editing.error ? (
				<span role="alert" className="text-crimson">
					{editing.error}
				</span>
			) : null}
		</div>
	);
}
