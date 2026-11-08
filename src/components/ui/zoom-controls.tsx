"use client";

import {
	Add01Icon,
	MinusSignIcon,
	RotateCcwIcon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { Icon } from "./icon";

interface ZoomControlsProps {
	zoom: number;
	minZoom?: number;
	maxZoom?: number;
	onZoomIn: () => void;
	onZoomOut: () => void;
	onReset: () => void;
	className?: string;
	/** Accessible name of the reset action; callers that fit instead of reset must say so. */
	resetLabel?: string;
}

/**
 * Zoom controls overlay - bottom-right of whiteboard canvas.
 */
export function ZoomControls({
	zoom,
	minZoom,
	maxZoom,
	onZoomIn,
	onZoomOut,
	onReset,
	className,
	resetLabel = "Reset tampilan",
}: ZoomControlsProps) {
	const isMin = minZoom !== undefined && zoom <= minZoom + 0.005;
	const isMax = maxZoom !== undefined && zoom >= maxZoom - 0.005;
	return (
		<div
			className={cn(
				"flex items-center gap-1 rounded-lg border border-graphite bg-charcoal p-1 shadow-lg",
				className,
			)}
			onPointerDown={(e) => e.stopPropagation()}
		>
			<button
				type="button"
				onClick={onZoomOut}
				disabled={isMin}
				aria-disabled={isMin}
				aria-label="Perkecil"
				className={cn(
					"flex h-8 w-8 items-center justify-center rounded text-fog transition-colors hover:bg-white/5 hover:text-snow",
					isMin &&
						"cursor-not-allowed opacity-40 hover:bg-transparent hover:text-fog",
				)}
			>
				<Icon icon={MinusSignIcon} size={16} />
			</button>
			<span className="min-w-[48px] text-center text-xs font-[510] text-fog tabular-nums">
				{Math.round(zoom * 100)}%
			</span>
			<button
				type="button"
				onClick={onZoomIn}
				disabled={isMax}
				aria-disabled={isMax}
				aria-label="Perbesar"
				className={cn(
					"flex h-8 w-8 items-center justify-center rounded text-fog transition-colors hover:bg-white/5 hover:text-snow",
					isMax &&
						"cursor-not-allowed opacity-40 hover:bg-transparent hover:text-fog",
				)}
			>
				<Icon icon={Add01Icon} size={16} />
			</button>
			<div className="mx-1 h-5 w-px bg-graphite" />
			<button
				type="button"
				onClick={onReset}
				aria-label={resetLabel}
				title={resetLabel}
				className="flex h-8 w-8 items-center justify-center rounded text-fog transition-colors hover:bg-white/5 hover:text-snow"
			>
				<Icon icon={RotateCcwIcon} size={15} />
			</button>
		</div>
	);
}
