import {
	STUDIO_DEVICE_HEIGHT_BREAKPOINTS,
	STUDIO_DEVICE_PRESETS,
} from "../types/studio-renderer";

const VIEWPORT_HEIGHT_UNIT = /(-?\d*\.?\d+)\s*(?:d|s|l)?vh\b/gi;

/**
 * The live iframe is as tall as the document, so a raw `vh` would resolve to
 * the whole page. The screenshot capture renders at a fixed viewport height;
 * rewriting `vh` to a custom property keeps `min-h-screen` style layouts
 * identical in both without any parent-to-child channel.
 */
export function pinStudioViewportUnits(css: string): string {
	return css.replace(
		VIEWPORT_HEIGHT_UNIT,
		(_match, amount: string) => `calc(${amount} * var(--ev-vh))`,
	);
}

/** Resolves `--ev-vh` from the real document width, so a device change responds. */
export function studioViewportHeightCss(): string {
	const { mobileMaxWidth, tabletMaxWidth } = STUDIO_DEVICE_HEIGHT_BREAKPOINTS;
	const unit = (device: keyof typeof STUDIO_DEVICE_PRESETS) =>
		`${STUDIO_DEVICE_PRESETS[device].height / 100}px`;
	return `:root{--ev-vh:${unit("desktop")}}@media (max-width:${tabletMaxWidth}px){:root{--ev-vh:${unit("tablet")}}}@media (max-width:${mobileMaxWidth}px){:root{--ev-vh:${unit("mobile")}}}`;
}
