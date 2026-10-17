"use client";

interface CodebaseAdaptiveQuestionOptionRowProps {
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

export function CodebaseAdaptiveQuestionOptionRow({
	inputType,
	name,
	value,
	checked,
	disabled,
	label,
	recommended = false,
	describedBy,
	onChange,
}: CodebaseAdaptiveQuestionOptionRowProps) {
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
