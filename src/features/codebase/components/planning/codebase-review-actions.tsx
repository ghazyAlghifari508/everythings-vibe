"use client";

import {
	Alert02Icon,
	ArrowLeft01Icon,
	ArrowRight01Icon,
} from "@hugeicons/core-free-icons";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

interface CodebaseReviewActionsProps {
	snapshotId: string;
	snapshotCreatedAt?: string;
	isWorking: boolean;
	errorMessage?: string | null;
	continueLabel: string;
	onRetrySync?: () => void;
	onRetryAnalysis?: () => void;
	onContinue: () => void;
	onBackToSync?: () => void;
}

export function CodebaseReviewActions({
	snapshotId,
	snapshotCreatedAt,
	isWorking,
	errorMessage,
	continueLabel,
	onRetrySync,
	onRetryAnalysis,
	onContinue,
	onBackToSync,
}: CodebaseReviewActionsProps) {
	return (
		<>
			{/* Error Recovery Banner (only shown if error occurred) */}
			{errorMessage && (
				<Alert
					variant="default"
					className="rounded-xl border border-graphite/80 bg-charcoal p-3.5 text-xs text-snow shadow-none"
				>
					<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
						<div className="flex items-start gap-2.5 min-w-0">
							<Icon
								icon={Alert02Icon}
								size={16}
								aria-hidden="true"
								className="mt-0.5 shrink-0 text-crimson"
							/>
							<div className="flex flex-col gap-0.5 min-w-0">
								<AlertTitle className="text-xs font-semibold text-snow">
									Analisis codebase belum berhasil
								</AlertTitle>
								<AlertDescription className="mt-0 text-xs text-fog leading-relaxed">
									<span>{errorMessage}</span>
								</AlertDescription>
							</div>
						</div>
						<div className="flex items-center gap-2 shrink-0">
							{onRetrySync && (
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={onRetrySync}
									disabled={isWorking}
									className="h-8 border-graphite bg-obsidian px-3 font-mono text-[11px] text-snow hover:bg-graphite/30 disabled:opacity-50"
								>
									Sync ulang
								</Button>
							)}
							{onRetryAnalysis && (
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={onRetryAnalysis}
									disabled={isWorking}
									className="h-8 border-graphite bg-obsidian px-3 font-mono text-[11px] text-snow hover:bg-graphite/30 disabled:opacity-50"
								>
									{isWorking ? "Memproses..." : "Analisis ulang"}
								</Button>
							)}
						</div>
					</div>
				</Alert>
			)}

			{/* Screen Nav / Actions */}

			{/* Prev/next navigation: previous aligns left, primary aligns
			right on desktop; stacked full-width actions on mobile. */}
			<div
				data-testid="review-nav"
				data-snapshot-id={snapshotId}
				data-snapshot-created-at={snapshotCreatedAt}
				className="flex flex-col items-stretch gap-3 text-xs sm:flex-row sm:items-center sm:justify-between border-t border-graphite pt-4"
			>
				{onBackToSync ? (
					<button
						type="button"
						onClick={onBackToSync}
						className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-graphite bg-transparent px-4 py-2 text-xs font-medium text-fog hover:text-snow hover:border-iron hover:bg-steel/10 transition cursor-pointer sm:justify-start"
					>
						<Icon icon={ArrowLeft01Icon} size={14} aria-hidden="true" />
						<span>Kembali ke Sinkronisasi</span>
					</button>
				) : (
					<span aria-hidden="true" />
				)}
				<button
					type="button"
					onClick={onContinue}
					disabled={isWorking}
					className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-snow px-4 py-2 font-inter text-xs font-semibold text-onyx shadow-sm hover:brightness-105 active:scale-[0.98] transition disabled:opacity-50 cursor-pointer sm:ml-auto"
				>
					<span>{continueLabel}</span>
					<Icon icon={ArrowRight01Icon} size={14} aria-hidden="true" />
				</button>
			</div>
		</>
	);
}
