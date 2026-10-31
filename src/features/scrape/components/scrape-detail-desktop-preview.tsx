import { useCallback, useEffect, useRef, useState } from "react";
import {
	SCRAPE_DESKTOP_HEIGHT,
	SCRAPE_PREVIEW_EMPTY_WINDOW_MS,
	SCRAPE_PREVIEW_FRAME_HEIGHT_STEP,
	SCRAPE_PREVIEW_FRAME_LOAD_TIMEOUT_MS,
	SCRAPE_PREVIEW_FRAME_MAX_HEIGHT,
	SCRAPE_PREVIEW_FRAME_MIN_HEIGHT,
	SCRAPE_PREVIEW_READY_MAX_PINGS,
	SCRAPE_PREVIEW_READY_PING_INTERVAL_MS,
} from "@/features/scrape/types/scrape-constants";
import {
	INITIAL_PREVIEW_READINESS,
	type PreviewReadinessState,
	previewDisplayReport,
	reducePreviewReport,
} from "@/features/scrape/utils/preview-readiness";
import {
	type FrameReport,
	PreviewCanvasOverlay,
} from "./scrape-detail-preview-overlay";

const PREVIEW_WIDTH = 1440;
const MIN_PREVIEW_SCALE = 0.75;
const PREVIEW_HEIGHT_RATIO = 0.75;

function initialFrameHeight(): number {
	return Math.round(SCRAPE_DESKTOP_HEIGHT * PREVIEW_HEIGHT_RATIO);
}

