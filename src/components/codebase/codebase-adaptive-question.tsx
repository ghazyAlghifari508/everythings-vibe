"use client";

import { useId, useState } from "react";
import { Input } from "@/components/ui/input";
import type { AdaptiveQuestion } from "@/lib/codebase-chat-flow";

/** Sentinel option id for the free-text choice. Option ids are
 *  `${questionId}-optN`, so this suffix can never collide with one. */
export const CUSTOM_OPTION_SUFFIX = "-custom";

export function customOptionId(questionId: string): string {
	return `${questionId}${CUSTOM_OPTION_SUFFIX}`;
}

interface CodebaseAdaptiveQuestionProps {
	question: AdaptiveQuestion;
	/** 1-based position shown as the question marker. */
	index: number;
	/** The answer already accepted for this question, empty while unanswered. */
	submitted: string;
	/** Only the current question accepts input; earlier ones stay locked. */
	active: boolean;
	onSubmit: (questionId: string, answer: string) => void;
}

/**
 * One adaptive question, rendered as a real form control group.
 *
 * The free-text choice is the last option *inside* the group — a radio for
 * `select` and a checkbox for `multiselect` — so it is one of the choices
 * rather than a separate button, and choosing it reveals the answer field
 * directly beneath it in the same group. Native radio/checkbox inputs provide
 * the group semantics (single selection, arrow-key navigation, checked
 * announcements) without a new dependency.
 *
 * Answer semantics match the persisted Ask contract (one answer string per
 * question): `select` yields either the chosen label or the custom text,
 * `multiselect` joins every chosen label with the custom text, `text` yields
 * the custom text alone.
 */
