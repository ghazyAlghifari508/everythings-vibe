import { useEffect, useMemo, useRef, useState } from "react";
import {
	resolveStudioElementParent,
	resolveStudioElementTarget,
} from "../../services/studio-element-targeting";
import {
	STUDIO_INSPECTION_ATTR,
	type StudioElementAction,
	type StudioElementTarget,
} from "../../types/studio-element";
import {
	acceptStudioHoverMessage,
	acceptStudioInventoryMessage,
	acceptStudioRendererMessage,
	acceptStudioSelectionMessage,
} from "../../utils/studio-element-bridge";
import type {
	StudioLiveDocument,
	StudioLiveSlotsAction,
	StudioLiveSlotsState,
} from "../../utils/studio-live-slots";
import { StudioElementEditMenu } from "./studio-element-menu";

/** Only a small, visible group is revealed; the rest stay on normal hover. */
const STUDIO_REVEAL_REGIONS_MAX = 12;
type ElementBounds = { x: number; y: number; width: number; height: number };

interface StudioLiveSurfaceProps {
	state: StudioLiveSlotsState;
	dispatch: (action: StudioLiveSlotsAction) => void;
	title: string;
	width: number;
	height: number;
	/** Whether the active document is the visible layer. */
	visible: boolean;
	/** Pointer and keyboard reach the document only while inspecting. */
	interactive: boolean;
	suspended?: boolean;
	target?: StudioElementTarget | null;
	onSelect?: (target: StudioElementTarget | null) => void;
	/** Present only in the editor canvas; revision comparisons omit it. */
	onAction?: (
		action: StudioElementAction,
		target: StudioElementTarget,
		text?: string,
	) => void;
	actionBusy?: boolean;
	leftInsetPx?: number;
}

function LiveFrame({
	document,
	title,
	width,
	height,
	hidden,
	inert,
	frameRef,
}: {
	document: StudioLiveDocument;
	title: string;
	width: number;
	height: number;
	hidden: boolean;
	inert: boolean;
	frameRef: (node: HTMLIFrameElement | null) => void;
}) {
	return (
		<iframe
			ref={frameRef}
			title={title}
			data-live-channel={document.channel}
			sandbox="allow-scripts"
			referrerPolicy="no-referrer"
			srcDoc={document.html}
			inert={inert}
			tabIndex={inert ? -1 : undefined}
			aria-hidden={hidden || undefined}
			className="absolute top-0 left-0 border-0 bg-white"
			style={{
				width,
				height,
				visibility: hidden ? "hidden" : "visible",
				pointerEvents: inert ? "none" : "auto",
			}}
		/>
	);
}

function messageType(data: unknown): string | null {
	return typeof data === "object" &&
		data !== null &&
		"type" in data &&
		typeof data.type === "string"
		? data.type
		: null;
}

/**
 * Renders the prepared live documents. The visible document is never replaced
 * until its successor reports ready, so a revision change cannot flash a blank
 * iframe. Switching between canvas and inspect only flips interactivity on the
 * same mounted document; it never remounts it.
 *
 * Hover rectangles are written imperatively to one overlay node: a pointermove
 * cannot re-render the artboard, and the whole overlay lives inside the same
 * transformed container as the iframe, so zoom, pan and iframe scroll stay
 * aligned without any extra geometry math.
 */
