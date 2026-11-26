import { useEffect, useEffectEvent, useRef } from "react";
import type { StudioFrameRow, StudioJobRow } from "@/db/schema";
import { studioJobTiming } from "../services/studio-timing";
import { STUDIO_VISUAL_FALLBACK_HEIGHT } from "../types/studio-constants";
import {
	STUDIO_LIVE_VISIBILITY_MARGIN_PX,
	type StudioDevice,
	studioNativeDevice,
} from "../types/studio-renderer";
import {
	resolveStudioFramePresentation,
	resolveStudioLiveNotice,
} from "../utils/studio-renderer";
import { useStudioLiveDocument } from "./use-studio-live-document";
import type { StudioVisibilityReporter } from "./use-studio-live-pool";

interface UseStudioFrameRendererInput {
	frame: StudioFrameRow;
	hasRenderableHtml: boolean;
	cleanHtml: string;
	artboardRef: React.RefObject<HTMLElement | null>;
	/** The real canvas viewport; observer geometry follows zoom and pan. */
	viewportRef?: React.RefObject<HTMLElement | null>;
	liveEnabled: boolean;
	device?: StudioDevice;
	refreshToken?: number;
	initialJobTiming?: Pick<StudioJobRow, "id" | "createdAt">;
	onReadinessChange?: (frameId: string, ready: boolean) => void;
	onMeasure?: (id: string, width: number, height: number) => void;
	onVisibilityChange?: StudioVisibilityReporter;
}

/**
 * Resolves what one artboard shows from the committed HTML and the isolated
 * document prepared for it. Normal canvas and Pencil share this exact document;
 * only the parent-granted capabilities differ. Presentation only: nothing here
 * can create a job, a revision or a request to an AI model.
 */
export function useStudioFrameRenderer({
	frame,
	hasRenderableHtml,
	cleanHtml,
	artboardRef,
	viewportRef,
	liveEnabled,
	device,
	refreshToken,
	initialJobTiming,
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
		enabled: liveEnabled && hasRenderableHtml,
		refreshToken,
	});
	const hasActiveDocument = live.state.active !== null;
	// A predecessor may remain visible while a replacement loads or fails. It is
	// never reported as the completed revision while its key is not current.
	const pending =
		live.state.incoming !== null ||
		(hasActiveDocument && live.state.active?.document.keyId !== live.keyId);
	const fallbackHeight =
		STUDIO_VISUAL_FALLBACK_HEIGHT[activeDevice === "mobile" ? "mobile" : "web"];
	const presentation = resolveStudioFramePresentation({
		device: activeDevice,
		native,
		readiness: live.readiness,
		hasActiveDocument,
		pending,
		fallbackHeight,
	});
	const liveNotice = resolveStudioLiveNotice({
		wantsLive: hasRenderableHtml,
		pending,
		device: activeDevice,
		native,
		readiness: live.readiness,
	});
	const isCurrent = presentation.isCurrent;

	useEffect(() => {
		onReadinessChange?.(frame.id, isCurrent);
	}, [frame.id, isCurrent, onReadinessChange]);

	const markVisible = useEffectEvent(() => {
		const startedAt = (
			initialJobTiming?.createdAt ?? frame.createdAt
		).getTime();
		studioJobTiming("frame-visible", startedAt, {
			projectId: frame.projectId,
			frameId: frame.id,
			jobId: initialJobTiming?.id,
		});
		studioJobTiming("document-ready", Date.now(), {
			projectId: frame.projectId,
			frameId: frame.id,
		});
	});
	const reportedKey = useRef<string | null>(null);
	useEffect(() => {
		if (!isCurrent || reportedKey.current === live.keyId) return;
		reportedKey.current = live.keyId;
		markVisible();
	}, [isCurrent, live.keyId]);

	const frameId = frame.id;
	useEffect(() => {
		const node = artboardRef.current;
		if (!node || !onVisibilityChange) return;
		if (typeof IntersectionObserver === "undefined") {
			// No viewport signal: stay unmounted instead of loading every frame.
			return;
		}
		const root = viewportRef?.current ?? null;
		let observing = true;
		const observers = (["visible", "prewarm"] as const).map((region) => {
			const observer = new IntersectionObserver(
				(entries) => {
					if (!observing) return;
					for (const entry of entries)
						onVisibilityChange(frameId, entry.isIntersecting, region);
				},
				{
					root,
					rootMargin:
						region === "visible"
							? "0px"
							: `${STUDIO_LIVE_VISIBILITY_MARGIN_PX}px`,
				},
			);
			observer.observe(node);
			return observer;
		});
		return () => {
			observing = false;
			for (const observer of observers) observer.disconnect();
			onVisibilityChange(frameId, false, "visible");
			onVisibilityChange(frameId, false, "prewarm");
		};
	}, [artboardRef, viewportRef, onVisibilityChange, frameId]);

	const measuredWidth = presentation.width;
	const measuredHeight = presentation.height;
	useEffect(() => {
		if (hasActiveDocument) onMeasure?.(frameId, measuredWidth, measuredHeight);
	}, [hasActiveDocument, measuredWidth, measuredHeight, onMeasure, frameId]);

	return { native, live, presentation, liveNotice, pending, isCurrent };
}
