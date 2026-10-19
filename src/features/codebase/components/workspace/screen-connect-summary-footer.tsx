"use client";

import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";

interface ScreenConnectSummaryFooterProps {
	/** True once a usable snapshot exists and the owner offered the next step. */
	canAdvance: boolean;
	isLegacyAnalysisMissingSuggestions: boolean;
	onContinueToSummary: () => void;
}

export function ScreenConnectSummaryFooter({
	canAdvance,
	isLegacyAnalysisMissingSuggestions,
	onContinueToSummary,
}: ScreenConnectSummaryFooterProps) {
	return (
		<div className="flex flex-col items-center justify-between gap-3 border-t border-graphite bg-charcoal/60 px-5 py-4 sm:flex-row sm:px-6">
			{canAdvance ? (
				<p className="text-center text-[11px] leading-relaxed text-fog sm:text-left">
					Sinkronisasi selesai. Lanjutkan untuk melihat ringkasan codebase.
				</p>
			) : isLegacyAnalysisMissingSuggestions ? (
				<p className="text-center text-[11px] leading-relaxed text-fog sm:text-left">
					Perbarui rekomendasi task awal untuk melanjutkan ke kesimpulan.
				</p>
			) : (
				<span className="hidden sm:inline" />
			)}
			<button
				type="button"
				data-testid="sync-continue-to-summary"
				onClick={onContinueToSummary}
				disabled={!canAdvance}
				className="ml-auto inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md bg-snow px-5 py-2 font-inter text-xs font-semibold text-onyx shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
			>
				<span>Lanjut ke Kesimpulan</span>
				<Icon icon={ArrowRight01Icon} size={14} aria-hidden="true" />
			</button>
		</div>
	);
}
