import { useEffect, useRef, useState } from "react";
import type { StudioFrameRow } from "@/db/schema";
import { STUDIO_VISUAL_FALLBACK_HEIGHT } from "@/features/studio/types/studio-constants";
import { readFrameVisualError } from "@/features/studio/utils/studio-frame-artboard";

interface UseStudioFrameVisualInput {
	frame: StudioFrameRow;
	isMobile: boolean;
	onMeasure?: (id: string, width: number, height: number) => void;
}

interface StudioFrameVisual {
	url: string;
	width: number;
	height: number;
}

export interface StudioFrameVisualState {
	visual: StudioFrameVisual | null;
	visualError: string;
	setVisualError: (message: string) => void;
	/** Re-requests the capture, e.g. after the image itself failed to load. */
	retryVisual: () => void;
	artboardRef: React.RefObject<HTMLElement | null>;
	frameHeight: number;
}

/**
 * Loads the captured preview for one frame.
 *
 * The visual fetch is skipped for a ready frame without HTML: there is nothing
 * to capture, so the request would only burn a round trip. Loading is deferred
 * until the artboard approaches the viewport, so a wide project does not fire
 * one capture request per frame on mount.
 */
export function useStudioFrameVisual({
	frame,
	isMobile,
	onMeasure,
}: UseStudioFrameVisualInput): StudioFrameVisualState {
	const [visual, setVisual] = useState<StudioFrameVisual | null>(null);
	const [visualError, setVisualError] = useState("");
	const [visualAttempt, setVisualAttempt] = useState(0);
	const artboardRef = useRef<HTMLElement>(null);
	const frameHeight =
		visual?.height ??
		(isMobile
			? STUDIO_VISUAL_FALLBACK_HEIGHT.mobile
			: STUDIO_VISUAL_FALLBACK_HEIGHT.web);

	useEffect(() => {
		if (!frame.htmlCode || !artboardRef.current) return;
		const controller = new AbortController();
		let started = false;
		async function load() {
			if (started) return;
			started = true;
			setVisualError("");
			try {
				const response = await fetch(
					`/api/studio/frame?projectId=${encodeURIComponent(frame.projectId)}&frameId=${encodeURIComponent(frame.id)}&attempt=${visualAttempt}`,
					{ signal: controller.signal },
				);
				const data: unknown = await response.json();
				if (
					!response.ok ||
					typeof data !== "object" ||
					data === null ||
					!("url" in data) ||
					typeof data.url !== "string" ||
					!("width" in data) ||
					typeof data.width !== "number" ||
					!("height" in data) ||
					typeof data.height !== "number"
				) {
					throw new Error(readFrameVisualError(data));
				}
				setVisual({ url: data.url, width: data.width, height: data.height });
				onMeasure?.(frame.id, data.width, data.height);
			} catch (failure) {
				if (!controller.signal.aborted)
					setVisualError(
						failure instanceof Error
							? failure.message
							: "Visual frame gagal dimuat.",
					);
			}
		}
		const observer =
			typeof IntersectionObserver === "undefined"
				? null
				: new IntersectionObserver(
						(entries) => {
							if (entries.some((entry) => entry.isIntersecting)) void load();
						},
						{ rootMargin: "600px" },
					);
		if (observer) observer.observe(artboardRef.current);
		else void load();
		return () => {
			controller.abort();
			observer?.disconnect();
		};
	}, [frame.id, frame.projectId, frame.htmlCode, visualAttempt, onMeasure]);

	return {
		visual,
		visualError,
		setVisualError,
		retryVisual: () => setVisualAttempt((attempt) => attempt + 1),
		artboardRef,
		frameHeight,
	};
}
