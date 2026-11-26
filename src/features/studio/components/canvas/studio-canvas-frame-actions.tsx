import { type RefObject, useEffect, useState } from "react";
import type { StudioFrameRow } from "@/db/schema";
import {
	buildStudioPreviewTarget,
	type StudioPreviewTarget,
} from "@/features/studio/types/studio-preview-contract";
import {
	type StudioDevice,
	studioNativeDevice,
} from "@/features/studio/types/studio-renderer";
import type { StudioCanvasFrameBounds } from "@/features/studio/utils/studio-canvas-fit";
import { computeFrameToolbarPlacement } from "@/features/studio/utils/studio-frame-toolbar";
import { StudioFrameToolbar } from "./studio-frame-toolbar";

interface StudioCanvasFrameActionsProps {
	canvasRef: RefObject<HTMLElement | null>;
	frame: StudioFrameRow;
	frameIndex: number;
	bounds: StudioCanvasFrameBounds[];
	zoom: number;
	pan: { x: number; y: number };
	leftInsetPx: number;
	device?: StudioDevice;
	liveReady: boolean;
	onDeviceChange?: (frameId: string, device: StudioDevice) => void;
	onFocus: (frameId: string) => void;
	onRefresh?: (frameId: string) => void;
	onPreview?: (target: StudioPreviewTarget) => void;
}

export function StudioCanvasFrameActions({
	canvasRef,
	frame,
	frameIndex,
	bounds,
	zoom,
	pan,
	leftInsetPx,
	device,
	liveReady,
	onDeviceChange,
	onFocus,
	onRefresh,
	onPreview,
}: StudioCanvasFrameActionsProps) {
	const [viewport, setViewport] = useState({ width: 0, height: 0 });
	useEffect(() => {
		const node = canvasRef.current;
		if (!node) return;
		const measure = () => {
			const { width, height } = node.getBoundingClientRect();
			setViewport((previous) =>
				previous.width === width && previous.height === height
					? previous
					: { width, height },
			);
		};
		measure();
		if (typeof ResizeObserver === "undefined") {
			window.addEventListener("resize", measure);
			return () => window.removeEventListener("resize", measure);
		}
		const observer = new ResizeObserver(measure);
		observer.observe(node);
		return () => observer.disconnect();
	}, [canvasRef]);

	const placement = computeFrameToolbarPlacement({
		bounds,
		frameIndex,
		zoom,
		pan,
		canvas: viewport,
		leftInsetPx,
	});
	if (!placement) return null;
	const nativeDevice = studioNativeDevice(frame.viewport);
	const activeDevice = device ?? nativeDevice;
	const previewTarget = buildStudioPreviewTarget({
		projectId: frame.projectId,
		frameId: frame.id,
		device: activeDevice,
		returnTo: `/design/${encodeURIComponent(frame.projectId)}`,
		routeAvailable: Boolean(onPreview),
	});

	return (
		<StudioFrameToolbar
			placement={placement}
			frameName={frame.name}
			device={activeDevice}
			nativeDevice={nativeDevice}
			liveReady={liveReady}
			previewTarget={previewTarget}
			onDeviceChange={
				onDeviceChange && ((next) => onDeviceChange(frame.id, next))
			}
			onFocus={() => onFocus(frame.id)}
			onRefresh={onRefresh && (() => onRefresh(frame.id))}
			onPreview={onPreview}
		/>
	);
}
