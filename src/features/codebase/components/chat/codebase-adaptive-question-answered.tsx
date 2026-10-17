"use client";

import { Check } from "lucide-react";
import type { AdaptiveQuestion } from "@/features/codebase/services/chat-flow";

interface CodebaseAdaptiveQuestionAnsweredProps {
	question: AdaptiveQuestion;
	index: number;
	submitted: string;
	onEdit?: (questionId: string) => void;
}

export function CodebaseAdaptiveQuestionAnswered({
	question,
	index,
	submitted,
	onEdit,
}: CodebaseAdaptiveQuestionAnsweredProps) {
	return (
		<div
			data-testid={`adaptive-question-${question.id}`}
			className="group flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg border border-graphite/60 bg-charcoal/40 px-3.5 py-2.5 text-xs text-mist transition-colors hover:border-steel/60 hover:bg-charcoal/70"
		>
			<div className="flex items-center gap-2 min-w-0">
				<span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-emerald/15 text-emerald text-[11px] font-bold">
					<Check size={11} aria-hidden="true" />
				</span>
				<span className="font-medium text-snow/90 shrink-0">
					Q{index} · {question.title}:
				</span>
				<span className="truncate text-mist font-normal">
					Jawaban: {submitted}
				</span>
			</div>
			{onEdit ? (
				<button
					type="button"
					onClick={() => onEdit(question.id)}
					className="shrink-0 text-[11px] font-medium text-fog hover:text-snow underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo rounded px-1.5 py-0.5"
				>
					Ubah
				</button>
			) : null}
		</div>
	);
}
