"use client";

import { Input } from "@/components/ui/input";

interface CodebaseAdaptiveQuestionAnswerInputProps {
	id: string;
	label: string;
	disabled: boolean;
	value: string;
	placeholder: string;
	className: string;
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
				onKeyDown={(event) => {
					if (event.key === "Enter") {
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
