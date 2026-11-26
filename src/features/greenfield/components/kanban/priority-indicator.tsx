"use client";

import { getTaskPriorityConfig } from "@/lib/kanban-utils";
import { cn } from "@/lib/utils";

export interface PriorityIndicatorProps {
	priority?: string | null;
}

export function PriorityIndicator({ priority }: PriorityIndicatorProps) {
	const config = getTaskPriorityConfig(priority);

	return (
		<span
			className="inline-flex items-center gap-1.5 shrink-0 select-none"
			title={`Tingkat Kepentingan: ${config.label}`}
		>
			<span
				className="inline-flex items-end gap-[2px] h-3.5 pb-[1px]"
				aria-hidden="true"
			>
				{/* Bar 1 (pendek): Always present */}
				<span
					className={cn(
						"w-[2.5px] h-[4px] rounded-[0.5px]",
						config.barClassName,
					)}
				/>
				{/* Bar 2 (sedang): Penting & Utama */}
				{config.barCount >= 2 && (
					<span
						className={cn(
							"w-[2.5px] h-[8px] rounded-[0.5px]",
							config.barClassName,
						)}
					/>
				)}
				{/* Bar 3 (tinggi): Utama only */}
				{config.barCount >= 3 && (
					<span
						className={cn(
							"w-[2.5px] h-[12px] rounded-[0.5px]",
							config.barClassName,
						)}
					/>
				)}
			</span>
			<span
				className={cn(
					"font-mono text-[10px] tracking-tight leading-none",
					config.textClassName,
				)}
			>
				{config.label}
			</span>
		</span>
	);
}
