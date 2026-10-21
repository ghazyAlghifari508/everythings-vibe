import { useCallback, useEffect, useRef, useState } from "react";
import {
	SCRAPE_DESKTOP_HEIGHT,
	SCRAPE_PREVIEW_READY_PING_INTERVAL_MS,
} from "@/features/scrape/types/scrape-constants";
import {
	INITIAL_PREVIEW_READINESS,
	type PreviewReadinessState,
	previewDisplayReport,
	previewFrameResponded,
	previewShouldKeepPolling,
	reducePreviewReport,
} from "@/features/scrape/utils/preview-readiness";
import {
	type FrameReport,
	PreviewCanvasOverlay,
} from "./scrape-detail-preview-overlay";

const PREVIEW_WIDTH = 1440;
const MIN_PREVIEW_SCALE = 0.75;
const PREVIEW_HEIGHT_RATIO = 0.75;
const PREVIEW_MAX_HEIGHT = 760;

export function DesktopPreview({
	title,
	srcDoc,
	report,
	active = true,
	onReport,
	onRetry,
	onOpenSource,
}: {
	title: string;
	srcDoc: string;
	report: FrameReport;
	active?: boolean;
	onReport?: (report: FrameReport) => void;
	onRetry?: () => void;
	onOpenSource?: () => void;
}) {
	const wrapRef = useRef<HTMLDivElement>(null);
	const [scale, setScale] = useState(1);
	const [frameHeight, setFrameHeight] = useState(() =>
		Math.min(
			PREVIEW_MAX_HEIGHT,
			Math.round(SCRAPE_DESKTOP_HEIGHT * PREVIEW_HEIGHT_RATIO),
		),
	);

	useEffect(() => {
		const el = wrapRef.current;
		if (!el) return;

		const measure = () =>
			setScale(
				Math.min(
					1,
					Math.max(MIN_PREVIEW_SCALE, el.clientWidth / PREVIEW_WIDTH),
				),
			);
		const resizeFrame = () =>
			setFrameHeight(
				Math.min(
					PREVIEW_MAX_HEIGHT,
					Math.round(window.innerHeight * PREVIEW_HEIGHT_RATIO),
				),
			);
		const observer =
			typeof ResizeObserver === "undefined"
				? null
				: new ResizeObserver(measure);

		measure();
		resizeFrame();
		observer?.observe(el);
		window.addEventListener("resize", resizeFrame);
		return () => {
			observer?.disconnect();
			window.removeEventListener("resize", resizeFrame);
		};
	}, []);

	const frameRef = useRef<HTMLIFrameElement>(null);
	const pingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	// Every frame report is folded through one reducer, so a provisional empty
	// verdict can be upgraded by a later ready report instead of sticking.
	const readinessRef = useRef<PreviewReadinessState>(INITIAL_PREVIEW_READINESS);

	const stopPinging = useCallback(() => {
		if (pingTimer.current) {
			clearTimeout(pingTimer.current);
			pingTimer.current = null;
		}
	}, []);

	const applyReport = useCallback(
		(incoming: FrameReport) => {
			const next = reducePreviewReport(readinessRef.current, incoming);
			readinessRef.current = next;
			onReport?.(previewDisplayReport(next));
			if (!previewShouldKeepPolling(next)) stopPinging();
		},
		[onReport, stopPinging],
	);

	useEffect(() => {
		if (!onReport) return;
		const handleMessage = (event: MessageEvent) => {
			if (event.source !== frameRef.current?.contentWindow) return;
			const data: unknown = event.data;
			if (typeof data !== "object" || data === null) return;
			const payload = data as { type?: unknown; state?: unknown };
			if (payload.type !== "vibedesign-preview") return;
			const state = payload.state;
			if (
				state === "ready" ||
				state === "empty" ||
				state === "degraded" ||
				state === "failed" ||
				state === "preparing"
			) {
				applyReport(state);
			}
		};
		window.addEventListener("message", handleMessage);
		return () => window.removeEventListener("message", handleMessage);
	}, [onReport, applyReport]);

	useEffect(() => {
		return () => {
			if (pingTimer.current) clearTimeout(pingTimer.current);
		};
	}, []);

	const handleFrameLoad = useCallback(() => {
		if (!active) return;
		const frame = frameRef.current?.contentWindow;
		if (!frame) return;
		try {
			frame.postMessage({ type: "vibedesign-preview-ping" }, "*");
		} catch {
			// Frame navigated away or is not reachable; readiness stays preparing.
		}
	}, [active]);

	// The framed document reports on its own load, but that can land before the
	// listener above is attached, so keep asking until a verdict settles.
	useEffect(() => {
		if (!onReport || !srcDoc || !active) {
			if (pingTimer.current) clearTimeout(pingTimer.current);
			return;
		}
		readinessRef.current = INITIAL_PREVIEW_READINESS;
		onReport("preparing");
		const ask = () => {
			if (!previewShouldKeepPolling(readinessRef.current)) {
				pingTimer.current = null;
				// The budget ran out with no verdict. A frame that answered at least
				// once is alive and slow, so its last report stands; a frame that
				// never answered at all is a real failure to report.
				if (
					readinessRef.current.report === "preparing" &&
					!previewFrameResponded(readinessRef.current)
				)
					onReport("failed");
				return;
			}
			const frame = frameRef.current?.contentWindow;
			if (frame) {
				try {
					frame.postMessage({ type: "vibedesign-preview-ping" }, "*");
				} catch {
					// Unreachable frame keeps the open verdict; the budget bounds it.
				}
			}
			pingTimer.current = setTimeout(
				ask,
				SCRAPE_PREVIEW_READY_PING_INTERVAL_MS,
			);
		};
		ask();
		return () => {
			if (pingTimer.current) clearTimeout(pingTimer.current);
		};
	}, [onReport, srcDoc, active]);

	const canvasWidth = Math.max(1, Math.round(PREVIEW_WIDTH * scale));
	const canvasHeight = Math.max(1, Math.round(frameHeight * scale));

	return (
		<div className="flex flex-col">
			<div ref={wrapRef} className="relative w-full overflow-x-auto bg-white">
				<div
					className="min-h-[280px]"
					style={{
						position: "relative",
						width: canvasWidth,
						height: canvasHeight,
					}}
				>
					<iframe
						ref={frameRef}
						title={title}
						srcDoc={active ? srcDoc : ""}
						onLoad={handleFrameLoad}
						sandbox="allow-scripts"
						referrerPolicy="no-referrer"
						className="border-0"
						style={{
							position: "absolute",
							top: 0,
							left: 0,
							width: PREVIEW_WIDTH,
							height: frameHeight,
							transform: `scale(${scale})`,
							transformOrigin: "top left",
						}}
					/>
					<PreviewCanvasOverlay
						report={report}
						onRetry={onRetry}
						onOpenSource={onOpenSource}
					/>
				</div>
			</div>
		</div>
	);
}