export function StudioLiveSurface({
	state,
	dispatch,
	title,
	width,
	height,
	visible,
	interactive,
	suspended = false,
	target,
	onSelect,
	onAction,
	actionBusy = false,
	leftInsetPx = 0,
}: StudioLiveSurfaceProps) {
	const windows = useRef(new Map<string, Window | null>());
	const frames = useRef(new Map<string, HTMLIFrameElement>());
	const select = useRef(onSelect);
	select.current = onSelect;
	const activeTarget = useRef(target);
	activeTarget.current = target;
	const stateRef = useRef(state);
	stateRef.current = state;
	const hoverOutline = useRef<HTMLDivElement>(null);
	const wasInteractive = useRef(false);
	const [revealKey, setRevealKey] = useState(0);
	const [revealRegions, setRevealRegions] = useState<
		{ elementId: string; bounds: ElementBounds }[]
	>([]);
	const inventoryByElement = useRef(new Map<string, ElementBounds>());
	const [menuOpen, setMenuOpen] = useState(false);
	const active = state.active?.document ?? null;
	const incoming = state.incoming;
	const editorText = useMemo(() => {
		const html = active?.html;
		if (!target || !html) return null;
		const parsed = new DOMParser().parseFromString(html, "text/html");
		const node = parsed.querySelector(
			`[${STUDIO_INSPECTION_ATTR}=${JSON.stringify(target.elementId)}]`,
		);
		// A leaf with element children owns markup, icons or formatting: a text
		// patch would destroy them, so direct editing is not advertised.
		if (!node || node.children.length > 0) return null;
		return { value: node.textContent ?? "" };
	}, [active?.html, target]);

	useEffect(() => {
		function message(event: MessageEvent<unknown>) {
			const current = stateRef.current;
			const documents = [current.active?.document, current.incoming];
			const type = messageType(event.data);
			for (const document of documents) {
				if (!document) continue;
				const expected = {
					projectId: document.projectId,
					frameId: document.frameId,
					baseRevision: document.baseRevision,
					baseHash: document.baseHash,
					channel: document.channel,
					source:
						frames.current.get(document.channel)?.contentWindow ??
						windows.current.get(document.channel),
				};
				if (
					type === "studio:renderer:ready" ||
					type === "studio:renderer:metrics"
				) {
					const renderer = acceptStudioRendererMessage(event, expected);
					if (renderer) {
						dispatch({
							type: renderer.type,
							channel: document.channel,
							metrics: renderer.metrics,
							unresolvedImages: renderer.unresolvedImages,
						});
						return;
					}
					continue;
				}
				const isActiveDocument = document === current.active?.document;
				if (
					!isActiveDocument &&
					type !== "studio:element:hover" &&
					type !== "studio:element:hover-clear"
				)
					continue;
				if (
					type === "studio:element:select" ||
					type === "studio:element:bounds" ||
					type === "studio:element:clear"
				) {
					const result = acceptStudioSelectionMessage(event, {
						...expected,
						elements: document.elements,
					});
					if (
						result &&
						(result.type !== "studio:element:bounds" ||
							activeTarget.current?.elementId === result.target?.elementId)
					) {
						select.current?.(result.target);
						return;
					}
					continue;
				}
				if (
					type === "studio:element:hover" ||
					type === "studio:element:hover-clear"
				) {
					const hover = acceptStudioHoverMessage(event, {
						...expected,
						elements: document.elements,
					});
					const node = hoverOutline.current;
					if (!node) return;
					const identity =
						hover?.type === "hover"
							? resolveStudioElementTarget(hover.elementId, document.elements)
							: null;
					if (!hover || hover.type !== "hover" || !identity) {
						node.style.display = "none";
						return;
					}
					node.style.display = "block";
					node.style.left = `${hover.bounds.x}px`;
					node.style.top = `${hover.bounds.y}px`;
					node.style.width = `${hover.bounds.width}px`;
					node.style.height = `${hover.bounds.height}px`;
					return;
				}
				if (type === "studio:element:inventory") {
					const inventory = acceptStudioInventoryMessage(event, {
						...expected,
						elements: document.elements,
					});
					if (inventory) {
						inventoryByElement.current = new Map(
							inventory.regions.map((region) => [
								region.elementId,
								region.bounds,
							]),
						);
						setRevealRegions(
							inventory.regions.slice(0, STUDIO_REVEAL_REGIONS_MAX),
						);
						return;
					}
				}
			}
		}
		window.addEventListener("message", message);
		return () => window.removeEventListener("message", message);
	}, [dispatch]);

	useEffect(() => {
		if (interactive && !wasInteractive.current) setRevealKey((key) => key + 1);
		wasInteractive.current = interactive;
	}, [interactive]);

	const lastChannel = useRef(active?.channel);
	useEffect(() => {
		if (lastChannel.current === active?.channel) return;
		lastChannel.current = active?.channel;
		setRevealRegions([]);
		if (hoverOutline.current) hoverOutline.current.style.display = "none";
	}, [active?.channel]);

	const targetKey = target
		? `${target.frameId}:${target.elementId}:${target.baseRevision}`
		: null;
	useEffect(() => {
		setMenuOpen(targetKey !== null);
	}, [targetKey]);

	const canSelectParent = Boolean(
		active &&
			target &&
			resolveStudioElementParent(target.elementId, active.elements),
	);
	function handleAction(
		action: StudioElementAction,
		current: StudioElementTarget,
		text?: string,
	) {
		if (action === "select-parent") {
			const parent = active
				? resolveStudioElementParent(current.elementId, active.elements)
				: null;
			if (parent)
				select.current?.({
					...parent,
					bounds:
						inventoryByElement.current.get(parent.elementId) ?? current.bounds,
				});
			return;
		}
		onAction?.(action, current, text);
	}
	function track(document: StudioLiveDocument) {
		return (node: HTMLIFrameElement | null) => {
			if (node) {
				frames.current.set(document.channel, node);
				windows.current.set(document.channel, node.contentWindow);
			} else {
				frames.current.delete(document.channel);
				windows.current.delete(document.channel);
			}
		};
	}

	return (
		<div
			className="absolute inset-0 overflow-hidden"
			style={{
				visibility: visible ? "visible" : "hidden",
				pointerEvents: interactive ? "auto" : "none",
			}}
			onPointerDown={(event) => interactive && event.stopPropagation()}
			onWheel={(event) => interactive && event.stopPropagation()}
		>
			{active ? (
				<LiveFrame
					key={active.channel}
					document={active}
					title={title}
					width={width}
					height={height}
					hidden={!visible}
					inert={!visible || !interactive || suspended}
					frameRef={track(active)}
				/>
			) : null}
			{incoming ? (
				<LiveFrame
					key={incoming.channel}
					document={incoming}
					title={`${title} (menyiapkan)`}
					width={width}
					height={height}
					hidden
					inert
					frameRef={track(incoming)}
				/>
			) : null}
			{interactive && revealRegions.length > 0 ? (
				<div
					key={revealKey}
					aria-hidden
					data-ev-editor-overlay
					className="pointer-events-none absolute inset-0 z-10"
				>
					{revealRegions.map((region, index) => (
						<div
							key={region.elementId}
							data-ev-editor-overlay
							className="studio-element-reveal absolute border border-blue-500/70"
							style={{
								left: region.bounds.x,
								top: region.bounds.y,
								width: region.bounds.width,
								height: region.bounds.height,
								animationDelay: `${Math.min(index, STUDIO_REVEAL_REGIONS_MAX) * 24}ms`,
							}}
						/>
					))}
				</div>
			) : null}
			<div
				ref={hoverOutline}
				aria-hidden
				data-ev-editor-overlay
				className="pointer-events-none absolute z-20 hidden border-2 border-blue-500/90"
			/>
			{interactive &&
			active &&
			target &&
			state.active?.document.baseHash === target.baseHash ? (
				<div
					aria-hidden
					data-ev-editor-overlay
					className="pointer-events-none absolute z-10 border-2 border-blue-600"
					style={{
						left: target.bounds.x,
						top: target.bounds.y,
						width: target.bounds.width,
						height: target.bounds.height,
					}}
				/>
			) : null}
			{interactive &&
			active &&
			target &&
			onAction &&
			state.active?.document.baseHash === target.baseHash ? (
				<StudioElementEditMenu
					key={`${target.frameId}:${target.elementId}:${target.baseRevision}`}
					target={target}
					open={menuOpen}
					onOpenChange={setMenuOpen}
					onAction={handleAction}
					canSelectParent={canSelectParent}
					textValue={editorText?.value}
					textEditable={editorText !== null}
					busy={actionBusy}
					leftInsetPx={leftInsetPx}
				/>
			) : null}
		</div>
	);
}
