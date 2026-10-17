"use client";

import { useAdaptiveQuestionSelection } from "@/features/codebase/hooks/use-adaptive-question-selection";
import type { AdaptiveQuestion } from "@/features/codebase/services/chat-flow";
import { CodebaseAdaptiveQuestionActive } from "./codebase-adaptive-question-active";
import { CodebaseAdaptiveQuestionAnswered } from "./codebase-adaptive-question-answered";

/** Sentinel option id for the free-text choice. Option ids are
 *  `${questionId}-optN`, so this suffix can never collide with one. */
export const CUSTOM_OPTION_SUFFIX = "-custom";

export function customOptionId(questionId: string): string {
	return `${questionId}${CUSTOM_OPTION_SUFFIX}`;
}

export interface CodebaseAdaptiveQuestionProps {
	question: AdaptiveQuestion;
	/** 1-based position shown as the question marker. */
	index: number;
	/** Total questions count for the progress counter (e.g. 2 dari 4). */
	totalQuestions?: number;
	/** The answer already accepted for this question, empty while unanswered. */
	submitted: string;
	/** Only the current question accepts input; earlier ones stay locked. */
	active: boolean;
	onSubmit: (questionId: string, answer: string) => void;
	onEdit?: (questionId: string) => void;
	isEditing?: boolean;
	onCancelEdit?: () => void;
}

/**
 * One adaptive question, rendered as a real form control group.
 *
 * Progressive disclosure interaction:
 * - Answered questions appear as compact single-line summaries with an edit trigger.
 * - The active question appears as a focused, structured card with a progress counter.
 * - Single-select uses a native radio group, multi-select uses fieldset checkboxes.
 * - Free-text option ("Lainnya") is part of the same control group.
 */
export function CodebaseAdaptiveQuestion({
	question,
	index,
	totalQuestions,
	submitted,
	active,
	onSubmit,
	onEdit,
	isEditing = false,
	onCancelEdit,
}: CodebaseAdaptiveQuestionProps) {
	const selection = useAdaptiveQuestionSelection({
		question,
		customId: customOptionId(question.id),
		submitted,
		active,
		isEditing,
		onSubmit,
	});

	// 1. Answered State: Render as compact completed line
	if (submitted && !isEditing) {
		return (
			<CodebaseAdaptiveQuestionAnswered
				question={question}
				index={index}
				submitted={submitted}
				onEdit={onEdit}
			/>
		);
	}

	// 2. Active Question Card
	return (
		<CodebaseAdaptiveQuestionActive
			question={question}
			index={index}
			totalQuestions={totalQuestions}
			active={active}
			isEditing={isEditing}
			selection={selection}
			onCancelEdit={onCancelEdit}
		/>
	);
}