export function CodebaseAdaptiveQuestion({
	question,
	index,
	submitted,
	active,
	onSubmit,
}: CodebaseAdaptiveQuestionProps) {
	const groupName = useId();
	const customId = customOptionId(question.id);
	const inputId = `custom-${question.id}`;
	const reasonId = `reason-${question.id}`;
	const titleId = `question-title-${question.id}`;
	const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
	const [multiOptionIds, setMultiOptionIds] = useState<string[]>([]);
	const [customText, setCustomText] = useState("");

	const isMulti = question.type === "multiselect";
	const isText = question.type === "text";
	const customChosen = isText
		? true
		: isMulti
			? multiOptionIds.includes(customId)
			: selectedOptionId === customId;
	const trimmedCustom = customText.trim();
	// A chosen free-text option is only a valid answer once it carries content.
	const customSatisfied = !customChosen || trimmedCustom.length > 0;
	const hasChoice = isText
		? true
		: isMulti
			? multiOptionIds.length > 0
			: selectedOptionId !== null;
	const canSubmit = active && !submitted && hasChoice && customSatisfied;

	const buildAnswer = (): string => {
		if (isText) return trimmedCustom;
		if (isMulti) {
			const labels = multiOptionIds
				.map(
					(id) =>
						question.options.find((option) => option.id === id)?.label ?? null,
				)
				.filter((label): label is string => label !== null);
			return [...labels, trimmedCustom]
				.filter((part) => part.length > 0)
				.join(", ");
		}
		if (selectedOptionId === customId) return trimmedCustom;
		return (
			question.options.find((option) => option.id === selectedOptionId)
				?.label ?? ""
		);
	};

	const handleSubmit = () => {
		const answer = buildAnswer();
		if (!answer.trim()) return;
		onSubmit(question.id, answer.trim());
	};

	const handleOptionChange = (optionId: string) => {
		if (isMulti) {
			setMultiOptionIds((current) =>
				current.includes(optionId)
					? current.filter((id) => id !== optionId)
					: [...current, optionId],
			);
			return;
		}
		// A single-select answer is exclusive by construction: choosing any
		// option — including the free-text one — replaces the previous choice.
		setSelectedOptionId(optionId);
	};

	return (
		<div
			data-testid={`adaptive-question-${question.id}`}
			className="rounded-xl border border-graphite bg-charcoal p-3"
		>
			<p id={titleId} className="text-[13px] font-semibold text-snow">
				<span className="mr-2 rounded bg-indigo/15 px-1.5 py-0.5 font-mono text-[11px] text-indigo">
					Q{index}
				</span>
				{question.title}
			</p>
			{submitted ? (
				<p className="mt-2 rounded-lg border border-emerald/30 bg-emerald/10 px-3 py-2 text-xs leading-5 text-emerald">
					Jawaban: {submitted}
				</p>
			) : (
				<>
					{isText ? (
						<div className="mt-2">
							<label htmlFor={inputId} className="sr-only">
								{question.title}
							</label>
							<Input
								id={inputId}
								type="text"
								disabled={!active}
								value={customText}
								onChange={(event) => setCustomText(event.target.value)}
								onKeyDown={(event) => {
									if (event.key === "Enter") {
										event.preventDefault();
										handleSubmit();
									}
								}}
								placeholder={question.customPlaceholder ?? "Tulis jawabanmu..."}
								className="text-xs"
							/>
						</div>
					) : (
						<QuestionOptionGroup
							isMulti={isMulti}
							labelledBy={titleId}
							options={question.options.map((option) => ({
								id: option.id,
								label: option.label,
								recommended: option.recommended === true,
							}))}
							selectedIds={isMulti ? multiOptionIds : selectedOptionId}
							disabled={!active}
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
					{question.recommendedOptionId && question.recommendationReason ? (
						<p
							id={reasonId}
							data-testid={`adaptive-question-reason-${question.id}`}
							className="mt-2 text-[11px] leading-4 text-fog"
						>
							Alasan rekomendasi: {question.recommendationReason}
						</p>
					) : null}
					{active ? (
						<div className="mt-3 flex justify-end">
							<button
								type="button"
								disabled={!canSubmit}
								onClick={handleSubmit}
								className="inline-flex min-h-11 items-center rounded-md bg-snow px-4 text-xs font-semibold text-onyx transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
							>
								Kirim Jawaban
							</button>
						</div>
					) : null}
				</>
			)}
		</div>
	);
}

interface QuestionOption {
	id: string;
	label: string;
	recommended: boolean;
}

interface QuestionOptionGroupProps {
	isMulti: boolean;
	/** Id of the visible question text that names this group. */
	labelledBy: string;
	options: QuestionOption[];
	/** Selected option ids; a single id for a select question. */
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

/**
 * The option group of one question. The free-text choice is rendered as the
 * last option inside the same group, so it reads as one of the choices rather
 * than a separate control, and its answer field appears directly beneath it.
 */
function QuestionOptionGroup({
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
}: QuestionOptionGroupProps) {
	const isChosen = (optionId: string): boolean =>
		Array.isArray(selectedIds)
			? selectedIds.includes(optionId)
			: selectedIds === optionId;

	const rows = options.map((option) => (
		<QuestionOptionRow
			key={option.id}
			inputType={isMulti ? "checkbox" : "radio"}
			name={groupName}
			value={option.id}
			checked={isChosen(option.id)}
			disabled={disabled}
			label={option.label}
			recommended={option.recommended}
			describedBy={option.recommended ? recommendationReasonId : undefined}
			onChange={() => onSelect(option.id)}
		/>
	));
	const customRow = (
		<>
			<QuestionOptionRow
				inputType={isMulti ? "checkbox" : "radio"}
				name={groupName}
				value={customId}
				checked={customChosen}
				disabled={disabled}
				label="Lainnya"
				onChange={() => onSelect(customId)}
			/>
			{customChosen ? (
				<div className="pl-6">
					<label htmlFor={customInputId} className="sr-only">
						Jawaban lain
					</label>
					<Input
						id={customInputId}
						type="text"
						disabled={disabled}
						value={customText}
						onChange={(event) => onCustomTextChange(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter") {
								event.preventDefault();
								onCustomSubmit();
							}
						}}
						placeholder={customPlaceholder ?? "Tulis jawabanmu sendiri..."}
						className="text-xs"
					/>
					{customText.trim().length === 0 ? (
						<p className="mt-1 text-[11px] leading-4 text-fog">
							Isi jawaban sendiri agar bisa dikirim.
						</p>
					) : null}
				</div>
			) : null}
		</>
	);

	const className = "mt-2 flex flex-col gap-1.5";

	// Explicit semantics per control type: a single-select question is a radio
	// group, and a multi-select question is a real fieldset — the native
	// grouping element for a set of checkboxes.
	return isMulti ? (
		<fieldset aria-labelledby={labelledBy} className={className}>
			{rows}
			{customRow}
		</fieldset>
	) : (
		<div role="radiogroup" aria-labelledby={labelledBy} className={className}>
			{rows}
			{customRow}
		</div>
	);
}

interface QuestionOptionRowProps {
	inputType: "radio" | "checkbox";
	name: string;
	value: string;
	checked: boolean;
	disabled: boolean;
	label: string;
	recommended?: boolean;
	describedBy?: string;
	onChange: () => void;
}

/**
 * One selectable row in a question group. A real radio/checkbox input carries
 * the state and the group semantics; the surrounding label is the hit area, so
 * selected, hover, focus, and disabled states all come from the control itself
 * and stay consistent with the rest of the workspace.
 */
function QuestionOptionRow({
	inputType,
	name,
	value,
	checked,
	disabled,
	label,
	recommended = false,
	describedBy,
	onChange,
}: QuestionOptionRowProps) {
	return (
		<label
			className={`flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-[12.5px] transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-indigo ${
				checked
					? "border-indigo bg-indigo/10 text-snow"
					: "border-graphite bg-obsidian text-mist hover:border-steel"
			} ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
		>
			<input
				type={inputType}
				name={name}
				value={value}
				checked={checked}
				disabled={disabled}
				aria-describedby={describedBy}
				onChange={onChange}
				className="size-3.5 shrink-0 accent-indigo"
			/>
			<span className="min-w-0 flex-1">
				{label}
				{recommended ? (
					<span className="ml-1.5 rounded-full border border-emerald/30 bg-emerald/10 px-1.5 py-px text-[10px] font-semibold text-emerald">
						Rekomendasi
					</span>
				) : null}
			</span>
		</label>
	);
}
