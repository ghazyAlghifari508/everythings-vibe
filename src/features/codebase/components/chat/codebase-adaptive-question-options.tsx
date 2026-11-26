"use client";

import { CheckboxGroup, RadioGroup } from "@heroui/react";
import type { AdaptiveQuestionOption } from "@/features/codebase/services/chat-flow";
import { orderOptionsForDisplay } from "@/features/codebase/services/chat-flow-questions";
import { CodebaseAdaptiveQuestionAnswerInput } from "./codebase-adaptive-question-answer-input";
import { CodebaseAdaptiveQuestionOptionRow } from "./codebase-adaptive-question-option-row";

interface CodebaseAdaptiveQuestionOptionsProps {
	isMulti: boolean;
	labelledBy: string;
	options: AdaptiveQuestionOption[];
	/** Current multi-select selection (ids). */
	selectedMultiIds: string[];
	/** Current single-select selection, null before the user chooses. */
	selectedId: string | null;
	disabled: boolean;
	groupName: string;
	customId: string;
	customChosen: boolean;
	customText: string;
	customInputId: string;
	customPlaceholder?: string;
	/** The option the model recommended, from FIX 01's data. Only this id moves
	 *  to the top — it is never auto-selected and never re-ordered by label. */
	recommendedOptionId?: string;
	/** Legacy fallback: shown on the recommended option only when that stored
	 *  option has no description of its own. */
	recommendationReason?: string;
	/** Single-select: the group resolved one option. */
	onSelect: (optionId: string) => void;
	/** Multi-select: the group resolved the whole selection. */
	onSelectMany: (optionIds: string[]) => void;
	onCustomTextChange: (value: string) => void;
	onCustomSubmit: () => void;
}

/** Static helper for the free-text choice. UI chrome, not generated copy. */
const CUSTOM_DESCRIPTION =
	"Tulis jawabanmu sendiri bila tidak ada pilihan yang sesuai.";

export function CodebaseAdaptiveQuestionOptions({
	isMulti,
	labelledBy,
	options,
	selectedMultiIds,
	selectedId,
	disabled,
	groupName,
	customId,
	customChosen,
	customText,
	customInputId,
	customPlaceholder,
	recommendedOptionId,
	recommendationReason,
	onSelect,
	onSelectMany,
	onCustomTextChange,
	onCustomSubmit,
}: CodebaseAdaptiveQuestionOptionsProps) {
	// The recommended option's own description carries the justification. Only
	// when the stored option predates descriptions (legacy handoff) does the
	// recommendation reason stand in for it, so the user never sees the same
	// explanation twice and never sees an option explained by nothing.
	const rows = orderOptionsForDisplay(options, recommendedOptionId).map(
		(option) => {
			const description =
				option.description ??
				(option.recommended ? recommendationReason : undefined);
			return (
				<CodebaseAdaptiveQuestionOptionRow
					key={option.id}
					inputType={isMulti ? "checkbox" : "radio"}
					value={option.id}
					disabled={disabled}
					heading={option.label}
					description={description}
					recommended={option.recommended === true}
				/>
			);
		},
	);

	const customRow = (
		<CodebaseAdaptiveQuestionOptionRow
			inputType={isMulti ? "checkbox" : "radio"}
			value={customId}
			disabled={disabled}
			heading="Lainnya"
			description={CUSTOM_DESCRIPTION}
		>
			{customChosen ? (
				// The free-text field belongs to the same question, so it continues the
				// chosen option's own card instead of becoming a second card beside the
				// list. The option row places it on the card's text column, so it needs
				// no indent of its own.
				<CodebaseAdaptiveQuestionAnswerInput
					id={customInputId}
					label="Jawaban lain"
					disabled={disabled}
					value={customText}
					placeholder={customPlaceholder ?? "Tulis jawabanmu sendiri..."}
					className="h-11 rounded-none border-0 border-b border-graphite bg-transparent px-0 text-[13px] text-snow shadow-none placeholder:text-slate focus:ring-0 focus-visible:border-indigo"
					autoFocus={!disabled}
					onChange={onCustomTextChange}
					onSubmit={onCustomSubmit}
				/>
			) : null}
		</CodebaseAdaptiveQuestionOptionRow>
	);

	const optionsClassName = "mt-2 flex flex-col gap-2";

	// The control group is HeroUI's React Aria group: it owns single/multi
	// semantics, roving focus, and keyboard selection instead of a hand-rolled
	// radio group that would lose that behaviour.
	return isMulti ? (
		<CheckboxGroup
			aria-labelledby={labelledBy}
			value={selectedMultiIds}
			isDisabled={disabled}
			onChange={onSelectMany}
			className={optionsClassName}
		>
			{rows}
			{customRow}
		</CheckboxGroup>
	) : (
		<RadioGroup
			aria-labelledby={labelledBy}
			name={groupName}
			value={selectedId}
			isDisabled={disabled}
			onChange={onSelect}
			className={optionsClassName}
		>
			{rows}
			{customRow}
		</RadioGroup>
	);
}
