import type * as React from "react";
import type { IconProps } from "@/components/ui/icon";
import {
	StatusIndicator,
	type StatusTone,
} from "@/components/ui/status-indicator";
import { cn } from "@/lib/utils";

export interface StatusBadgeProps
	extends React.HTMLAttributes<HTMLSpanElement> {
	tone: StatusTone;
	icon?: IconProps["icon"];
}

/**
 * Strong emphasis for genuine attention states only (banned account, critical
 * payment issue). Neutral container keeps the palette quiet; no colored border.
 */
export function StatusBadge({
	tone,
	icon,
	className,
	children,
	...props
}: StatusBadgeProps) {
	return (
		<span
			data-tone={tone}
			className={cn(
				"inline-flex rounded-md bg-surface-tag px-2 py-0.5",
				className,
			)}
			{...props}
		>
			<StatusIndicator tone={tone} icon={icon} emphasize>
				{children}
			</StatusIndicator>
		</span>
	);
}
