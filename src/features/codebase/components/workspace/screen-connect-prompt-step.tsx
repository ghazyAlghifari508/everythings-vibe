"use client";

import { Copy01Icon, Tick01Icon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import { Spinner } from "@/components/ui/spinner";
import { useCopyFeedback } from "@/features/codebase/hooks/use-copy-feedback";
import {
	buildAgentPrompt,
	type SyncPromptPayload,
} from "@/features/codebase/services/sync";

interface ScreenConnectPromptStepProps {
	projectName: string;
	payload: SyncPromptPayload | null;
	isStarting: boolean;
	/** Mints a fresh one-time sync credential for a new attempt. */
	onRequestNewToken?: () => void;
}

export function ScreenConnectPromptStep({
	projectName,
	payload,
	isStarting,
	onRequestNewToken,
}: ScreenConnectPromptStepProps) {
	const { copied, copyError, copy } = useCopyFeedback();
	const promptText = payload ? buildAgentPrompt(payload, { projectName }) : "";

	const handleCopy = async () => {
		await copy(promptText);
	};

	return (
		<div className="flex items-start gap-3.5">
			<span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-iron font-mono text-xs text-mist">
				1
			</span>
			<div className="flex flex-1 flex-col gap-2">
				<div className="flex items-center justify-between">
					<div className="text-xs font-semibold text-mist">
						Copy prompt untuk AI agent
					</div>
					{payload && (
						<button
							type="button"
							onClick={handleCopy}
							aria-label="Salin prompt untuk AI agent"
							className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-iron bg-charcoal px-3 py-1 font-sans text-xs font-semibold text-snow transition hover:bg-steel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
						>
							{copied ? (
								<>
									<Icon
										icon={Tick01Icon}
										size={13}
										className="text-emerald-400"
									/>
									<span className="text-emerald-400">Tersalin</span>
								</>
							) : (
								<>
									<Icon icon={Copy01Icon} size={13} />
									<span>Salin</span>
								</>
							)}
						</button>
					)}
				</div>
				<div className="relative min-h-[90px] rounded-lg border border-graphite bg-onyx p-3.5 font-mono text-xs leading-relaxed text-mist sm:p-4">
					{payload ? (
						<>
							<div className="hide-scrollbar max-h-56 select-all overflow-x-auto overflow-y-auto whitespace-pre-wrap text-snow">
								{promptText}
							</div>
							{copyError && (
								<p className="mt-2 font-sans text-[11px] text-crimson">
									{copyError}
								</p>
							)}
						</>
					) : isStarting ? (
						<div className="flex items-center justify-center gap-2 py-6 font-sans text-xs text-fog">
							<Spinner size={14} className="text-blue-400" />
							<span>Menyiapkan token sesi...</span>
						</div>
					) : (
						/* The sync credential is deliberately never persisted, so a
						   refresh mid-attempt cannot restore the prompt text. The
						   attempt itself is still tracked below — only the token is
						   missing, and a new one mints a new attempt. */
						<div className="flex flex-col items-center justify-center gap-3 py-6 text-center font-sans">
							<p className="text-xs text-fog">
								Token sync hanya berlaku sekali dan tidak disimpan di browser.
							</p>
							{onRequestNewToken && (
								<button
									type="button"
									onClick={onRequestNewToken}
									disabled={isStarting}
									className="inline-flex min-h-9 items-center rounded-md border border-iron bg-obsidian px-3.5 font-sans text-[11px] font-medium text-mist transition hover:bg-steel hover:text-snow disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
								>
									Dapatkan token baru
								</button>
							)}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
