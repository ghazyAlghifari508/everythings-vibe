import {
	Alert01Icon,
	CancelCircleIcon,
	CheckmarkCircle01Icon,
	CircleIcon,
	Clock01Icon,
	RefreshIcon,
	Undo02Icon,
} from "@hugeicons/core-free-icons";
import type * as React from "react";
import { Icon, type IconProps } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

/** Restrained semantic roles. Color lives on the icon, never on the container. */
export type StatusTone = "success" | "warning" | "danger" | "neutral";

/** Shared icon vocabulary. Domain mappings pick from this set, they do not invent glyphs. */
export const statusIcons = {
	success: CheckmarkCircle01Icon,
	pending: Clock01Icon,
	processing: RefreshIcon,
	failed: CancelCircleIcon,
	released: Undo02Icon,
	alert: Alert01Icon,
	neutral: CircleIcon,
} as const;

export type StatusIconName = keyof typeof statusIcons;

const toneIcon: Record<StatusTone, IconProps["icon"]> = {
	success: statusIcons.success,
	warning: statusIcons.pending,
	danger: statusIcons.failed,
	neutral: statusIcons.neutral,
};

const toneColor: Record<StatusTone, string> = {
	success: "text-emerald",
	warning: "text-warning",
	danger: "text-crimson",
	neutral: "text-fog",
};

export interface StatusIndicatorProps
	extends React.HTMLAttributes<HTMLSpanElement> {
	tone: StatusTone;
	icon?: IconProps["icon"];
	/** Genuine error/warning states may emphasize the label. */
	emphasize?: boolean;
}

/**
 * Ordinary operational state: compact icon plus readable text.
 * No border, no tinted background, meaning survives without color.
 */
export function StatusIndicator({
	tone,
	icon,
	emphasize = false,
	className,
	children,
	...props
}: StatusIndicatorProps) {
	return (
		<span
			data-tone={tone}
			className={cn(
				"inline-flex items-center gap-1.5 whitespace-nowrap text-[11px] leading-4",
				emphasize ? "font-medium text-snow" : "font-normal text-fog",
				className,
			)}
			{...props}
		>
			<Icon
				icon={icon ?? toneIcon[tone]}
				size={13}
				className={cn("shrink-0", toneColor[tone])}
				aria-hidden="true"
			/>
			{children}
		</span>
	);
}
