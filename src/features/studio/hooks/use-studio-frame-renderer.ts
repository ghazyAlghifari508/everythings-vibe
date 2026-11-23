import { useEffect } from "react";
import type { StudioFrameRow } from "@/db/schema";
import type { StudioFrameVisual } from "@/features/studio/types/studio-preview";
import {
	type StudioDevice,
	studioNativeDevice,
} from "../types/studio-renderer";
import {
	resolveStudioFramePresentation,
	resolveStudioLiveNotice,
} from "../utils/studio-renderer";
import { useStudioLiveDocument } from "./use-studio-live-document";

interface UseStudioFrameRendererInput {
	frame: StudioFrameRow;
	status: string;
	hasRenderableHtml: boolean;
	cleanHtml: string;
	artboardMode: string;
	artboardRef: React.RefObject<HTMLElement | null>;
	visual: StudioFrameVisual | null;
	frameHeight: number;
	liveEnabled: boolean;
	inspectElement: boolean;
	device?: StudioDevice;
	refreshToken?: number;
	onReadinessChange?: (frameId: string, ready: boolean) => void;
	onMeasure?: (id: string, width: number, height: number) => void;
	onVisibilityChange?: (frameId: string, visible: boolean) => void;
}

/**
 * Resolves what one artboard shows from real signals: the persisted preview,
 * the live document's readiness and the requested device. Presentation only;
 * nothing here can create a job, a revision or a request to an AI model.
 */
export function useStudioFrameRenderer({
	frame,
	status,
	hasRenderableHtml,
	cleanHtml,
	artboardMode,
	artboardRef,
	visual,
	frameHeight,
	liveEnabled,
	inspectElement,
	device,
	refreshToken,
	onReadinessChange,
	onMeasure,
	onVisibilityChange,
}: UseStudioFrameRendererInput) {
	const native = studioNativeDevice(frame.viewport);
	const activeDevice = device ?? native;
	const live = useStudioLiveDocument({
		projectId: frame.projectId,
		frameId: frame.id,
		revision: frame.revision,
		html: cleanHtml || null,
		enabled: liveEnabled && hasRenderableHtml && status === "ready",
		refreshToken,
	});
	const presentation = resolveStudioFramePresentation({
		mode: inspectElement ? "inspect" : "canvas",
		recoverPreview: artboardMode === "visual-error",
		device: activeDevice,
		native,
		readiness: live.readiness,
		visualSize: visual ? { width: visual.width, height: visual.height } : null,
		fallbackHeight: frameHeight,
	});
	const liveNotice = resolveStudioLiveNotice({
		wantsLive: presentation.wantsLive && liveEnabled,
		device: activeDevice,
		native,
		readiness: live.readiness,
	});
	const onVisibility = onVisibilityChange;
	const frameId = frame.id;
	useEffect(() => {
		const node = artboardRef.current;
		if (!node || !onVisibility || typeof IntersectionObserver === "undefined")
			return;
		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries)
					onVisibility(frameId, entry.isIntersecting);
			},
			{ rootMargin: "600px" },
		);
		observer.observe(node);
		return () => observer.disconnect();
	}, [artboardRef, onVisibility, frameId]);
	const isLiveReady = live.readiness.phase === "ready";
	useEffect(() => {
		onReadinessChange?.(frame.id, isLiveReady);
	}, [frame.id, isLiveReady, onReadinessChange]);
	const measuredWidth = presentation.width;
	const measuredHeight = presentation.height;
	useEffect(() => {
		if (presentation.showLive && presentation.device !== native)
			onMeasure?.(frameId, measuredWidth, measuredHeight);
		else if (visual) onMeasure?.(frameId, visual.width, visual.height);
	}, [
		presentation.showLive,
		presentation.device,
		native,
		measuredWidth,
		measuredHeight,
		visual,
		onMeasure,
		frameId,
	]);
	return { native, live, presentation, liveNotice };
}
