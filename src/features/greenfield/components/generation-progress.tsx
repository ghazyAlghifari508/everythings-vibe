"use client";

import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

interface GenerationProgressProps {
	/** Short document label, e.g. "PRD" or "Acceptance Criteria". */
	label: string;
	className?: string;
}

/**
 * One neutral, indeterminate loader for the window before the first token.
 * No steps, no timers, no raw reasoning: those are not reported by the stream.
 */
export function GenerationProgress({
	label,
	className,
}: GenerationProgressProps) {
	return (
		<output
			className={cn(
				"flex items-center justify-center gap-2 px-4 py-8 text-sm text-fog",
				className,
			)}
		>
			<Spinner size={14} />
			<span>Menyusun {label}...</span>
		</output>
	);
}
