"use client";

import { Label, ProgressBar } from "@heroui/react";

interface CodebaseAdaptiveQuestionProgressProps {
	/** 1-based position shown as the question marker. */
	index: number;
	/** Total questions count for the progress counter (e.g. 2 dari 4). */
	totalQuestions?: number;
}

/**
 * Where the wizard stands: HeroUI's React Aria `ProgressBar` supplies the
 * `role="progressbar"` element, its label association, the `aria-valuenow` /
 * `aria-valuetext` pair, and the fill width, so the position is announced as a
 * real value instead of being implied by layout alone.
 *
 * The layout utilities are explicit because this app does not import
 * `@heroui/styles`; they are the same Tailwind token layer every other HeroUI
 * control in this feature is styled with.
 */
export function CodebaseAdaptiveQuestionProgress({
	index,
	totalQuestions,
}: CodebaseAdaptiveQuestionProgressProps) {
	const total = totalQuestions ?? index;
	return (
		<ProgressBar
			value={index}
			maxValue={Math.max(total, 1)}
			size="sm"
			valueLabel={`Pertanyaan ${index} dari ${total}`}
			className="mb-3 flex flex-col gap-2 border-b border-graphite/50 pb-3"
		>
			<span className="flex items-center justify-between gap-3">
				<Label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fog">
					Pertanyaan {index}
				</Label>
				<ProgressBar.Output className="font-mono text-[11px] tabular-nums text-fog">
					{index} dari {total}
				</ProgressBar.Output>
			</span>
			<ProgressBar.Track className="relative block h-1 w-full overflow-hidden rounded-full bg-graphite/40">
				<ProgressBar.Fill className="absolute inset-y-0 start-0 rounded-full bg-indigo" />
			</ProgressBar.Track>
		</ProgressBar>
	);
}
