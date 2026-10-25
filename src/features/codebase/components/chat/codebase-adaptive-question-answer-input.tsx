"use client";

import { Input } from "@/components/ui/input";

interface CodebaseAdaptiveQuestionAnswerInputProps {
	id: string;
	label: string;
	disabled: boolean;
	value: string;
	placeholder: string;
	className: string;
	/** Ownership of focus is explicit so a revealed field can take it. */
	autoFocus?: boolean;
	onChange: (value: string) => void;
	onSubmit: () => void;
}

export function CodebaseAdaptiveQuestionAnswerInput({
	id,
	label,
	disabled,
	value,
	placeholder,
	className,
	autoFocus = false,
	onChange,
	onSubmit,
}: CodebaseAdaptiveQuestionAnswerInputProps) {
	return (
		<>
			<label htmlFor={id} className="sr-only">
				{label}
			</label>
			<Input
				id={id}
				type="text"
				disabled={disabled}
				value={value}
				onChange={(event) => onChange(event.target.value)}
				autoFocus={autoFocus}
				onKeyDown={(event) => {
					// Enter ends an IME composition (e.g. Japanese input); submitting
					// there would send a half-composed answer.
					if (event.key === "Enter" && !event.nativeEvent.isComposing) {
						event.preventDefault();
						onSubmit();
					}
				}}
				placeholder={placeholder}
				className={className}
			/>
		</>
	);
}
