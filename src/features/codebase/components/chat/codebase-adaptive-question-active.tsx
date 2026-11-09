"use client";

import { Button } from "@/components/ui/button";
import type { AdaptiveQuestionSelection } from "@/features/codebase/hooks/use-adaptive-question-selection";
import type { AdaptiveQuestion } from "@/features/codebase/services/chat-flow";
import { CodebaseAdaptiveQuestionAnswerInput } from "./codebase-adaptive-question-answer-input";
import { CodebaseAdaptiveQuestionOptions } from "./codebase-adaptive-question-options";
import { CodebaseAdaptiveQuestionProgress } from "./codebase-adaptive-question-progress";

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
		handleMultiChange,
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

			{/* The heading is the card's focal point: metadata stays small and the
			    question itself carries the largest text on the surface. */}
			<p
				id={titleId}
				className="text-pretty text-[15px] font-semibold leading-snug text-snow sm:text-base"
			>
				{question.title}
			</p>

			{isText ? (
				<div className="mt-3">
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
					selectedMultiIds={multiOptionIds}
					selectedId={selectedOptionId}
					disabled={!active && !isEditing}
					groupName={groupName}
					customId={customId}
					customChosen={customChosen}
					customText={customText}
					customInputId={inputId}
					customPlaceholder={question.customPlaceholder}
					recommendedOptionId={question.recommendedOptionId}
					recommendationReason={question.recommendationReason}
					onSelect={handleOptionChange}
					onSelectMany={handleMultiChange}
					onCustomTextChange={setCustomText}
					onCustomSubmit={handleSubmit}
				/>
			)}

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
						size="sm"
						disabled={!canSubmit}
						onClick={handleSubmit}
						className="min-h-9 px-4 text-xs font-semibold"
					>
						Konfirmasi <span className="sr-only">Kirim Jawaban</span>
					</Button>
				</div>
			) : null}
		</div>
	);
}
