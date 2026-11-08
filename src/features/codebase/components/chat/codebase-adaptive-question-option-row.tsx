"use client";

interface CodebaseAdaptiveQuestionOptionRowProps {
	inputType: "radio" | "checkbox";
	name: string;
	value: string;
	checked: boolean;
	disabled: boolean;
	label: string;
	/** What choosing this option changes, rendered under the heading so both
	 *  live on the option itself instead of in a separate explanation panel. */
	description?: string;
	descriptionId?: string;
	recommended?: boolean;
	onChange: () => void;
}

export function CodebaseAdaptiveQuestionOptionRow({
	inputType,
	name,
	value,
	checked,
	disabled,
	label,
	description,
	descriptionId,
	recommended = false,
	onChange,
}: CodebaseAdaptiveQuestionOptionRowProps) {
	return (
		<div
			className={`rounded-lg border px-3.5 py-2.5 text-[13px] transition-colors focus-within:ring-2 focus-within:ring-indigo ${
				checked
					? "border-indigo bg-indigo/10 text-snow font-medium"
					: "border-graphite bg-obsidian text-mist hover:border-steel hover:bg-obsidian/80"
			} ${disabled ? "opacity-60" : ""}`}
		>
			<label
				className={`flex min-h-11 items-center gap-3 ${
					disabled ? "cursor-not-allowed" : "cursor-pointer"
				}`}
			>
				<input
					type={inputType}
					name={name}
					value={value}
					checked={checked}
					disabled={disabled}
					aria-describedby={description ? descriptionId : undefined}
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
			{description ? (
				// pl-7 = row px-3.5 + radio 1rem + gap 0.75rem, so the description
				// lines up under the heading. Outside the <label> on purpose: the
				// input's accessible name stays the heading, the description is only
				// its `aria-describedby` text and never part of the saved answer.
				<p
					id={descriptionId}
					className="mt-1 pl-7 text-[11.5px] font-normal leading-relaxed text-fog"
				>
					{description}
				</p>
			) : null}
		</div>
	);
}
