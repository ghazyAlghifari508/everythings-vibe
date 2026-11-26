import { type RefObject, useCallback, useEffect, useRef } from "react";
import {
	isScrollableOrEditableTarget,
	normalizeWheelPanDelta,
	type WheelPanDelta,
} from "@/features/studio/utils/studio-canvas-gesture";

interface UseStudioCanvasInputInput {
	canvasRef: RefObject<HTMLElement | null>;
	setPan: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>;
	cancelFocusAnimation: () => void;
	nudgePan: (key: string) => void;
	endPan: () => void;
	setTool: (tool: "select" | "hand" | "element") => void;
	setSpacePan: (active: boolean) => void;
	setIsPanning: (panning: boolean) => void;
	onSelectFrame?: (frameId: string | null, additive?: boolean) => void;
	cancelMarquee: () => void;
	hasActiveGesture: () => boolean;
}

/**
 * Wheel and keyboard input for the Studio canvas.
 *
 * The wheel listener is non-passive because React attaches `wheel` passively.
 * Ctrl/Cmd + wheel is left untouched for browser/OS accessibility zoom. Every
 * other wheel event — mouse notch or two-finger trackpad scroll — pans both
 * axes. Deltas are coalesced into one animation frame so a high-frequency
 * trackpad cannot schedule a state update per native event.
 */
export function useStudioCanvasInput({
	canvasRef,
	setPan,
	cancelFocusAnimation,
	nudgePan,
	endPan,
	setTool,
	setSpacePan,
	setIsPanning,
	onSelectFrame,
	cancelMarquee,
	hasActiveGesture,
}: UseStudioCanvasInputInput): void {
	const pendingPan = useRef<WheelPanDelta>({ x: 0, y: 0 });
	const pendingFrame = useRef<number | null>(null);

	const blur = useCallback(() => {
		setSpacePan(false);
		setIsPanning(false);
		endPan();
		// A lost window focus must not leave a drag preview half-committed.
		cancelMarquee();
	}, [cancelMarquee, endPan, setSpacePan, setIsPanning]);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		const commitPan = () => {
			pendingFrame.current = null;
			const { x, y } = pendingPan.current;
			pendingPan.current = { x: 0, y: 0 };
			if (x === 0 && y === 0) return;
			setPan((previous) => ({
				x: previous.x - x,
				y: previous.y - y,
			}));
		};

		const handleWheel = (event: WheelEvent) => {
			// Browser/OS zoom is an accessibility affordance; intercepting it
			// would produce both a page zoom and a canvas pan.
			if (event.defaultPrevented || event.ctrlKey || event.metaKey) return;
			// Do not intercept scrolling inside active textareas, dropdowns,
			// real controls, or other scrollable overlays. Frame artboards are
			// gesture surfaces and are excluded from that guard.
			if (isScrollableOrEditableTarget(event.target, canvas)) return;

			const delta = normalizeWheelPanDelta(event, canvas);
			if (delta.x === 0 && delta.y === 0) return;
			if (event.cancelable) event.preventDefault();
			cancelFocusAnimation();
			pendingPan.current.x += delta.x;
			pendingPan.current.y += delta.y;
			if (pendingFrame.current === null) {
				pendingFrame.current = requestAnimationFrame(commitPan);
			}
		};

		canvas.addEventListener("wheel", handleWheel, { passive: false });
		return () => {
			canvas.removeEventListener("wheel", handleWheel);
			if (pendingFrame.current !== null) {
				cancelAnimationFrame(pendingFrame.current);
				pendingFrame.current = null;
			}
			pendingPan.current = { x: 0, y: 0 };
		};
	}, [canvasRef, cancelFocusAnimation, setPan]);

	useEffect(() => {
		// Arrow-key panning is a window-level affordance because the canvas
		// surface is a non-interactive landmark and must not enter the tab
		// order. It stays inert while focus is inside a control or editable
		// field, so it never steals arrows from a menu, dialog or textarea.
		function isEditableTarget(target: EventTarget | null) {
			return (
				target instanceof Element &&
				target.closest(
					"input,textarea,select,button,a,[contenteditable=true],[role=menu],[role=menuitem],[role=dialog]",
				) !== null
			);
		}
		function keydown(event: KeyboardEvent) {
			if (isEditableTarget(event.target)) return;
			if (event.ctrlKey || event.metaKey || event.altKey) return;
			if (event.key.toLowerCase() === "v") {
				cancelMarquee();
				setTool("select");
			}
			if (event.key.toLowerCase() === "h") {
				cancelMarquee();
				setTool("hand");
			}
			if (event.key.toLowerCase() === "e") {
				cancelMarquee();
				setTool("element");
			}
			if (event.key.startsWith("Arrow")) nudgePan(event.key);
			if (event.code === "Space") {
				event.preventDefault();
				setSpacePan(true);
			}
			if (event.key === "Escape") {
				// Escape first cancels an in-progress marquee (restoring the
				// selection it started from); otherwise it clears the selection.
				if (hasActiveGesture()) cancelMarquee();
				else onSelectFrame?.(null);
			}
		}
		function release(event: KeyboardEvent) {
			if (event.code === "Space") setSpacePan(false);
		}
		window.addEventListener("keydown", keydown);
		window.addEventListener("keyup", release);
		window.addEventListener("blur", blur);
		return () => {
			window.removeEventListener("keydown", keydown);
			window.removeEventListener("keyup", release);
			window.removeEventListener("blur", blur);
		};
	}, [
		blur,
		cancelMarquee,
		hasActiveGesture,
		nudgePan,
		onSelectFrame,
		setSpacePan,
		setTool,
	]);
}