export function DesktopPreview({
	title,
	srcDoc,
	report,
	active = true,
	onReport,
	onRetry,
}: {
	title: string;
	srcDoc: string;
	report: FrameReport;
	active?: boolean;
	onReport?: (report: FrameReport) => void;
	onRetry?: () => void;
}) {
	const wrapRef = useRef<HTMLDivElement>(null);
	const [scale, setScale] = useState(1);
	// The frame starts at a readable viewport-sized canvas and then grows to the
	// height the captured document reports, so the whole page is one scroll away.
	// A page whose sections are sized in `vh` re-derives them from the frame, so
	// growth stops after the reports it triggers and the rest stays reachable
	// through the frame's own scroller.
	const [frameHeight, setFrameHeight] = useState(initialFrameHeight);
	const [frameLoaded, setFrameLoaded] = useState(false);

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
		const observer =
			typeof ResizeObserver === "undefined"
				? null
				: new ResizeObserver(measure);

		measure();
		observer?.observe(el);
		return () => observer?.disconnect();
	}, []);

	const frameRef = useRef<HTMLIFrameElement>(null);
	const pingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	// Every frame report is folded through one reducer, so a provisional empty
	// verdict can be upgraded by a later ready report instead of sticking.
	const readinessRef = useRef<PreviewReadinessState>(INITIAL_PREVIEW_READINESS);
	const emptySettled = useRef(false);
	const emptyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	const applyHeight = useCallback((reported: unknown) => {
		if (
			typeof reported !== "number" ||
			!Number.isFinite(reported) ||
			reported <= 0
		)
			return;
		const next = Math.min(
			SCRAPE_PREVIEW_FRAME_MAX_HEIGHT,
			Math.max(SCRAPE_PREVIEW_FRAME_MIN_HEIGHT, Math.ceil(reported)),
		); // The frame starts at the capture viewport and grows to the document. Height
		// reports repeat while resources arrive, so a small delta is ignored instead
		// of restarting layout work on every report.
		setFrameHeight((current) =>
			Math.abs(next - current) < SCRAPE_PREVIEW_FRAME_HEIGHT_STEP
				? current
				: next,
		);
	}, []);

	const applyReport = useCallback(
		(incoming: FrameReport) => {
			const next = reducePreviewReport(readinessRef.current, incoming);
			readinessRef.current = next;
			if (next.report !== "empty") {
				emptySettled.current = false;
				if (emptyTimer.current) clearTimeout(emptyTimer.current);
				emptyTimer.current = null;
				onReport?.(previewDisplayReport(next));
				return;
			}
			if (emptySettled.current) {
				onReport?.("empty");
				return;
			}
			if (!emptyTimer.current) {
				emptyTimer.current = setTimeout(() => {
					emptyTimer.current = null;
					if (readinessRef.current.report === "empty") {
						emptySettled.current = true;
						try {
							frameRef.current?.contentWindow?.postMessage(
								{ type: "vibedesign-preview-ping" },
								"*",
							);
						} catch {
							// The deadline still handles an unreachable document.
						}
					}
				}, SCRAPE_PREVIEW_EMPTY_WINDOW_MS);
			}
			onReport?.("preparing");
		},
		[onReport],
	);

	// A new document is a new attempt: readiness restarts and the frame returns
	// to its viewport-sized canvas until the new document reports its height.
	// Retrying a failed frame never inherits the old verdict or the old height.
	const measuredDocRef = useRef(srcDoc);
	useEffect(() => {
		if (measuredDocRef.current === srcDoc) return;
		measuredDocRef.current = srcDoc;
		readinessRef.current = INITIAL_PREVIEW_READINESS;
		emptySettled.current = false;
		if (emptyTimer.current) clearTimeout(emptyTimer.current);
		emptyTimer.current = null;
		setFrameLoaded(false);
		setFrameHeight(initialFrameHeight());
		onReport?.("preparing");
	}, [srcDoc, onReport]);

	useEffect(
		() => () => {
			if (emptyTimer.current) clearTimeout(emptyTimer.current);
		},
		[],
	);

	useEffect(() => {
		if (!onReport) return;
		const handleMessage = (event: MessageEvent) => {
			if (event.source !== frameRef.current?.contentWindow) return;
			const data: unknown = event.data;
			if (typeof data !== "object" || data === null) return;
			const payload = data as {
				type?: unknown;
				state?: unknown;
				height?: unknown;
			};
			if (payload.type !== "vibedesign-preview") return;
			const state = payload.state;
			if (
				state === "ready" ||
				state === "empty" ||
				state === "degraded" ||
				state === "failed" ||
				state === "preparing"
			) {
				// Only a document that rendered content may resize the canvas. Growing
				// while it is still preparing would push the loading overlay far below
				// the visible area, so the frame waits for a content report.
				if (state === "ready" || state === "degraded")
					applyHeight(payload.height);
				applyReport(state);
			}
		};
		window.addEventListener("message", handleMessage);
		return () => window.removeEventListener("message", handleMessage);
	}, [onReport, applyReport, applyHeight]);

	const handleFrameLoad = useCallback(() => {
		setFrameLoaded(true);
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
	// listener above is attached, so keep asking until a verdict settles. Pinging
	// starts only after the frame loaded, because a document that has not loaded
	// yet cannot answer; a frame that never loads is bounded instead of loading
	// forever.
	useEffect(() => {
		if (!onReport || !srcDoc || !active) return;
		const failOnSilence = () => {
			if (readinessRef.current.report !== "preparing" && !emptySettled.current)
				return;
			applyReport("failed");
		};
		if (!frameLoaded) {
			const timeout = setTimeout(
				failOnSilence,
				SCRAPE_PREVIEW_FRAME_LOAD_TIMEOUT_MS,
			);
			return () => clearTimeout(timeout);
		}
		const timeout = setTimeout(
			failOnSilence,
			SCRAPE_PREVIEW_FRAME_LOAD_TIMEOUT_MS,
		);
		let pings = 0;
		const ask = () => {
			if (
				pings >= SCRAPE_PREVIEW_READY_MAX_PINGS ||
				readinessRef.current.report === "ready" ||
				readinessRef.current.report === "degraded" ||
				readinessRef.current.report === "failed"
			) {
				pingTimer.current = null;
				return;
			}
			pings += 1;
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
			clearTimeout(timeout);
			if (pingTimer.current) {
				clearTimeout(pingTimer.current);
				pingTimer.current = null;
			}
		};
	}, [onReport, srcDoc, active, frameLoaded, applyReport]);

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
						srcDoc={srcDoc}
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
					<PreviewCanvasOverlay report={report} onRetry={onRetry} />
				</div>
			</div>
		</div>
	);
}
