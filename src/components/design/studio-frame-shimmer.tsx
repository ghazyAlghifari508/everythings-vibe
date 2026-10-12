export interface StudioFrameShimmerProps {
	viewport: string;
	status?: string;
	className?: string;
}

/**
 * Loading surface for a frame whose real visual is not displayable yet.
 *
 * One continuous shimmer sweeps the whole artboard; there is deliberately no
 * skeleton heading, paragraph, card, button, spinner, or loading label inside
 * it. The frame title already lives in the frame header above the artboard.
 */
export function StudioFrameShimmer({
	viewport,
	status = "generating",
	className = "",
}: StudioFrameShimmerProps) {
	return (
		<output
			data-testid={viewport === "mobile" ? "mobile-shimmer" : "web-shimmer"}
			data-frame-status={status}
			aria-label={
				status === "queued"
					? "Menunggu antrean generate layar"
					: "Layar sedang digenerate"
			}
			className={`studio-frame-shimmer block size-full ${className}`}
		/>
	);
}
