import { ChevronDown } from "lucide-react";
import { useId } from "react";
import { cn } from "@/lib/utils";

export interface ScrapeFilterOption {
	readonly value: string;
	readonly label: string;
}

export function ScrapeFilterSelect({
	label,
	hideLabel = false,
	value,
	onChange,
	options,
	className,
}: {
	label: string;
	hideLabel?: boolean;
	value: string;
	onChange: (value: string) => void;
	options: ReadonlyArray<ScrapeFilterOption>;
	className?: string;
}) {
	const id = useId();
	return (
		<label
			htmlFor={id}
			className={cn(
				"inline-flex min-w-0 flex-col gap-1.5 text-xs text-fog",
				className,
			)}
		>
			<span className={hideLabel ? "sr-only" : undefined}>{label}</span>
			<span className="relative block min-w-0">
				<select
					id={id}
					value={value}
					onChange={(event) => onChange(event.target.value)}
					className="min-h-11 w-full appearance-none rounded-lg border border-graphite bg-charcoal py-2 pr-9 pl-3 text-sm text-snow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo [&::-ms-expand]:hidden"
				>
					{options.map((option) => (
						<option key={option.value} value={option.value}>
							{option.label}
						</option>
					))}
				</select>
				<ChevronDown
					size={16}
					aria-hidden
					className="pointer-events-none absolute top-1/2 right-3 shrink-0 -translate-y-1/2 text-fog"
				/>
			</span>
		</label>
	);
}
