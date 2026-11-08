import { type Dispatch, type SetStateAction, useId, useState } from "react";
import type { AdaptiveQuestion } from "@/features/codebase/services/chat-flow";

export interface AdaptiveQuestionSelectionParams {
	question: AdaptiveQuestion;
	/** Resolved by the caller, which owns the option-id contract. */
	customId: string;
	submitted: string;
	active: boolean;
	isEditing: boolean;
	onSubmit: (questionId: string, answer: string) => void;
}

export interface AdaptiveQuestionSelection {
	groupName: string;
	customId: string;
	inputId: string;
	titleId: string;
	isMulti: boolean;
	isText: boolean;
	customChosen: boolean;
	canSubmit: boolean;
	selectedOptionId: string | null;
	multiOptionIds: string[];
	customText: string;
	setCustomText: Dispatch<SetStateAction<string>>;
	handleOptionChange: (optionId: string) => void;
	handleSubmit: () => void;
}

/** Draft answer owned by one question card until the user confirms it. */
interface DraftSelection {
	/** Logical identity the draft was derived from; see `resetKey`. */
	key: string;
	selectedOptionId: string | null;
	multiOptionIds: string[];
	customText: string;
}

/**
 * Seed a draft from the persisted answer. Pure: depends on the submitted value
 * and the option labels, never on array identity.
 */
function deriveDraft(
	question: AdaptiveQuestion,
	customId: string,
	submitted: string,
): Omit<DraftSelection, "key"> {
	if (!submitted) {
		return { selectedOptionId: null, multiOptionIds: [], customText: "" };
	}
	if (question.type === "text") {
		return {
			selectedOptionId: null,
			multiOptionIds: [],
			customText: submitted,
		};
	}
	if (question.type === "select") {
		const matchingOpt = question.options.find(
			(opt) => opt.label.trim() === submitted.trim(),
		);
		if (matchingOpt) {
			return {
				selectedOptionId: matchingOpt.id,
				multiOptionIds: [],
				customText: "",
			};
		}
		return {
			selectedOptionId: customId,
			multiOptionIds: [],
			customText: submitted,
		};
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
			selectedOptionId: null,
			multiOptionIds: matchedIds,
			customText: unmatched.join(", "),
		};
	}
	return { selectedOptionId: null, multiOptionIds: [], customText: "" };
}

/**
 * Selection state for one adaptive question: which options are chosen, the
 * free-text answer, and whether the answer can be submitted.
 */
export function useAdaptiveQuestionSelection({
	question,
	customId,
	submitted,
	active,
	isEditing,
	onSubmit,
}: AdaptiveQuestionSelectionParams): AdaptiveQuestionSelection {
	const groupName = useId();
	const inputId = `custom-${question.id}`;
	const titleId = `question-title-${question.id}`;

	const isMulti = question.type === "multiselect";
	const isText = question.type === "text";

	// Draft ownership: the user's in-progress selection is the source of truth
	// until they confirm. Server-provided `submitted` only seeds the draft and
	// re-seeds it when the logical question or the persisted answer changes.
	// `question.options` identity is deliberately excluded — a parent that
	// re-derives an equivalent array must never wipe an active selection.
	const resetKey = `${question.id}\u0000${question.type}\u0000${submitted}`;
	const [draft, setDraft] = useState<DraftSelection>(() => ({
		key: resetKey,
		...deriveDraft(question, customId, submitted),
	}));
	const current: DraftSelection =
		draft.key === resetKey
			? draft
			: { key: resetKey, ...deriveDraft(question, customId, submitted) };

	const { selectedOptionId, multiOptionIds, customText } = current;

	const setCustomText: Dispatch<SetStateAction<string>> = (value) => {
		setDraft((previous) => {
			const base =
				previous.key === resetKey
					? previous
					: { key: resetKey, ...deriveDraft(question, customId, submitted) };
			return {
				...base,
				customText:
					typeof value === "function" ? value(base.customText) : value,
			};
		});
	};

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
		setDraft((previous) => {
			const base =
				previous.key === resetKey
					? previous
					: { key: resetKey, ...deriveDraft(question, customId, submitted) };
			if (!isMulti) return { ...base, selectedOptionId: optionId };
			return {
				...base,
				multiOptionIds: base.multiOptionIds.includes(optionId)
					? base.multiOptionIds.filter((id) => id !== optionId)
					: [...base.multiOptionIds, optionId],
			};
		});
	};

	return {
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
		handleSubmit,
	};
}
