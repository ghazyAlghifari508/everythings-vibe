"use client";

import { Check } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AdaptiveQuestion } from "@/lib/codebase-chat-flow";

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
	/** Only the current question accepts input; earlier ones stay locked. */
	active: boolean;
	onSubmit: (questionId: string, answer: string) => void;
	onEdit?: (questionId: string) => void;
	isEditing?: boolean;
	onCancelEdit?: () => void;
}

/**
 * One adaptive question, rendered as a real form control group.
 *
 * Progressive disclosure interaction:
 * - Answered questions appear as compact single-line summaries with an edit trigger.
 * - The active question appears as a focused, structured card with a progress counter.
 * - Single-select uses a native radio group, multi-select uses fieldset checkboxes.
 * - Free-text option ("Lainnya") is part of the same control group.
 */
export function CodebaseAdaptiveQuestion({
	question,
	index,
	totalQuestions,
	submitted,
	active,
	onSubmit,
	onEdit,
	isEditing = false,
	onCancelEdit,
}: CodebaseAdaptiveQuestionProps) {
	const groupName = useId();
	const customId = customOptionId(question.id);
	const inputId = `custom-${question.id}`;
	const reasonId = `reason-${question.id}`;
	const titleId = `question-title-${question.id}`;

	// Determine initial selection states when editing or answering
	const initialSelections = useMemo(() => {
		if (!submitted) {
			return { selectedId: null, multiIds: [], custom: "" };
		}
		if (question.type === "text") {
			return { selectedId: null, multiIds: [], custom: submitted };
		}
		if (question.type === "select") {
			const matchingOpt = question.options.find(
				(opt) => opt.label.trim() === submitted.trim(),
			);
			if (matchingOpt) {
				return { selectedId: matchingOpt.id, multiIds: [], custom: "" };
			}
			return { selectedId: customId, multiIds: [], custom: submitted };
		}
		if (question.type === "multiselect") {
			const parts = submitted.split(",").map((s) => s.trim());
			const matchedIds: string[] = [];
			const unmatched: string[] = [];
			for (const part of parts) {
				const match = question.options.find(
					(opt) => opt.label.trim().toLowerCase() === part.toLowerCase(),
				);
				if (match) {
					matchedIds.push(match.id);
				} else if (part.length > 0) {
					unmatched.push(part);
				}
			}
			if (unmatched.length > 0) {
				matchedIds.push(customId);
			}
			return {
				selectedId: null,
				multiIds: matchedIds,
				custom: unmatched.join(", "),
			};
		}
		return { selectedId: null, multiIds: [], custom: "" };
	}, [submitted, question.type, question.options, customId]);

	const [selectedOptionId, setSelectedOptionId] = useState<string | null>(
		initialSelections.selectedId,
	);
	const [multiOptionIds, setMultiOptionIds] = useState<string[]>(
		initialSelections.multiIds,
	);
	const [customText, setCustomText] = useState(initialSelections.custom);

	useEffect(() => {
		setSelectedOptionId(initialSelections.selectedId);
		setMultiOptionIds(initialSelections.multiIds);
		setCustomText(initialSelections.custom);
	}, [initialSelections]);

	const isMulti = question.type === "multiselect";
	const isText = question.type === "text";
	const customChosen = isText
		? true
		: isMulti
			? multiOptionIds.includes(customId)
			: selectedOptionId === customId;
	const trimmedCustom = customText.trim();
	const customSatisfied = !customChosen || trimmedCustom.length > 0;
	const hasChoice = isText
		? true
		: isMulti
			? multiOptionIds.length > 0
			: selectedOptionId !== null;
	const canSubmit = (active || isEditing) && hasChoice && customSatisfied;

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
		setSelectedOptionId(optionId);
	};

	// 1. Answered State: Render as compact completed line
	if (submitted && !isEditing) {
		return (
			<div
				data-testid={`adaptive-question-${question.id}`}
				className="group flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg border border-graphite/60 bg-charcoal/40 px-3.5 py-2.5 text-xs text-mist transition-colors hover:border-steel/60 hover:bg-charcoal/70"
			>
				<div className="flex items-center gap-2 min-w-0">
					<span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-emerald/15 text-emerald text-[11px] font-bold">
						<Check size={11} aria-hidden="true" />
					</span>
					<span className="font-medium text-snow/90 shrink-0">
						Q{index} · {question.title}:
					</span>
					<span className="truncate text-mist font-normal">
						Jawaban: {submitted}
					</span>
				</div>
				{onEdit ? (
					<button
						type="button"
						onClick={() => onEdit(question.id)}
						className="shrink-0 text-[11px] font-medium text-fog hover:text-snow underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo rounded px-1.5 py-0.5"
					>
						Ubah
					</button>
				) : null}
			</div>
		);
	}

	// 2. Active Question Card
	const recommendedOption = question.recommendedOptionId
		? question.options.find((opt) => opt.id === question.recommendedOptionId)
		: undefined;
	const recommendedLabel = recommendedOption?.label;

	return (
		<div
			data-testid={`adaptive-question-${question.id}`}
			className="rounded-xl border border-graphite bg-charcoal p-4 sm:p-5 shadow-sm"
		>
			<div className="flex items-center justify-between pb-3 mb-3 border-b border-graphite/50">
				<div className="flex items-center gap-2">
					<span className="rounded bg-indigo/15 px-2 py-0.5 font-mono text-[11px] font-medium text-indigo">
						Klarifikasi
					</span>
					<span className="text-xs font-medium text-fog">
						Pertanyaan {index}
					</span>
				</div>
				<span className="font-mono text-xs text-fog">
					{index} dari {totalQuestions ?? index}
				</span>
			</div>

			<p
				id={titleId}
				className="text-sm sm:text-[15px] font-semibold text-snow leading-snug mb-3.5"
			>
				{question.title}
			</p>

			{isText ? (
				<div className="mt-2">
					<label htmlFor={inputId} className="sr-only">
						{question.title}
					</label>
					<Input
						id={inputId}
						type="text"
						disabled={!active && !isEditing}
						value={customText}
						onChange={(event) => setCustomText(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter") {
								event.preventDefault();
								handleSubmit();
							}
						}}
						placeholder={question.customPlaceholder ?? "Tulis jawabanmu..."}
						className="text-xs h-11 bg-steel/60 text-snow border-graphite"
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

			{question.recommendedOptionId && question.recommendationReason ? (
				<div
					id={reasonId}
					data-testid={`adaptive-question-reason-${question.id}`}
					className="mt-3.5 rounded-lg border border-indigo/25 bg-indigo/5 p-3 text-xs leading-relaxed text-fog"
				>
					{recommendedLabel ? (
						<p className="font-medium text-snow text-xs mb-1">
							Rekomendasi:{" "}
							<span className="text-indigo">{recommendedLabel}</span>
						</p>
					) : (
						<p className="font-medium text-snow text-xs mb-1">Rekomendasi</p>
					)}
					<p className="text-[11.5px] leading-relaxed text-fog">
						Alasan berdasarkan codebase: {question.recommendationReason}
					</p>
				</div>
			) : null}

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

interface QuestionOption {
	id: string;
	label: string;
	recommended: boolean;
}

interface QuestionOptionGroupProps {
	isMulti: boolean;
	labelledBy: string;
	options: QuestionOption[];
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
		<div className="flex flex-col gap-1.5">
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
				<div className="pl-7 pr-1 pt-1">
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
						className="text-xs h-10 bg-steel/60 text-snow border-graphite"
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

	const className = "mt-2 flex flex-col gap-2";

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
			className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3.5 py-2.5 text-[13px] transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-indigo ${
				checked
					? "border-indigo bg-indigo/10 text-snow font-medium"
					: "border-graphite bg-obsidian text-mist hover:border-steel hover:bg-obsidian/80"
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
				className="size-4 shrink-0 accent-indigo cursor-pointer"
			/>
			<span className="min-w-0 flex-1">
				{label}
				{recommended ? (
					<span className="ml-2 inline-flex items-center rounded-full border border-emerald/30 bg-emerald/10 px-2 py-0.5 text-[10px] font-semibold text-emerald">
						Rekomendasi
					</span>
				) : null}
			</span>
		</label>
	);
}
