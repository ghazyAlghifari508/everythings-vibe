import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import type { StudioFrameRow } from "@/db/schema";
import {
	STUDIO_VISUAL_FALLBACK_HEIGHT,
	STUDIO_VISUAL_WIDTH,
} from "@/features/studio/types/studio-constants";
import {
	STUDIO_PREVIEW_REQUEST_TIMEOUT_MS,
	type StudioFrameVisual,
	studioPreviewSchema,
} from "@/features/studio/types/studio-preview";
import { extractCleanHtml } from "@/features/studio/utils/clean-html";
import { readFrameVisualError } from "@/features/studio/utils/studio-frame-artboard";
import { studioJobTiming } from "../services/studio-timing";

interface UseStudioFrameVisualInput {
	frame: StudioFrameRow;
	isMobile: boolean;
	onMeasure?: (id: string, width: number, height: number) => void;
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
	const input = useMemo(
		() => ({
			id: frame.id,
			projectId: frame.projectId,
			html: frame.htmlCode,
			viewport: frame.viewport,
		}),
		[frame.id, frame.projectId, frame.htmlCode, frame.viewport],
	);
	const [visualAttempt, setVisualAttempt] = useState(0);
	const [measuredHeight, setMeasuredHeight] = useState<number | null>(null);
	const [result, setResult] = useState<{
		input: typeof input;
		attempt: number;
		visual: StudioFrameVisual | null;
		error: string;
	} | null>(null);
	const current =
		result?.input === input && result.attempt === visualAttempt ? result : null;
	const visual = current?.visual ?? null;
	const visualError = current?.error ?? "";
	const measure = useEffectEvent((width: number, height: number) =>
		onMeasure?.(input.id, width, height),
	);
	const artboardRef = useRef<HTMLElement>(null);
	const frameHeight =
		measuredHeight ??
		(isMobile
			? STUDIO_VISUAL_FALLBACK_HEIGHT.mobile
			: STUDIO_VISUAL_FALLBACK_HEIGHT.web);

	useEffect(() => {
		if (!extractCleanHtml(input.html ?? "") || !artboardRef.current) return;
		const controller = new AbortController();
		let started = false;
		let deadline: ReturnType<typeof setTimeout> | undefined;
		function fail(message: string) {
			setResult({
				input,
				attempt: visualAttempt,
				visual: null,
				error: message,
			});
		}
		async function load() {
			if (started || controller.signal.aborted) return;
			started = true;
			const startedAt = Date.now();
			deadline = setTimeout(() => {
				fail("Pratinjau belum dapat dimuat. Silakan coba lagi.");
				controller.abort();
			}, STUDIO_PREVIEW_REQUEST_TIMEOUT_MS);
			try {
				const response = await fetch(
					`/api/studio/frame?projectId=${encodeURIComponent(input.projectId)}&frameId=${encodeURIComponent(input.id)}&attempt=${visualAttempt}`,
					{ signal: controller.signal },
				);
				const data: unknown = await response.json();
				if (controller.signal.aborted) return;
				const parsed = studioPreviewSchema.safeParse(data);
				if (
					!response.ok ||
					!parsed.success ||
					parsed.data.width !==
						STUDIO_VISUAL_WIDTH[input.viewport === "mobile" ? "mobile" : "web"]
				) {
					throw new Error(readFrameVisualError(data));
				}
				setResult({
					input,
					attempt: visualAttempt,
					visual: parsed.data,
					error: "",
				});
				studioJobTiming("preview-available", startedAt, {
					projectId: input.projectId,
					frameId: input.id,
				});
				setMeasuredHeight(parsed.data.height);
				measure(parsed.data.width, parsed.data.height);
			} catch (failure) {
				if (!controller.signal.aborted)
					fail(
						failure instanceof Error
							? failure.message
							: "Visual frame gagal dimuat.",
					);
			} finally {
				clearTimeout(deadline);
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
			clearTimeout(deadline);
			observer?.disconnect();
		};
	}, [input, visualAttempt]);

	return {
		visual,
		visualError,
		setVisualError: (error) =>
			setResult({ input, attempt: visualAttempt, visual, error }),
		retryVisual: () => setVisualAttempt((attempt) => attempt + 1),
		artboardRef,
		frameHeight,
	};
}
