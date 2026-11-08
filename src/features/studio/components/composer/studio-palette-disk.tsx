import type { CSSProperties } from "react";

function roleKey(color: string, index: number): string {
	return `${color.replace("#", "")}-${index + 1}`;
}

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

export function buildPaletteConicGradient(colors: readonly string[]): string {
	if (!colors || colors.length === 0) return "";
	if (colors.length === 1) return colors[0] ?? "";
	const count = colors.length;
	const step = 360 / count;
	const stops = colors.map((color, index) => {
		const start = (index * step).toFixed(2);
		const end = ((index + 1) * step).toFixed(2);
		return `${color} ${start}deg ${end}deg`;
	});
	return `conic-gradient(from 0deg, ${stops.join(", ")})`;
}

/**
 * Single circular multicolor palette icon displaying the active reference colors
 * as segmented slices (Google Stitch style), replacing separate dot swatches.
 */
export function StudioPaletteDisk({
	colors,
	label,
	className = "",
	testId = "studio-palette-disk",
}: StudioPaletteDiskProps) {
	const validColors = filterValidHexColors(colors);
	if (validColors.length === 0) return null;

	const gradient = buildPaletteConicGradient(validColors);
	const accessibleLabel = label
		? `Palet tema ${label}: ${validColors.join(", ")}`
		: `Palet warna: ${validColors.join(", ")}`;

	const isConic = gradient.startsWith("conic-gradient");
	const style: CSSProperties = {
		backgroundColor: validColors[0],
		backgroundImage: isConic ? gradient : undefined,
	};

	return (
		<span
			data-testid={testId}
			role="img"
			aria-label={accessibleLabel}
			title={accessibleLabel}
			className={`size-3.5 shrink-0 rounded-full border border-white/20 shadow-2xs ${className}`}
			style={style}
			data-colors={validColors.join(",")}
		>
			{validColors.map((color, index) => {
				const role = SWATCH_ROLES[index] ?? `color-${roleKey(color, index)}`;
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
