"use client";

import { LockIcon, Tick01Icon } from "@hugeicons/core-free-icons";
import { useEffect, useRef, useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icon";
import type { AnalysisResponse } from "@/features/codebase/services/analysis";
import { resolveCodebaseDisplayName } from "@/features/codebase/services/naming";
import {
	buildResyncPrompt,
	isResyncSessionVerified,
	resolveSyncStageView,
	type SyncPromptPayload,
	type SyncStatusResponse,
} from "@/features/codebase/services/sync";
import { copyToClipboard } from "@/features/codebase/utils/clipboard";
import { cn } from "@/lib/utils";
import {
	ResyncStep1Prompt,
	ResyncStep2Agent,
	ResyncStep3Progress,
	type StepState,
} from "./codebase-resync-modal-steps";

export interface CodebaseResyncModalProps {
	isOpen: boolean;
	onClose: () => void;
	projectName: string;
	payload: SyncPromptPayload | null;
	isStarting?: boolean;
	creditMaximum?: number | null;
	creditFree?: boolean;
	status: SyncStatusResponse | null;
	statusError?: string | null;
	onRequestNewToken?: () => void;
	onRetrySync?: () => void;
	analysis?: AnalysisResponse | null;
	analysisError?: string | null;
	isAnalyzing?: boolean;
	onRetryAnalysis?: () => void;
	activeSessionId?: string | null;
}

export function CodebaseResyncModal({
	isOpen,
	onClose,
	projectName,
	payload,
	isStarting = false,
	creditMaximum = null,
	creditFree = false,
	status,
	statusError = null,
	onRequestNewToken,
	onRetrySync,
	analysis = null,
	analysisError = null,
	isAnalyzing = false,
	onRetryAnalysis,
	activeSessionId,
}: CodebaseResyncModalProps) {
	const [copied, setCopied] = useState(false);
	const [copyError, setCopyError] = useState<string | null>(null);
	const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		return () => {
			if (copyTimeoutRef.current) {
				clearTimeout(copyTimeoutRef.current);
				copyTimeoutRef.current = null;
			}
		};
	}, []);

	const resolvedRepositoryName =
		resolveCodebaseDisplayName(projectName) ?? "Repository belum terdeteksi";
	const promptText = payload
		? buildResyncPrompt(payload, { projectName: resolvedRepositoryName })
		: "";
	const stageView = resolveSyncStageView(status);

	const targetSessionId =
		activeSessionId ?? payload?.sessionId ?? status?.sessionId ?? null;
	const isVerified = isResyncSessionVerified({
		status,
		activeSessionId: targetSessionId,
	});

	const step1State: StepState = isStarting
		? "active"
		: payload
			? "done"
			: "failed";

	const step2State: StepState = stageView.hasStarted
		? "done"
		: stageView.failed
			? "failed"
			: payload
				? "active"
				: "pending";

	const step3State: StepState = isVerified
		? "done"
		: stageView.failed
			? "failed"
			: stageView.hasStarted
				? "active"
				: "pending";

	const handleCopy = async () => {
		if (!promptText) return;
		const result = await copyToClipboard(promptText);
		if (result.success) {
			setCopied(true);
			setCopyError(null);
			if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
			copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
		} else {
			setCopied(false);
			setCopyError(
				result.error ??
					"Gagal menyalin otomatis. Silakan salin teks secara manual.",
			);
			if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
			copyTimeoutRef.current = setTimeout(() => setCopyError(null), 4000);
		}
	};

	return (
		<Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
			<DialogContent
				data-testid="codebase-resync-panel"
				closeAriaLabel="Tutup sync ulang"
				className={cn(
					"sm:max-w-xl max-h-[85vh] p-0 flex flex-col gap-0 overflow-hidden outline-none bg-obsidian",
				)}
			>
				<DialogHeader className="flex shrink-0 flex-col border-b border-graphite p-5 sm:p-6 text-left pr-12">
					<DialogTitle className="font-inter text-base font-semibold text-snow sm:text-lg">
						Perbarui repository
					</DialogTitle>
					<DialogDescription className="mt-1 text-xs leading-relaxed text-fog">
						{resolvedRepositoryName}
						{creditMaximum !== null && creditMaximum > 0 && !creditFree
							? ` · Analisis: maksimal ${creditMaximum} kredit`
							: null}
					</DialogDescription>
				</DialogHeader>

				<div className="flex flex-1 flex-col gap-6 overflow-y-auto p-5 sm:p-6">
					<ResyncStep1Prompt
						stepState={step1State}
						payload={payload}
						isStarting={isStarting}
						promptText={promptText}
						copyError={copyError}
						copied={copied}
						onRequestNewToken={onRequestNewToken}
						onCopy={() => void handleCopy()}
					/>

					<ResyncStep2Agent stepState={step2State} />

					<ResyncStep3Progress
						stepState={step3State}
						status={status}
						statusError={statusError}
						stageView={stageView}
						isVerified={isVerified}
						isStarting={isStarting}
						isAnalyzing={isAnalyzing}
						analysis={analysis}
						analysisError={analysisError}
						onRetrySync={onRetrySync}
						onRetryAnalysis={onRetryAnalysis}
					/>
				</div>

				<DialogFooter className="flex shrink-0 items-center justify-end border-t border-graphite bg-obsidian px-5 py-3 sm:px-6">
					<button
						type="button"
						onClick={onClose}
						disabled={!isVerified}
						data-testid="resync-complete-button"
						aria-label={
							isVerified
								? "Selesai"
								: "Selesai (menunggu verifikasi sinkronisasi)"
						}
						className={cn(
							"inline-flex min-h-9 items-center gap-1.5 rounded-md px-4 font-sans text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo",
							isVerified
								? "bg-indigo text-snow hover:bg-indigo/90"
								: "cursor-not-allowed border border-graphite bg-charcoal/50 text-fog opacity-50",
						)}
					>
						<span>Selesai</span>
						{isVerified ? (
							<Icon
								icon={Tick01Icon}
								size={14}
								className="text-emerald-400"
								aria-hidden="true"
							/>
						) : (
							<Icon icon={LockIcon} size={14} aria-hidden="true" />
						)}
					</button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
