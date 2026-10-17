"use client";

import {
	type KeyboardEvent,
	type ReactNode,
	type PointerEvent as ReactPointerEvent,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { useIsomorphicLayoutEffect } from "@/hooks/use-isomorphic-layout-effect";

export interface CodebaseWorkspaceShellProps {
	canvasOpen: boolean;
	leftPane: ReactNode;
	chatPane: ReactNode;
	canvasPane: ReactNode;
}

const STORAGE_KEY = "vibeeverything_canvas_width";
const DEFAULT_CANVAS_WIDTH = 560;
const MIN_CANVAS_WIDTH = 360;
const MAX_CANVAS_RATIO = 0.6;
const MIN_CHAT_WIDTH = 360;
const KEYBOARD_STEP = 20;

function getInitialWidth(): number {
	if (typeof window === "undefined") return DEFAULT_CANVAS_WIDTH;
	try {
		const saved = localStorage.getItem(STORAGE_KEY);
		if (!saved) return DEFAULT_CANVAS_WIDTH;
		const parsed = Number.parseInt(saved, 10);
		return Number.isFinite(parsed) && parsed >= MIN_CANVAS_WIDTH
			? parsed
			: DEFAULT_CANVAS_WIDTH;
	} catch {
		return DEFAULT_CANVAS_WIDTH;
	}
}

function persistWidth(width: number): void {
	if (typeof window === "undefined") return;
	try {
		localStorage.setItem(STORAGE_KEY, Math.round(width).toString());
	} catch {
		return;
	}
}

export function CodebaseWorkspaceShell({
	canvasOpen,
	leftPane,
	chatPane,
	canvasPane,
}: CodebaseWorkspaceShellProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [canvasWidth, setCanvasWidth] = useState<number>(DEFAULT_CANVAS_WIDTH);
	const [isDragging, setIsDragging] = useState(false);
	const canvasWidthRef = useRef(canvasWidth);
	canvasWidthRef.current = canvasWidth;

	useEffect(() => {
		const saved = getInitialWidth();
		if (saved !== DEFAULT_CANVAS_WIDTH) setCanvasWidth(saved);
	}, []);

	const [isMounted, setIsMounted] = useState(canvasOpen);
	const [isExpanded, setIsExpanded] = useState(canvasOpen);
	const isInitialMount = useRef(true);
	const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const rafRef = useRef<number | null>(null);

	useIsomorphicLayoutEffect(() => {
		if (isInitialMount.current) {
			isInitialMount.current = false;
			return;
		}
		if (closeTimeoutRef.current) {
			clearTimeout(closeTimeoutRef.current);
			closeTimeoutRef.current = null;
		}
		if (rafRef.current) {
			cancelAnimationFrame(rafRef.current);
			rafRef.current = null;
		}
		if (canvasOpen) {
			setIsMounted(true);
			setIsExpanded(false);
			rafRef.current = requestAnimationFrame(() => setIsExpanded(true));
		} else {
			setIsExpanded(false);
			closeTimeoutRef.current = setTimeout(() => setIsMounted(false), 190);
		}
		return () => {
			if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
			if (rafRef.current) cancelAnimationFrame(rafRef.current);
		};
	}, [canvasOpen]);

	const clampWidth = useCallback(
		(rawWidth: number, containerWidth?: number): number => {
			const measured = containerRef.current?.getBoundingClientRect().width;
			const totalWidth =
				containerWidth ??
				(measured && measured > 0
					? measured
					: typeof window !== "undefined"
						? window.innerWidth
						: 1280);
			const minWidth = MIN_CANVAS_WIDTH;
			const maxAllowed = Math.max(
				minWidth,
				Math.min(
					totalWidth * MAX_CANVAS_RATIO,
					Math.max(minWidth, totalWidth - MIN_CHAT_WIDTH - 280),
				),
			);
			return Math.max(minWidth, Math.min(maxAllowed, rawWidth));
		},
		[],
	);

	const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
		event.preventDefault();
		setIsDragging(true);
	};

	useEffect(() => {
		if (!isDragging) return;
		const handlePointerMove = (event: PointerEvent) => {
			const container = containerRef.current;
			if (!container) return;
			const rect = container.getBoundingClientRect();
			const rawWidth = rect.right - event.clientX;
			setCanvasWidth(clampWidth(rawWidth, rect.width));
		};
		const handlePointerUp = () => {
			setIsDragging(false);
			persistWidth(canvasWidthRef.current);
		};
		const originalCursor = document.body.style.cursor;
		const originalUserSelect = document.body.style.userSelect;
		document.body.style.cursor = "col-resize";
		document.body.style.userSelect = "none";
		window.addEventListener("pointermove", handlePointerMove);
		window.addEventListener("pointerup", handlePointerUp);
		window.addEventListener("pointercancel", handlePointerUp);
		return () => {
			document.body.style.cursor = originalCursor;
			document.body.style.userSelect = originalUserSelect;
			window.removeEventListener("pointermove", handlePointerMove);
			window.removeEventListener("pointerup", handlePointerUp);
			window.removeEventListener("pointercancel", handlePointerUp);
		};
	}, [isDragging, clampWidth]);

	const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		if (event.key === "ArrowLeft") {
			event.preventDefault();
			const next = clampWidth(canvasWidth + KEYBOARD_STEP);
			setCanvasWidth(next);
			persistWidth(next);
		} else if (event.key === "ArrowRight") {
			event.preventDefault();
			const next = clampWidth(canvasWidth - KEYBOARD_STEP);
			setCanvasWidth(next);
			persistWidth(next);
		}
	};

	return (
		<div
			ref={containerRef}
			data-testid="codebase-workspace-shell"
			data-canvas-open={canvasOpen}
			className="relative flex h-full min-h-0 min-w-0 flex-1 overflow-hidden bg-onyx"
		>
			<div
				data-testid="codebase-explorer-pane"
				className="hidden h-full min-h-0 w-[280px] shrink-0 flex-col overflow-hidden border-r border-graphite bg-charcoal lg:flex"
			>
				{leftPane}
			</div>
			<div
				data-testid="codebase-chat-pane"
				className={`relative h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden ${
					canvasOpen ? "hidden md:flex" : "flex"
				}`}
			>
				{chatPane}
			</div>
			{isMounted ? (
				/* biome-ignore lint/a11y/useSemanticElements: interactive resizable splitter requires role="separator" */
				<div
					role="separator"
					aria-orientation="vertical"
					aria-label="Ubah ukuran panel canvas"
					aria-valuenow={Math.round(canvasWidth)}
					aria-valuemin={MIN_CANVAS_WIDTH}
					tabIndex={0}
					data-testid="codebase-workspace-separator"
					onPointerDown={handlePointerDown}
					onKeyDown={handleKeyDown}
					className={`relative z-30 hidden w-2 shrink-0 cursor-col-resize touch-none select-none items-center justify-center outline-none group md:flex ${
						isDragging
							? ""
							: isExpanded
								? "transition-opacity duration-200 ease-out"
								: "transition-opacity duration-150 ease-in"
					} ${isExpanded ? "opacity-100" : "opacity-0"}`}
				>
					<div className="h-full w-px bg-graphite transition-colors group-hover:bg-steel group-active:bg-indigo group-focus-visible:bg-indigo" />
				</div>
			) : null}
			<div
				data-testid="codebase-canvas-pane"
				style={
					isMounted
						? { width: isExpanded ? `${canvasWidth}px` : 0 }
						: { width: 0 }
				}
				className={`h-full min-h-0 min-w-0 shrink-0 overflow-hidden ${
					isMounted ? "flex w-full flex-col md:w-auto" : "hidden"
				} ${
					isDragging
						? ""
						: isExpanded
							? "transition-[width] duration-200 ease-out"
							: "transition-[width] duration-150 ease-in"
				}`}
			>
				<div
					style={{ width: `${canvasWidth}px`, maxWidth: "100vw" }}
					className={`flex h-full min-h-0 shrink-0 flex-col ${
						isDragging
							? ""
							: isExpanded
								? "transition-[transform,opacity] duration-200 ease-out"
								: "transition-[transform,opacity] duration-150 ease-in"
					} ${isExpanded ? "translate-x-0 opacity-100" : "translate-x-6 opacity-60"}`}
				>
					{canvasPane}
				</div>
			</div>
		</div>
	);
}
