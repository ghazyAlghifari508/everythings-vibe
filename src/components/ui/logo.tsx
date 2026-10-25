"use client";

import { Link } from "@tanstack/react-router";
import type { FileRouteTypes } from "@/routeTree.gen";

// everythings-vibe mark: document outline with terminal cursor block.
// viewBox is cropped tight to the glyph bbox (content: x 14-47, y 10-48)
// so the mark fills its box — no dead padding baked into the canvas.
// fill="currentColor" follows the theme's text color automatically.
export function EverythingsVibeMark({ size }: { size: number }) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="10.5 9 40 40"
			fill="currentColor"
			aria-hidden="true"
			className="shrink-0"
		>
			<path
				fillRule="evenodd"
				d="M14 10H35L44 19V37H38V42H35V48H14V10ZM20 16V42H29V39H32V33H38V24H34V16H20Z"
			/>
			<rect x="39" y="39" width="8" height="9" />
		</svg>
	);
}

// ponytail: backward compatibility alias for internal imports during migration.
export const VibeEverythingMark = EverythingsVibeMark;

export function Logo({
	href = "/",
	className = "",
	height = 32,
}: {
	href?: FileRouteTypes["to"];
	className?: string;
	height?: number;
}) {
	return (
		<Link
			to={href}
			className={`inline-flex items-center ${className}`}
			style={{ gap: `${Math.round(height * 0.34)}px` }}
		>
			<EverythingsVibeMark size={height} />
			<span
				className="font-medium leading-none select-none"
				style={{
					fontFamily: "var(--font-inter)",
					fontSize: `${Math.round(height * 0.7)}px`,
					letterSpacing: "-0.03em",
				}}
			>
				everythings-vibe
			</span>
		</Link>
	);
}
