"use client";

import type { AdaptiveQuestionOption } from "@/features/codebase/services/chat-flow";
import { CodebaseAdaptiveQuestionAnswerInput } from "./codebase-adaptive-question-answer-input";
import { CodebaseAdaptiveQuestionOptionRow } from "./codebase-adaptive-question-option-row";

interface CodebaseAdaptiveQuestionOptionsProps {
	isMulti: boolean;
	labelledBy: string;
	options: AdaptiveQuestionOption[];
	selectedIds: string[] | string | null;
	disabled: boolean;
	groupName: string;
	customId: string;
	customChosen: boolean;
	customText: string;
	customInputId: string;
	customPlaceholder?: string;
	recommendationReasonId?: string;
	onSelect: (optionId: string) => void;
	onCustomTextChange: (value: string) => void;
	onCustomSubmit: () => void;
}

export function CodebaseAdaptiveQuestionOptions({
	isMulti,
	labelledBy,
	options,
	selectedIds,
	disabled,
	groupName,
	customId,
	customChosen,
	customText,
	customInputId,
	customPlaceholder,
	recommendationReasonId,
	onSelect,
	onCustomTextChange,
	onCustomSubmit,
}: CodebaseAdaptiveQuestionOptionsProps) {
	const isChosen = (optionId: string): boolean =>
		Array.isArray(selectedIds)
			? selectedIds.includes(optionId)
			: selectedIds === optionId;

	const rows = options.map((option) => (
		<CodebaseAdaptiveQuestionOptionRow
			key={option.id}
			inputType={isMulti ? "checkbox" : "radio"}
			name={groupName}
			value={option.id}
			checked={isChosen(option.id)}
			disabled={disabled}
			label={option.label}
			recommended={option.recommended === true}
			describedBy={option.recommended ? recommendationReasonId : undefined}
			onChange={() => onSelect(option.id)}
		/>
	));
	const customRow = (
		<div className="flex flex-col gap-2">
			<CodebaseAdaptiveQuestionOptionRow
				inputType={isMulti ? "checkbox" : "radio"}
				name={groupName}
				value={customId}
				checked={customChosen}
				disabled={disabled}
				label="Lainnya"
				onChange={() => onSelect(customId)}
			/>
			{customChosen ? (
				// The free-text field belongs to the same question, so it continues the
				// chosen row as an underline instead of becoming a second card.
				// `pl-[2.625rem]` matches the option label inset: row px-3.5 + radio
				// 1rem + gap 0.75rem.
				<div className="pl-[2.625rem] pr-1">
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
				</div>
			) : null}
		</div>
	);

	const optionsClassName = "mt-2 flex flex-col gap-2";

	return isMulti ? (
		<fieldset aria-labelledby={labelledBy} className={optionsClassName}>
			{rows}
			{customRow}
		</fieldset>
	) : (
		<div
			role="radiogroup"
			aria-labelledby={labelledBy}
			className={optionsClassName}
		>
			{rows}
			{customRow}
		</div>
	);
}
