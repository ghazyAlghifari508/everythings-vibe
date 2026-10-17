"use client";

import { Button } from "@/components/ui/button";
import type { AdaptiveQuestionSelection } from "@/features/codebase/hooks/use-adaptive-question-selection";
import type { AdaptiveQuestion } from "@/features/codebase/services/chat-flow";
import { CodebaseAdaptiveQuestionAnswerInput } from "./codebase-adaptive-question-answer-input";
import { CodebaseAdaptiveQuestionOptions } from "./codebase-adaptive-question-options";
import { CodebaseAdaptiveQuestionProgress } from "./codebase-adaptive-question-progress";
import { CodebaseAdaptiveQuestionRecommendation } from "./codebase-adaptive-question-recommendation";

interface CodebaseAdaptiveQuestionActiveProps {
	question: AdaptiveQuestion;
	index: number;
	totalQuestions?: number;
	active: boolean;
	isEditing: boolean;
	selection: AdaptiveQuestionSelection;
	onCancelEdit?: () => void;
}

export function CodebaseAdaptiveQuestionActive({
	question,
	index,
	totalQuestions,
	active,
	isEditing,
	selection,
	onCancelEdit,
}: CodebaseAdaptiveQuestionActiveProps) {
	const {
		groupName,
		customId,
		inputId,
		reasonId,
		titleId,
		isMulti,
		isText,
		customChosen,
		canSubmit,
		selectedOptionId,
		multiOptionIds,
		customText,
		setCustomText,
		handleOptionChange,
		handleSubmit,
	} = selection;

	return (
		<div
			data-testid={`adaptive-question-${question.id}`}
			className="rounded-xl border border-graphite bg-charcoal p-4 sm:p-5 shadow-sm"
		>
			<CodebaseAdaptiveQuestionProgress
				index={index}
				totalQuestions={totalQuestions}
			/>

			<p
				id={titleId}
				className="text-sm sm:text-[15px] font-semibold text-snow leading-snug mb-3.5"
			>
				{question.title}
			</p>

			{isText ? (
				<div className="mt-2">
					<CodebaseAdaptiveQuestionAnswerInput
						id={inputId}
						label={question.title}
						disabled={!active && !isEditing}
						value={customText}
						placeholder={question.customPlaceholder ?? "Tulis jawabanmu..."}
						className="text-xs h-11 bg-steel/60 text-snow border-graphite"
						onChange={setCustomText}
						onSubmit={handleSubmit}
					/>
				</div>
			) : (
				<CodebaseAdaptiveQuestionOptions
					isMulti={isMulti}
					labelledBy={titleId}
					options={question.options}
					selectedIds={isMulti ? multiOptionIds : selectedOptionId}
					disabled={!active && !isEditing}
					groupName={groupName}
					customId={customId}
					customChosen={customChosen}
					customText={customText}
					customInputId={inputId}
					customPlaceholder={question.customPlaceholder}
					recommendationReasonId={
						question.recommendedOptionId && question.recommendationReason
							? reasonId
							: undefined
					}
					onSelect={handleOptionChange}
					onCustomTextChange={setCustomText}
					onCustomSubmit={handleSubmit}
				/>
			)}

			<CodebaseAdaptiveQuestionRecommendation
				question={question}
				reasonId={reasonId}
			/>

			{active || isEditing ? (
				<div className="mt-4 flex items-center justify-end gap-2 pt-3 border-t border-graphite/40">
					{isEditing && onCancelEdit ? (
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={onCancelEdit}
							className="text-xs text-fog hover:text-snow"
						>
							Batal
						</Button>
					) : null}
					<Button
						type="button"
						disabled={!canSubmit}
						onClick={handleSubmit}
						className="min-h-9 rounded-md bg-snow px-4 text-xs font-semibold text-onyx transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
					>
						Konfirmasi <span className="sr-only">Kirim Jawaban</span>
					</Button>
				</div>
			) : null}
		</div>
	);
}
