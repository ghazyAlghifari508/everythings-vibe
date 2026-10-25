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
		<div className="flex items-center justify-between pb-3 mb-3 border-b border-graphite/50">
			<span className="text-xs font-medium text-fog">Pertanyaan {index}</span>
			<span className="font-mono text-xs text-fog">
				{index} dari {totalQuestions ?? index}
			</span>
		</div>
	);
}
