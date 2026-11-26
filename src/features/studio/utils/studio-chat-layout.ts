import {
	STUDIO_CHAT_PANEL_MARGIN_PX,
	STUDIO_CHAT_PANEL_MAX_WIDTH_PX,
	STUDIO_CHAT_PANEL_MIN_WIDTH_PX,
	STUDIO_CHAT_PANEL_VIEWPORT_RATIO,
} from "@/features/studio/types/studio-constants";

const widthCss = `clamp(${STUDIO_CHAT_PANEL_MIN_WIDTH_PX}px, ${STUDIO_CHAT_PANEL_VIEWPORT_RATIO * 100}vw, ${STUDIO_CHAT_PANEL_MAX_WIDTH_PX}px)`;

/** The panel's CSS width and the canvas inset derive from one rule, so frames never open underneath it. */
export function studioChatPanelWidthCss(): string {
	return widthCss;
}

export function studioChatPanelWidthPx(viewportWidth: number): number {
	return Math.min(
		STUDIO_CHAT_PANEL_MAX_WIDTH_PX,
		Math.max(
			STUDIO_CHAT_PANEL_MIN_WIDTH_PX,
			viewportWidth * STUDIO_CHAT_PANEL_VIEWPORT_RATIO,
		),
	);
}

/** Space from the canvas left edge that a floating panel occupies, including both margins. */
export function studioChatPanelInsetPx(viewportWidth: number): number {
	return (
		studioChatPanelWidthPx(viewportWidth) + STUDIO_CHAT_PANEL_MARGIN_PX * 2
	);
}

export function studioChatPanelInsetCss(): string {
	return `calc(${widthCss} + ${STUDIO_CHAT_PANEL_MARGIN_PX * 2}px)`;
}
