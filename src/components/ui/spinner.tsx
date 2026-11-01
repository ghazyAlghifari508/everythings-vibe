import { Spinner as HeroUISpinner } from "@heroui/react";
import { cn } from "@/lib/utils";

export interface SpinnerProps {
	/** Pixel size of the square indicator. Defaults to a 14px status-row size. */
	size?: number;
	/**
	 * Accessible name for a standalone spinner. Omit it when the surrounding
	 * row already carries the state in text; the indicator is then decorative.
	 */
	label?: string;
	className?: string;
}

/**
 * The design system's one loading indicator.
 *
 * Wraps the ready-made HeroUI `Spinner` instead of authoring a new animation.
 * `motion-safe` keeps the rotation for everyone who accepts motion and leaves a
 * static ring for users who asked for reduced motion.
 */
export function Spinner({ size = 14, label, className }: SpinnerProps) {
	return (
		<HeroUISpinner
			data-testid="spinner"
			className={cn(
				"inline-flex shrink-0 items-center justify-center [&>svg]:size-full",
				"motion-safe:animate-spin motion-reduce:animate-none",
				className,
			)}
			style={{ width: size, height: size }}
			{...(label
				? { role: "status" as const, "aria-label": label }
				: { role: undefined, "aria-hidden": true })}
		/>
	);
}

Spinner.displayName = "Spinner";
