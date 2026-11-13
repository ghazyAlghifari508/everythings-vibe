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

/**
 * Destructive confirmation for permanently deleting one feature plan.
 *
 * The copy only promises that the feature's planning and history are removed
 * because the backend (`deleteOwnedFeature`) purges exactly those artifacts and
 * tombstones the row. It deliberately does NOT claim the repository or any
 * sibling feature is touched — deletion is feature-scoped, never repository
 * deletion. The onboarding anchor is refused server-side before this dialog
 * can do damage.
 */
export function CodebasePlanDeleteDialog({
	planName,
	deleting,
	onCancel,
	onConfirm,
}: {
	planName: string | null;
	deleting: boolean;
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
			<DialogContent className="max-w-sm" hideCloseButton>
				<DialogHeader>
					<DialogTitle>Hapus fitur?</DialogTitle>
					<DialogDescription>
						&ldquo;{planName}&rdquo; beserta planning dan riwayat terkait akan
						dihapus secara permanen. Repository dan fitur lain tidak
						terpengaruh. Tindakan ini tidak dapat dibatalkan.
					</DialogDescription>
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
						data-testid="codebase-plan-delete-confirm"
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
						Hapus fitur
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
