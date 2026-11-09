"use client";

interface CodebaseAdaptiveQuestionProgressProps {
	/** 1-based position shown as the question marker. */
	index: number;
	/** Total questions count for the progress counter (e.g. 2 dari 4). */
	totalQuestions?: number;
}

export function CodebaseAdaptiveQuestionProgress({
	index,
	totalQuestions,
}: CodebaseAdaptiveQuestionProgressProps) {
	return (
		<div className="mb-3 flex items-center justify-between gap-3 border-b border-graphite/50 pb-2.5">
			<span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fog">
				Pertanyaan {index}
			</span>
			<span className="font-mono text-[11px] tabular-nums text-fog">
				{index} dari {totalQuestions ?? index}
			</span>
		</div>
	);
}
