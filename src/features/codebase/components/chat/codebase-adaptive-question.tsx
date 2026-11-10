"use client";

import { useAdaptiveQuestionSelection } from "@/features/codebase/hooks/use-adaptive-question-selection";
import type { AdaptiveQuestion } from "@/features/codebase/services/chat-flow";
import {
	type AdaptiveQuestionNav,
	CodebaseAdaptiveQuestionActive,
} from "./codebase-adaptive-question-active";

export type { AdaptiveQuestionNav };

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
	/** This card is the wizard's current step and accepts input. */
	active: boolean;
	/** Wizard navigation rendered inside the card's own footer. */
	nav: AdaptiveQuestionNav;
	onSubmit: (questionId: string, answer: string) => void;
}

/**
 * One adaptive question, rendered as a real form control group.
 *
 * The wizard renders exactly one of these at a time: the card owns the answer
 * draft and the wizard owns which question is current, so an answered question
 * is never duplicated as a summary block elsewhere on the surface.
 *
 * Interaction:
 * - Single-select uses HeroUI's React Aria radio group, multi-select uses its
 *   checkbox group, so keyboard selection and `aria-describedby` come from the
 *   library instead of a hand-rolled control.
 * - The free-text option ("Lainnya") is part of the same control group.
 * - The footer's forward control stores the answer before moving on; on the last
 *   question it is the final specification action.
 */
export function CodebaseAdaptiveQuestion({
	question,
	index,
	totalQuestions,
	submitted,
	active,
	nav,
	onSubmit,
}: CodebaseAdaptiveQuestionProps) {
	const selection = useAdaptiveQuestionSelection({
		question,
		customId: customOptionId(question.id),
		submitted,
		active,
		onSubmit,
	});

	return (
		<CodebaseAdaptiveQuestionActive
			question={question}
			index={index}
			totalQuestions={totalQuestions}
			active={active}
			selection={selection}
			nav={nav}
		/>
	);
}
