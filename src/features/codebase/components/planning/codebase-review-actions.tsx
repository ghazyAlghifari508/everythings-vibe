"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";

function formatTimestamp(value?: string): string {
	if (!value) return "Tidak tersedia";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "Tidak tersedia";
	return date.toLocaleString("id-ID");
}

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
				<div
					role="alert"
					className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-crimson/30 bg-crimson/10 p-3.5 text-xs text-crimson"
				>
					<div className="flex items-center gap-2">
						<span className="font-semibold">Gagal:</span>
						<span>{errorMessage}</span>
					</div>
					<div className="flex items-center gap-2">
						{onRetrySync && (
							<button
								type="button"
								onClick={onRetrySync}
								disabled={isWorking}
								className="rounded border border-crimson/40 px-3 py-1.5 text-xs font-medium text-crimson hover:bg-crimson/15 transition disabled:opacity-50"
							>
								Sync ulang
							</button>
						)}
						{onRetryAnalysis && (
							<button
								type="button"
								onClick={onRetryAnalysis}
								disabled={isWorking}
								className="rounded border border-crimson/40 px-3 py-1.5 text-xs font-medium text-crimson hover:bg-crimson/15 transition disabled:opacity-50"
							>
								{isWorking ? "Memproses..." : "Analisis ulang"}
							</button>
						)}
					</div>
				</div>
			)}

			{/* Screen Nav / Actions */}
			<div className="flex flex-wrap items-center gap-3 text-fog text-[11px] border-t border-graphite pt-4">
				<span>
					ID: <span className="font-mono text-snow">{snapshotId}</span>
				</span>
				<span>· {formatTimestamp(snapshotCreatedAt)}</span>
			</div>

			{/* Prev/next navigation: previous aligns left, primary aligns
			right on desktop; stacked full-width actions on mobile. */}
			<div
				data-testid="review-nav"
				className="flex flex-col items-stretch gap-3 text-xs sm:flex-row sm:items-center sm:justify-between"
			>
				{onBackToSync ? (
					<button
						type="button"
						onClick={onBackToSync}
						className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-graphite bg-transparent px-4 py-2 text-xs font-medium text-fog hover:text-snow hover:border-iron hover:bg-steel/10 transition cursor-pointer sm:justify-start"
					>
						<ArrowLeft size={14} aria-hidden="true" />
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
					<ArrowRight size={14} aria-hidden="true" />
				</button>
			</div>
		</>
	);
}
