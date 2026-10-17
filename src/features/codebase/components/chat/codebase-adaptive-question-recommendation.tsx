"use client";

import type { AdaptiveQuestion } from "@/features/codebase/services/chat-flow";

interface CodebaseAdaptiveQuestionRecommendationProps {
	question: AdaptiveQuestion;
	reasonId: string;
}

export function CodebaseAdaptiveQuestionRecommendation({
	question,
	reasonId,
}: CodebaseAdaptiveQuestionRecommendationProps) {
	if (!question.recommendedOptionId || !question.recommendationReason) {
		return null;
	}

	const recommendedOption = question.options.find(
		(opt) => opt.id === question.recommendedOptionId,
	);
	const recommendedLabel = recommendedOption?.label;

	return (
		<div
			id={reasonId}
			data-testid={`adaptive-question-reason-${question.id}`}
			className="mt-3.5 rounded-lg border border-indigo/25 bg-indigo/5 p-3 text-xs leading-relaxed text-fog"
		>
			{recommendedLabel ? (
				<p className="font-medium text-snow text-xs mb-1">
					Rekomendasi: <span className="text-indigo">{recommendedLabel}</span>
				</p>
			) : (
				<p className="font-medium text-snow text-xs mb-1">Rekomendasi</p>
			)}
			<p className="text-[11.5px] leading-relaxed text-fog">
				Alasan berdasarkan codebase: {question.recommendationReason}
			</p>
		</div>
	);
}
