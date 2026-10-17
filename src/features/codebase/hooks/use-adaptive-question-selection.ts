import {
	type Dispatch,
	type SetStateAction,
	useEffect,
	useId,
	useMemo,
	useState,
} from "react";
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
	reasonId: string;
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

	return {
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
	};
}
