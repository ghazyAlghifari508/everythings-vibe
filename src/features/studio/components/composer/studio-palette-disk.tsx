const DISK_SIZE = 16;
const DISK_CENTER = DISK_SIZE / 2;
const DISK_RADIUS = DISK_CENTER;
// Adjacent SVG sectors share an antialiased edge, which browsers can render as
// a hairline crack. Every sector after the first starts slightly early so it
// overlaps its neighbour instead of meeting it on a transparent seam.
const SEGMENT_OVERLAP_DEG = 0.5;

const SWATCH_ROLES = ["canvas", "primary", "ink"] as const;

export interface StudioPaletteDiskProps {
	colors: readonly string[];
	label?: string | null;
	className?: string;
	testId?: string;
}

export function filterValidHexColors(
	colors?: readonly string[] | null,
): string[] {
	if (!colors || colors.length === 0) return [];
	return colors
		.map((color) => (typeof color === "string" ? color.trim() : ""))
		.filter((color) =>
			/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(color),
		);
}

function polarPoint(angleDeg: number): string {
	const radians = (angleDeg * Math.PI) / 180;
	const x = DISK_CENTER + DISK_RADIUS * Math.cos(radians);
	const y = DISK_CENTER + DISK_RADIUS * Math.sin(radians);
	return `${x.toFixed(3)} ${y.toFixed(3)}`;
}

function sectorPath(startDeg: number, endDeg: number): string {
	const span = endDeg - startDeg;
	const largeArc = span > 180 ? 1 : 0;
	return `M ${DISK_CENTER} ${DISK_CENTER} L ${polarPoint(startDeg)} A ${DISK_RADIUS} ${DISK_RADIUS} 0 ${largeArc} 1 ${polarPoint(endDeg)} Z`;
}

export interface StudioPaletteSegment {
	color: string;
	/** null means the solid full disk `path`. */
	path: string | null;
}

/**
 * Segmented circular palette. The first colour is a solid disk and each later
 * colour is a clipped sector overlap, so the visible shape is always a perfect
 * circle without borders, cracks or square corners.
 */
export function buildPaletteSegments(
	colors: readonly string[],
): StudioPaletteSegment[] {
	if (colors.length === 0) return [];
	if (colors.length === 1) return [{ color: colors[0] ?? "", path: null }];
	const step = 360 / colors.length;
	return colors.map((color, index) => {
		if (index === 0) return { color, path: null };
		return {
			color,
			path: sectorPath(index * step - SEGMENT_OVERLAP_DEG, (index + 1) * step),
		};
	});
}

/**
 * Single circular multicolor palette icon displaying the active reference
 * colors as filled sectors (Google Stitch style). Rendered as a clipped SVG so
 * the segments never show the conic-gradient seam or a border cutting the
 * colour edge, and so it stays crisp at any device pixel ratio.
 */
export function StudioPaletteDisk({
	colors,
	label,
	className = "",
	testId = "studio-palette-disk",
}: StudioPaletteDiskProps) {
	const validColors = filterValidHexColors(colors);
	if (validColors.length === 0) return null;

	const segments = buildPaletteSegments(validColors);
	const accessibleLabel = label
		? `Palet tema ${label}: ${validColors.join(", ")}`
		: `Palet warna: ${validColors.join(", ")}`;

	return (
		<span
			data-testid={testId}
			role="img"
			aria-label={accessibleLabel}
			title={accessibleLabel}
			className={`inline-block size-3.5 shrink-0 overflow-hidden rounded-full ${className}`}
			data-colors={validColors.join(",")}
		>
			<svg
				viewBox={`0 0 ${DISK_SIZE} ${DISK_SIZE}`}
				width="100%"
				height="100%"
				className="block"
				aria-hidden="true"
				focusable="false"
			>
				{segments.map((segment) =>
					segment.path ? (
						<path
							key={`${segment.color}-${segment.path}`}
							data-segment={segment.color}
							d={segment.path}
							fill={segment.color}
						/>
					) : (
						<circle
							key={`${segment.color}-disk`}
							data-segment={segment.color}
							cx={DISK_CENTER}
							cy={DISK_CENTER}
							r={DISK_RADIUS}
							fill={segment.color}
						/>
					),
				)}
			</svg>
			{validColors.map((color, index) => {
				const role = SWATCH_ROLES[index] ?? `color-${index + 1}`;
				return (
					<span
						key={role}
						className="sr-only"
						data-color={color}
						data-role={role}
					>
						{color}
					</span>
				);
			})}
		</span>
	);
}
