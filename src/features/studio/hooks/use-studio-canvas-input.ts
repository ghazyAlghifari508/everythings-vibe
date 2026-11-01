import { type RefObject, useCallback, useEffect } from "react";
import {
	classifyWheelGesture,
	isScrollableOrEditableTarget,
} from "@/features/studio/utils/studio-canvas-gesture";
import { normalizeWheelDelta } from "@/hooks/use-canvas-zoom";

interface UseStudioCanvasInputInput {
	canvasRef: RefObject<HTMLElement | null>;
	onWheel: (event: WheelEvent) => void;
	setPan: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>;
	nudgePan: (key: string) => void;
	endPan: () => void;
	setTool: (tool: "select" | "hand") => void;
	setSpacePan: (active: boolean) => void;
	setIsPanning: (panning: boolean) => void;
	onSelectFrame?: (frameId: string | null, additive?: boolean) => void;
	cancelMarquee: () => void;
	hasActiveGesture: () => boolean;
}

/**
 * Wheel and keyboard input for the Studio canvas.
 *
 * Wheel handling must be a non-passive native listener: React attaches `wheel`
 * passively, so a Ctrl/Cmd + wheel gesture cannot be prevented and the browser
 * applies its own page zoom on top of the canvas zoom. Registering the listener
 * with `{ passive: false }` keeps the gesture inside the canvas and lets the
 * pointer-anchored zoom work as intended, while plain two-axis scrolling still
 * pans.
 */
export function useStudioCanvasInput({
	canvasRef,
	onWheel,
	setPan,
	nudgePan,
	endPan,
	setTool,
	setSpacePan,
	setIsPanning,
	onSelectFrame,
	cancelMarquee,
	hasActiveGesture,
}: UseStudioCanvasInputInput): void {
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
		function handleWheel(event: WheelEvent) {
			// Do not intercept scrolling inside active textareas, dropdowns,
			// or other scrollable overlays.
			if (isScrollableOrEditableTarget(event.target, canvas)) {
				return;
			}
			event.preventDefault();

			const gesture = classifyWheelGesture(event);
			if (gesture === "zoom") {
				onWheel(event);
				return;
			}

			const deltaX = normalizeWheelDelta({
				deltaY: event.deltaX,
				deltaMode: event.deltaMode,
			});
			const deltaY = normalizeWheelDelta(event);
			// Two-axis trackpad scrolling pans the board.
			setPan((previous) => ({
				x: previous.x - deltaX,
				y: previous.y - deltaY,
			}));
		}
		canvas.addEventListener("wheel", handleWheel, { passive: false });
		return () => canvas.removeEventListener("wheel", handleWheel);
	}, [canvasRef, onWheel, setPan]);

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
