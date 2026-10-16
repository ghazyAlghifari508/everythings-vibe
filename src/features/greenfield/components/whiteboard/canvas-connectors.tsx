"use client";

import { memo } from "react";
import type { LayoutEdge } from "../../types/whiteboard";

// Dot grid: subtle blueprint dots on canvas, adaptive to light and dark theme.
export const DOT_BG_IMAGE =
	"radial-gradient(circle, var(--canvas-dot-color, rgba(15, 23, 42, 0.16)) 1.25px, transparent 1.75px)";

/**
 * Dynamic dot grid background for whiteboard canvases.
 * Scales the dot radius and anti-aliasing feathering proportionally with zoom
 * so the dots never look disproportionately massive on zoom-out or faint on zoom-in.
 */
export function getCanvasDotStyle(
	zoom: number,
	pan: { x: number; y: number },
): React.CSSProperties {
	const dotRadius = Math.max(
		0.75,
		Math.min(2.5, Number((1.25 * zoom).toFixed(2))),
	);
	const feather = 0.5;
	return {
		backgroundImage: `radial-gradient(circle, var(--canvas-dot-color, rgba(15, 23, 42, 0.16)) ${dotRadius}px, transparent ${Number((dotRadius + feather).toFixed(2))}px)`,
		backgroundSize: `${Number((20 * zoom).toFixed(2))}px ${Number((20 * zoom).toFixed(2))}px`,
		backgroundPosition: `${pan.x}px ${pan.y}px`,
	};
}

// ponytail: memoized so per-frame pan/zoom renders of WhiteboardCanvas skip
// re-rendering every node (props are stable: layoutTaskGraph is useMemo'd and
// openers are stable setState wrappers).
export const Edges = memo(function Edges({ edges }: { edges: LayoutEdge[] }) {
	return (
		<svg
			aria-hidden="true"
			className="pointer-events-none absolute left-0 top-0"
			width="100%"
			height="100%"
			style={{ overflow: "visible" }}
		>
			{edges.map((e) => {
				const midX = (e.x1 + e.x2) / 2;
				return (
					<path
						key={`edge-${e.x1}-${e.y1}-${e.x2}-${e.y2}`}
						d={`M ${e.x1} ${e.y1} C ${midX} ${e.y1}, ${midX} ${e.y2}, ${e.x2} ${e.y2}`}
						fill="none"
						stroke={e.color}
						strokeWidth={1.5}
						strokeOpacity={e.dashed ? 0.65 : 0.5}
						strokeDasharray={e.dashed ? "5 5" : undefined}
					/>
				);
			})}
		</svg>
	);
});

export const BoardHandle = memo(function BoardHandle({
	className = "",
}: {
	className?: string;
}) {
	return (
		<span
			aria-hidden
			className={`pointer-events-none absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full border-2 border-onyx bg-fog ${className}`}
		/>
	);
});
