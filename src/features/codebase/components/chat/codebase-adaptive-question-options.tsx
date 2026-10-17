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
		<div className="flex flex-col gap-1.5">
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
				<div className="pl-7 pr-1 pt-1">
					<CodebaseAdaptiveQuestionAnswerInput
						id={customInputId}
						label="Jawaban lain"
						disabled={disabled}
						value={customText}
						placeholder={customPlaceholder ?? "Tulis jawabanmu sendiri..."}
						className="text-xs h-10 bg-steel/60 text-snow border-graphite"
						onChange={onCustomTextChange}
						onSubmit={onCustomSubmit}
					/>
					{customText.trim().length === 0 ? (
						<p className="mt-1 text-[11px] leading-4 text-fog">
							Isi jawaban sendiri agar bisa dikirim.
						</p>
					) : null}
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
