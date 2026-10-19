"use client";

import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import type { AdaptiveQuestion } from "@/features/codebase/services/chat-flow";
import { CodebaseAdaptiveQuestion } from "./codebase-adaptive-question";

interface CodebaseChatWorkspaceQuestionsProps {
	visibleQuestions: AdaptiveQuestion[];
	totalQuestions: number;
	answers: Record<string, string>;
	currentIndex: number;
	editingQuestionId: string | null;
	onEditQuestion: (questionId: string) => void;
	onCancelEdit: () => void;
	onSubmit: (questionId: string, answer: string) => void;
}

export function CodebaseChatWorkspaceQuestions({
	visibleQuestions,
	totalQuestions,
	answers,
	currentIndex,
	editingQuestionId,
	onEditQuestion,
	onCancelEdit,
	onSubmit,
}: CodebaseChatWorkspaceQuestionsProps) {
	return (
		<>
			{visibleQuestions.map((question, qIndex) => {
				const isEditing = editingQuestionId === question.id;
				const isActive =
					isEditing || (editingQuestionId === null && qIndex === currentIndex);
				return (
					<CodebaseAdaptiveQuestion
						key={question.id}
						question={question}
						index={qIndex + 1}
						totalQuestions={totalQuestions}
						submitted={(answers[question.id] ?? "").trim()}
						active={isActive}
						isEditing={isEditing}
						onEdit={onEditQuestion}
						onCancelEdit={onCancelEdit}
						onSubmit={onSubmit}
					/>
				);
			})}
		</>
	);
}

interface CodebaseChatWorkspaceQuestionsCompleteProps {
	isConfirming: boolean;
	onConfirmGenerate?: () => void;
}

export function CodebaseChatWorkspaceQuestionsComplete({
	isConfirming,
	onConfirmGenerate,
}: CodebaseChatWorkspaceQuestionsCompleteProps) {
	return (
		<div
			data-testid="codebase-questions-complete"
			className="flex flex-col gap-1 py-1"
		>
			<div className="flex flex-wrap items-center justify-between gap-3">
				<span className="text-xs text-fog">
					<span className="font-medium text-snow/90">Berikutnya:</span>{" "}
					Spesifikasi fitur
				</span>
				<button
					type="button"
					disabled={isConfirming}
					onClick={() => onConfirmGenerate?.()}
					className="inline-flex min-h-8 items-center gap-1.5 rounded-md bg-snow px-3 text-xs font-semibold text-onyx transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
				>
					{isConfirming ? "Menyusun spesifikasi..." : "Buat Spesifikasi Fitur"}
					{!isConfirming ? (
						<Icon icon={ArrowRight01Icon} size={12} aria-hidden="true" />
					) : null}
				</button>
			</div>
			<p className="text-[11.5px] leading-relaxed text-fog/80">
				Semua pertanyaan sudah dijawab. Spesifikasi fitur disusun dari jawaban
				tersebut dan konteks repository.
			</p>
		</div>
	);
}
