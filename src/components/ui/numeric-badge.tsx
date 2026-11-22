import { Badge, type BadgeProps } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface NumericBadgeProps
	extends Omit<BadgeProps, "children" | "count"> {
	count: number;
	/** Accessible noun for the count, e.g. "proyek". */
	label?: string;
}

/** Compact counter. Distinct from status labels: a number, not a state. */
export function NumericBadge({
	count,
	label,
	className,
	...props
}: NumericBadgeProps) {
	return (
		<Badge
			variant="subtle"
			className={cn(
				"rounded-full px-1.5 py-0 font-mono text-[10px]",
				className,
			)}
			aria-label={label ? `${count} ${label}` : undefined}
			{...props}
		>
			{count}
		</Badge>
	);
}
