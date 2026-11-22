import { useEffect, useRef } from "react";
import type { StudioElementTarget } from "../../types/studio-element";
import {
	acceptStudioRendererMessage,
	acceptStudioSelectionMessage,
} from "../../utils/studio-element-bridge";
import type {
	StudioLiveDocument,
	StudioLiveSlotsAction,
	StudioLiveSlotsState,
} from "../../utils/studio-live-slots";

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

/**
 * Renders the prepared live documents. The visible document is never replaced
 * until its successor reports ready, so a revision change cannot flash a blank
 * iframe. Switching between canvas and inspect only flips interactivity on the
 * same mounted document; it never remounts it.
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
}: StudioLiveSurfaceProps) {
	const windows = useRef(new Map<string, Window | null>());
	const select = useRef(onSelect);
	select.current = onSelect;
	const activeTarget = useRef(target);
	activeTarget.current = target;
	const stateRef = useRef(state);
	stateRef.current = state;
	const active = state.active?.document ?? null;
	const incoming = state.incoming;

	useEffect(() => {
		function message(event: MessageEvent<unknown>) {
			const current = stateRef.current;
			const documents = [current.active?.document, current.incoming];
			for (const document of documents) {
				if (!document) continue;
				const expected = {
					projectId: document.projectId,
					frameId: document.frameId,
					baseRevision: document.baseRevision,
					baseHash: document.baseHash,
					channel: document.channel,
					source: windows.current.get(document.channel),
				};
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
				if (document !== current.active?.document) continue;
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
			}
		}
		window.addEventListener("message", message);
		return () => window.removeEventListener("message", message);
	}, [dispatch]);

	function track(document: StudioLiveDocument) {
		return (node: HTMLIFrameElement | null) => {
			if (node) windows.current.set(document.channel, node.contentWindow);
			else windows.current.delete(document.channel);
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
			{interactive &&
			active &&
			target &&
			state.active?.document.baseHash === target.baseHash ? (
				<div
					aria-hidden
					data-ev-editor-overlay
					className="pointer-events-none absolute border-2 border-blue-600"
					style={{
						left: target.bounds.x,
						top: target.bounds.y,
						width: target.bounds.width,
						height: target.bounds.height,
					}}
				/>
			) : null}
		</div>
	);
}
