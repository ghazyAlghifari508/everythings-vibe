"use client";

import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import type { AdaptiveQuestionSelection } from "@/features/codebase/hooks/use-adaptive-question-selection";
import type { AdaptiveQuestion } from "@/features/codebase/services/chat-flow";
import { CodebaseAdaptiveQuestionAnswerInput } from "./codebase-adaptive-question-answer-input";
import { CodebaseAdaptiveQuestionOptions } from "./codebase-adaptive-question-options";
import { CodebaseAdaptiveQuestionProgress } from "./codebase-adaptive-question-progress";

/** Navigation the wizard hands to the one card it renders. */
export interface AdaptiveQuestionNav {
	/** Absent on the first question. */
	onPrevious?: () => void;
	/** Absent when this step has no forward action to offer. */
	onNext?: () => void;
	/** Label of the forward control. */
	nextLabel: string;
	/**
	 * Wizard gate on top of the card's own answer validity: the final action
	 * stays disabled until every answer is valid and persisted, and the retry
	 * of a failed save owns the way forward again.
	 */
	nextDisabled?: boolean;
	/** The forward control is the final "Buat Spesifikasi Fitur" action. */
	isFinal?: boolean;
}

interface CodebaseAdaptiveQuestionActiveProps {
	question: AdaptiveQuestion;
	index: number;
	totalQuestions?: number;
	/** The current wizard step that accepts input; false while reviewing. */
	active: boolean;
	selection: AdaptiveQuestionSelection;
	nav: AdaptiveQuestionNav;
}

/**
 * The single question card: progress, title, the control group, and the
 * wizard footer. `Berikutnya` stores the current answer before it moves on and
 * the last step's control is the final specification action, so no separate
 * CTA block is ever stacked below the card.
 */
export function CodebaseAdaptiveQuestionActive({
	question,
	index,
	totalQuestions,
	active,
	selection,
	nav,
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

	// The forward control requires a valid answer while the step is editable, and
	// always honours the wizard's own gate: unanswered siblings, an unsaved
	// handoff, or a generation already running.
	const forwardDisabled = nav.nextDisabled === true || (active && !canSubmit);

	const handleForward = () => {
		if (active) handleSubmit();
		nav.onNext?.();
	};

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
						disabled={!active}
						value={customText}
						placeholder={question.customPlaceholder ?? "Tulis jawabanmu..."}
						className="h-11 border-graphite bg-steel/60 text-xs text-snow"
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
					disabled={!active}
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

			{nav.onPrevious || nav.onNext ? (
				<div className="mt-4 flex items-center justify-between gap-2 border-t border-graphite/40 pt-3">
					{nav.onPrevious ? (
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={nav.onPrevious}
							className="gap-1.5 text-xs text-fog hover:text-snow"
						>
							<Icon icon={ArrowLeft01Icon} size={12} aria-hidden="true" />
							Sebelumnya
						</Button>
					) : (
						<span aria-hidden="true" />
					)}
					{nav.onNext ? (
						<Button
							type="button"
							size="sm"
							disabled={forwardDisabled}
							onClick={handleForward}
							data-testid={
								nav.isFinal ? "codebase-questions-complete" : undefined
							}
							className="min-h-9 gap-1.5 px-4 text-xs font-semibold"
						>
							{nav.nextLabel}
							<Icon icon={ArrowRight01Icon} size={12} aria-hidden="true" />
						</Button>
					) : null}
				</div>
			) : null}
		</div>
	);
}
