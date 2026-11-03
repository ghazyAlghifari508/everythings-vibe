import type * as React from "react";
import { cn } from "@/lib/utils";

export type PageHeadingVariant = "display" | "workspace" | "section";

export interface PageHeadingProps
	extends React.HTMLAttributes<HTMLHeadingElement> {
	variant?: PageHeadingVariant;
	as?: "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "span" | "div";
}

const variantStyles: Record<PageHeadingVariant, string> = {
	display:
		"font-inter font-light leading-tight tracking-tight text-snow text-3xl sm:text-[40px] lg:text-[48px]",
	workspace:
		"font-inter font-light leading-tight tracking-tight text-snow text-2xl sm:text-3xl",
	section:
		"font-inter font-medium leading-snug tracking-tight text-snow text-xl sm:text-2xl",
};

// ponytail: minimal 3-variant heading primitive aligned with Pricing reference; upgrade to polymorphic Slot if Radix asChild is needed.
export function PageHeading({
	variant = "workspace",
	as,
	className,
	children,
	...props
}: PageHeadingProps) {
	const Component = as ?? (variant === "section" ? "h2" : "h1");
	return (
		<Component className={cn(variantStyles[variant], className)} {...props}>
			{children}
		</Component>
	);
}
