import { STUDIO_PROTOTYPE_VIEWPORTS } from "../types/studio-prototype";
import type { StudioDevice } from "../types/studio-renderer";

/**
 * Screen-to-shell proportions of the adopted device mockups (Magic UI Safari
 * and iPhone, eldoraui iPad). Shell width is derived from the document
 * viewport so the iframe's real viewport equals the selected device and the
 * bezel only wraps it.
 */
const SHELL = {
	desktop: { screenWidth: 1200, shellWidth: 1203, shellHeight: 753 },
	tablet: { screenWidth: 342.87, shellWidth: 400, shellHeight: 520 },
	mobile: { screenWidth: 389.5, shellWidth: 433, shellHeight: 882 },
} as const;

export interface StudioPrototypeStage {
	viewport: { width: number; height: number };
	/** Natural (unscaled) shell size in CSS px. */
	shell: { width: number; height: number };
	/** Uniform scale that fits the shell into the available space. */
	scale: number;
	/** Scaled footprint, used to size the layout box around the transformed shell. */
	footprint: { width: number; height: number };
}

export const STUDIO_PROTOTYPE_STAGE_PADDING_PX = 24;
export const STUDIO_PROTOTYPE_MIN_SCALE = 0.2;

export function computeStudioPrototypeStage(
	device: StudioDevice,
	available: { width: number; height: number },
): StudioPrototypeStage {
	const viewport = STUDIO_PROTOTYPE_VIEWPORTS[device];
	const proportions = SHELL[device];
	const shellWidth =
		(viewport.width * proportions.shellWidth) / proportions.screenWidth;
	const shellHeight =
		(shellWidth * proportions.shellHeight) / proportions.shellWidth;
	const usableWidth = Math.max(
		1,
		available.width - STUDIO_PROTOTYPE_STAGE_PADDING_PX * 2,
	);
	const usableHeight = Math.max(
		1,
		available.height - STUDIO_PROTOTYPE_STAGE_PADDING_PX * 2,
	);
	// Never upscale past natural size: a bigger phone is not a sharper phone.
	const scale = Math.min(
		1,
		Math.max(
			STUDIO_PROTOTYPE_MIN_SCALE,
			Math.min(usableWidth / shellWidth, usableHeight / shellHeight),
		),
	);
	return {
		viewport,
		shell: { width: shellWidth, height: shellHeight },
		scale,
		footprint: { width: shellWidth * scale, height: shellHeight * scale },
	};
}
