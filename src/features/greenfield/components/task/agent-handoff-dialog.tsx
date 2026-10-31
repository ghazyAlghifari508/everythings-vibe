"use client";

import { BotIcon, Copy01Icon } from "@hugeicons/core-free-icons";
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
import { formatDate } from "@/lib/utils";

interface AgentHandoffDialogProps {
	open: boolean;
	promptText: string;
	/** Deadline of the bearer credential embedded in the prompt. */
	keyExpiresAt: string | null;
	onOpenChange: (open: boolean) => void;
	onCopy: () => void;
}

/**
 * The handoff necessarily pastes a live bearer token into text the user carries
 * to an external coding agent, so the dialog states the credential's deadline
 * next to the copy action instead of leaving the user to discover it when a
 * later run 401s.
 */
export function AgentHandoffDialog({
	open,
	promptText,
	keyExpiresAt,
	onOpenChange,
	onCopy,
}: AgentHandoffDialogProps) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[90vh] max-w-2xl overflow-hidden">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Icon icon={BotIcon} size={20} />
						Prompt AI Agent
					</DialogTitle>
					<DialogDescription>
						Prompt berisi API key. Salin hanya ke agent yang kamu percaya;
						jangan bagikan ke chat publik, log, atau repository. Cabut akses
						lewat Settings setelah selesai.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4">
					<div>
						<p className="mb-2 text-sm font-[510] text-snow">
							Langkah 1: Copy prompt dibawah
						</p>
						<textarea
							readOnly
							aria-label="Salin prompt berikut"
							value={promptText}
							onFocus={(e) => e.target.select()}
							className="h-48 w-full resize-none rounded-md border border-graphite bg-onyx p-3 font-mono text-xs text-fog focus:border-indigo focus:outline-none"
						/>
					</div>

					<div>
						<p className="text-sm font-[510] text-snow">
							Langkah 2: Buka AI coding agent kamu
						</p>
						<p className="text-xs text-fog">
							Claude Code, Cursor, Copilot, Windsurf, atau AI agent lainnya.
						</p>
					</div>

					<div>
						<p className="text-sm font-[510] text-snow">
							Langkah 3: Paste prompt dan mulai implementasi
						</p>
						<p className="mt-1 text-xs text-fog">
							{keyExpiresAt
								? `API key di dalam prompt ini hanya berlaku sampai ${formatDate(keyExpiresAt)}. Setelah itu jalankan ulang opsi ini untuk key baru.`
								: "API key di dalam prompt ini berlaku terbatas. Jalankan ulang opsi ini untuk key baru."}
						</p>
					</div>
				</div>

				<DialogFooter>
					<Button variant="default" onClick={onCopy} className="gap-1.5">
						<Icon icon={Copy01Icon} size={14} />
						Copy & Tutup
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
