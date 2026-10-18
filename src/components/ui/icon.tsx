import { HugeiconsIcon, type HugeiconsIconProps } from "@hugeicons/react";
import { forwardRef } from "react";

export interface IconProps extends HugeiconsIconProps {}

/**
 * Shared production Icon primitive for everythings-vibe.
 * Wraps official HugeiconsIcon with developer-grade defaults:
 * - size: 18px
 * - strokeWidth: 1.5
 * - color: currentColor
 * - decorative aria-hidden by default unless an accessible label is provided
 */
export const Icon = forwardRef<SVGSVGElement, IconProps>(function Icon(
	{
		size = 18,
		strokeWidth = 1.5,
		color = "currentColor",
		className,
		"aria-hidden": ariaHidden,
		...props
	},
	ref,
) {
	// Default to decorative (aria-hidden="true") unless an accessible label is provided
	const computedAriaHidden =
		ariaHidden !== undefined
			? ariaHidden
			: props["aria-label"] || props["aria-labelledby"]
				? undefined
				: true;

	return (
		<HugeiconsIcon
			ref={ref}
			size={size}
			strokeWidth={strokeWidth}
			color={color}
			className={className}
			aria-hidden={computedAriaHidden}
			{...props}
		/>
	);
});

Icon.displayName = "Icon";
