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
import { Input } from "@/components/ui/input";

/**
 * Rename dialog for one feature plan.
 *
 * Mirrors the repository rename dialog's contract: a 3–60 char name, a
 * server-provided error surfaced inline, and the rename posted to the
 * feature-scoped route which re-validates ownership.
 */
export function CodebasePlanRenameDialog({
	planName,
	draft,
	error,
	busy,
	onDraftChange,
	onCancel,
	onConfirm,
}: {
	planName: string | null;
	draft: string;
	error: string | null;
	busy: boolean;
	onDraftChange: (value: string) => void;
	onCancel: () => void;
	onConfirm: () => void;
}) {
	if (!planName) return null;
	return (
		<Dialog
			open={planName !== null}
			onOpenChange={(isOpen) => {
				if (!isOpen) onCancel();
			}}
		>
			<DialogContent className="max-w-sm">
				<DialogHeader>
					<DialogTitle>Ubah nama fitur</DialogTitle>
					<DialogDescription>
						Nama ini dipakai di seluruh workspace untuk fitur ini.
					</DialogDescription>
				</DialogHeader>
				<label
					htmlFor="codebase-plan-rename-name"
					className="flex flex-col gap-1.5"
				>
					<span className="text-xs text-fog">Nama fitur</span>
					<Input
						id="codebase-plan-rename-name"
						data-testid="codebase-plan-rename-input"
						value={draft}
						onChange={(event) => onDraftChange(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter" && !busy) onConfirm();
						}}
					/>
				</label>
				{error ? (
					<p role="alert" className="text-sm text-crimson">
						{error}
					</p>
				) : null}
				<DialogFooter>
					<Button
						type="button"
						variant="secondary"
						onClick={onCancel}
						disabled={busy}
					>
						Batal
					</Button>
					<Button
						type="button"
						data-testid="codebase-plan-rename-confirm"
						onClick={onConfirm}
						disabled={busy}
					>
						{busy ? (
							<Icon
								icon={Loading03Icon}
								size={14}
								className="mr-1.5 animate-spin"
							/>
						) : null}
						Simpan
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
