"use client";

import { useCallback, useEffect, useState } from "react";
import type { AnswersPersistenceState } from "@/features/codebase/hooks/use-workspace-handoff-persistence";
import type { AdaptiveQuestion } from "@/features/codebase/services/chat-flow";
import {
	areAllQuestionsAnswered,
	nextQuestionIndex,
} from "../../services/chat-flow";
import { CodebaseAdaptiveQuestion } from "./codebase-adaptive-question";
import { CodebaseChatWorkspaceAnswersSaveError } from "./codebase-chat-workspace-error-rows";

export interface CodebaseChatWorkspaceQuestionsProps {
	/** Every question of this round; the wizard reveals exactly one at a time. */
	questions: AdaptiveQuestion[];
	answers: Record<string, string>;
	/** Review mode: answers are shown, never edited, and nothing is generated. */
	readOnly: boolean;
	/** Offer the final specification action on the last question. */
	showFinalAction?: boolean;
	/** A generation is already running; the final action reports it and stays shut. */
	isConfirming?: boolean;
	persistence?: AnswersPersistenceState;
	onConfirmGenerate?: () => void;
	onSubmit: (questionId: string, answer: string) => void;
}

/**
 * First step the wizard opens on: the first unanswered question, or the last
 * question when every answer is already stored — that is where the final
 * specification action lives.
 */
function initialStep(
	answers: Record<string, string>,
	questions: readonly AdaptiveQuestion[],
): number {
	const unanswered = nextQuestionIndex(answers, questions);
	return unanswered === -1 ? Math.max(questions.length - 1, 0) : unanswered;
}

/** Whether the answer map holds a value for every question but `step`: the
 *  step's own answer is validated by the card before the final action fires. */
function answersCompleteApartFrom(
	answers: Record<string, string>,
	questions: readonly AdaptiveQuestion[],
	step: number,
): boolean {
	return questions.every(
		(question, index) =>
			index === step || (answers[question.id] ?? "").trim().length > 0,
	);
}

/** Wizard state owned by one round of questions. `key` is the round's identity:
 *  a new set of questions re-derives the step that answers imply instead of
 *  inheriting the previous round's position. */
interface WizardState {
	key: string;
	step: number;
	awaitingFinal: boolean;
}

/**
 * The adaptive question wizard: one question card, one step at a time.
 *
 * The step is wizard state, not "the next unanswered question", so `Sebelumnya`
 * reopens an earlier question with its stored answer already selected and
 * `Berikutnya` stores the current answer before moving on. Answered questions
 * are never re-rendered as summary cards beside the active one, and the final
 * specification action is the last step's forward control instead of a
 * separate block below the list.
 */
export function CodebaseChatWorkspaceQuestions({
	questions,
	answers,
	readOnly,
	showFinalAction = false,
	isConfirming = false,
	persistence,
	onConfirmGenerate,
	onSubmit,
}: CodebaseChatWorkspaceQuestionsProps) {
	const roundKey = questions.map((question) => question.id).join("\u0000");
	const [state, setState] = useState<WizardState>(() => ({
		key: roundKey,
		step: initialStep(answers, questions),
		awaitingFinal: false,
	}));
	/** The user's own position while the round holds, the answers' own position
	 *  once a new round arrives. */
	const rebase = useCallback(
		(previous: WizardState): WizardState =>
			previous.key === roundKey
				? previous
				: {
						key: roundKey,
						step: initialStep(answers, questions),
						awaitingFinal: false,
					},
		[roundKey, answers, questions],
	);
	const { step, awaitingFinal } = rebase(state);
	const update = useCallback(
		(next: Partial<WizardState>) =>
			setState((previous) => ({ ...rebase(previous), ...next })),
		[rebase],
	);

	const lastIndex = questions.length - 1;
	const current = Math.min(step, lastIndex);
	const question = questions[current];

	// The final action hands the stored answer to generation: it waits until the
	// answer the card just submitted is part of the answers the confirm reads,
	// so the specification is never generated from a stale answer set.
	const allAnswered = areAllQuestionsAnswered(answers, questions);
	useEffect(() => {
		if (!awaitingFinal || !allAnswered) return;
		update({ awaitingFinal: false });
		onConfirmGenerate?.();
	}, [awaitingFinal, allAnswered, onConfirmGenerate, update]);

	if (!question) return null;

	const isLast = current === lastIndex;
	const saveFailed = persistence?.status === "error";
	const finalDisabled =
		saveFailed ||
		isConfirming ||
		!answersCompleteApartFrom(answers, questions, current);

	return (
		<div className="flex flex-col gap-3">
			<CodebaseAdaptiveQuestion
				question={question}
				index={current + 1}
				totalQuestions={questions.length}
				submitted={(answers[question.id] ?? "").trim()}
				active={!readOnly}
				onSubmit={onSubmit}
				nav={{
					onPrevious:
						current > 0 ? () => update({ step: current - 1 }) : undefined,
					onNext: isLast
						? showFinalAction && !readOnly
							? () => update({ awaitingFinal: true })
							: undefined
						: () => update({ step: current + 1 }),
					nextLabel: isLast
						? isConfirming
							? "Menyusun spesifikasi..."
							: "Buat Spesifikasi Fitur"
						: "Berikutnya",
					nextDisabled: isLast ? finalDisabled : saveFailed,
					isFinal: isLast && showFinalAction && !readOnly,
				}}
			/>

			{saveFailed && persistence?.error ? (
				<CodebaseChatWorkspaceAnswersSaveError
					message={persistence.error}
					title="Jawaban belum berhasil disimpan"
					actionLabel="Coba simpan ulang"
					isRetrying={false}
					onRetry={readOnly ? undefined : persistence.onRetry}
				/>
			) : null}
		</div>
	);
}
