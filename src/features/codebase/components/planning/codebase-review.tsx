"use client";

import type { CodebaseAnalysis } from "@/features/codebase/services/analysis";
import { CodebaseReviewActions } from "./codebase-review-actions";
import { CodebaseReviewEnvironmentPanel } from "./codebase-review-environment-panel";
import { CodebaseReviewImpactSections } from "./codebase-review-impact-sections";
import { CodebaseReviewRepositoryPanel } from "./codebase-review-repository-panel";

interface CodebaseReviewProps {
	analysis: CodebaseAnalysis;
	snapshotId: string;
	snapshotCreatedAt?: string;
	fileCount?: number;
	excludedCount?: number;
	isWorking?: boolean;
	errorMessage?: string | null;
	// Optional action labels so new consumers (e.g. /plan/codebase onboarding)
	// can reuse this canonical review without duplicating its markup.
	continueLabel?: string;
	onRetrySync?: () => void;
	onRetryAnalysis?: () => void;
	onContinue: () => void;
	onBackToSync?: () => void;
}

export function CodebaseReview({
	analysis,
	snapshotId,
	snapshotCreatedAt,
	fileCount,
	excludedCount,
	isWorking = false,
	errorMessage,
	continueLabel = "Lanjut ke Pertanyaan",
	onRetrySync,
	onRetryAnalysis,
	onContinue,
	onBackToSync,
}: CodebaseReviewProps) {
	return (
		<div className="w-full animate-enter flex flex-col gap-6">
			{/* Page Head matching existing-codebase-flow.html screen 04 */}
			<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
				<div>
					<div className="text-[11px] font-mono tracking-widest uppercase text-fog mb-2">
						CODEBASE ANALYSIS · REVIEW BEFORE GENERATE
					</div>
					<h1 className="font-inter text-2xl sm:text-3xl font-[620] tracking-tight text-snow leading-tight">
						Kami menemukan konteks aplikasimu.
					</h1>
					<p className="mt-2 text-xs sm:text-sm text-fog max-w-xl leading-relaxed">
						Review ringkasan ini sebelum everythings-vibe membuat pertanyaan.
						Kamu bisa mengoreksi hasil deteksi yang tidak sesuai.
					</p>
				</div>
				<span className="inline-flex items-center gap-1.5 rounded-md border border-graphite bg-charcoal px-2.5 py-1 text-xs font-[510] text-fog self-start sm:self-auto">
					Sync selesai
				</span>
			</div>

			{/* Application summary: what the app is about, from the validated
		analysis contract. Never fabricated: legacy output without a summary
		renders an honest fallback instead. */}
			<div
				data-testid="review-app-summary"
				className="rounded-xl border border-graphite bg-charcoal overflow-hidden shadow-sm"
			>
				<div className="border-b border-graphite p-4 sm:p-5">
					<h3 className="font-inter text-sm font-[600] text-snow">
						Ringkasan aplikasi
					</h3>
				</div>
				<div className="p-4 sm:p-5">
					{analysis.summary && analysis.summary.trim().length > 0 ? (
						<p className="text-xs sm:text-sm text-mist leading-relaxed">
							{analysis.summary}
						</p>
					) : (
						<p className="text-xs text-slate italic leading-relaxed">
							Ringkasan aplikasi belum tersedia untuk analisis ini. Jalankan
							analisis ulang untuk menghasilkan ringkasan.
						</p>
					)}
				</div>
			</div>

			{/* Summary Grid (2 Columns: Detected Environment + Repository Map) */}
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<CodebaseReviewEnvironmentPanel analysis={analysis} />
				<CodebaseReviewRepositoryPanel
					analysis={analysis}
					fileCount={fileCount}
					excludedCount={excludedCount}
				/>
			</div>

			{/* Panel 3: Potential Impact Areas from existing-codebase-flow.html */}
			<div className="rounded-xl border border-graphite bg-charcoal overflow-hidden shadow-sm">
				<div className="flex items-center justify-between border-b border-graphite p-4 sm:p-5">
					<h3 className="font-inter text-sm font-[600] text-snow">
						Potential impact areas
					</h3>
					<span className="rounded border border-graphite bg-obsidian px-2.5 py-0.5 font-mono text-[10px] text-fog">
						AI generated · review
					</span>
				</div>

				<div className="p-4 sm:p-5 flex flex-col gap-5">
					<CodebaseReviewImpactSections analysis={analysis} />
					<CodebaseReviewActions
						snapshotId={snapshotId}
						snapshotCreatedAt={snapshotCreatedAt}
						isWorking={isWorking}
						errorMessage={errorMessage}
						continueLabel={continueLabel}
						onRetrySync={onRetrySync}
						onRetryAnalysis={onRetryAnalysis}
						onContinue={onContinue}
						onBackToSync={onBackToSync}
					/>
				</div>
			</div>
		</div>
	);
}
