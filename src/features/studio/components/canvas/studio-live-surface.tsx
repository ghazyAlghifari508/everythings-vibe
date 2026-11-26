import { useEffect, useRef, useState } from "react";
import type {
	StudioElementAction,
	StudioElementTarget,
} from "../../types/studio-element";
import {
	acceptStudioHoverMessage,
	acceptStudioRendererMessage,
	acceptStudioSelectionMessage,
	acceptStudioTextMessage,
} from "../../utils/studio-element-bridge";
import type {
	StudioLiveDocument,
	StudioLiveSlotsAction,
	StudioLiveSlotsState,
} from "../../utils/studio-live-slots";
import { clampStudioRectToArtboard } from "../../utils/studio-renderer-geometry";
import { StudioElementEditMenu } from "./studio-element-menu";

interface InlineSession {
	document: StudioLiveDocument;
	source: Window;
	target: StudioElementTarget;
	id: string;
	started: boolean;
}

function sendText(
	session: InlineSession,
	action: "text-start" | "text-cancel",
) {
	const { projectId, frameId, baseRevision, baseHash, channel } =
		session.document;
	// This iframe has an opaque origin; the receiver authenticates the parent and channel.
	session.source.postMessage(
		{
			type: `studio:element:${action}`,
			projectId,
			frameId,
			baseRevision,
			baseHash,
			channel,
			elementId: session.target.elementId,
			session: session.id,
		},
		"*",
	);
}

interface StudioLiveSurfaceProps {
	state: StudioLiveSlotsState;
	dispatch: (action: StudioLiveSlotsAction) => void;
	title: string;
	width: number;
	height: number;
	visible: boolean;
	interactive: boolean;
	suspended?: boolean;
	target?: StudioElementTarget | null;
	onSelect?: (target: StudioElementTarget | null, frameId: string) => void;
	onAction?: (
		action: StudioElementAction,
		target: StudioElementTarget,
		text?: string,
	) => void;
	actionBusy?: boolean;
	leftInsetPx?: number;
	viewport?: HTMLElement | null;
	zoom?: number;
	onError?: (message: string) => void;
}

function messageType(data: unknown): string | null {
	return typeof data === "object" &&
		data !== null &&
		"type" in data &&
		typeof data.type === "string"
		? data.type
		: null;
}

/** Keeps showing the committed predecessor until its replacement is ready. */
export function StudioLiveSurface(props: StudioLiveSurfaceProps) {
	const {
		state,
		dispatch,
		title,
		width,
		height,
		visible,
		interactive,
		suspended,
		target,
		onSelect,
		onAction,
		actionBusy,
		leftInsetPx,
		viewport,
		zoom = 1,
	} = props;
	const active = state.active?.document ?? null;
	const canInspect = Boolean(visible && active && interactive && !suspended);
	const frames = useRef(new Map<string, HTMLIFrameElement>());
	const outline = useRef<HTMLDivElement>(null);
	const session = useRef<InlineSession | null>(null);
	const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	const [editing, setEditing] = useState(false);
	const [menuOpen, setMenuOpen] = useState(false);
	const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
	const current = useRef({ ...props, canInspect });
	current.current = { ...props, canInspect };

	useEffect(() => {
		function message(event: MessageEvent<unknown>) {
			const live = current.current;
			const type = messageType(event.data);
			const active = live.state.active?.document;
			const expected = (document: StudioLiveDocument) => ({
				...document,
				source: frames.current.get(document.channel)?.contentWindow,
			});
			if (
				type === "studio:renderer:ready" ||
				type === "studio:renderer:metrics"
			) {
				for (const document of [active, live.state.incoming]) {
					if (!document) continue;
					const result = acceptStudioRendererMessage(event, expected(document));
					if (!result) continue;
					dispatch({
						type: result.type,
						channel: document.channel,
						metrics: result.metrics,
						unresolvedImages: result.unresolvedImages,
					});
					break;
				}
				return;
			}
			if (!live.canInspect || !active || !type?.startsWith("studio:element:"))
				return;
			const sender = expected(active);
			if (type.startsWith("studio:element:text-")) {
				const edit = session.current;
				if (edit?.document !== active) return;
				const result = acceptStudioTextMessage(event, {
					...sender,
					elementId: edit.target.elementId,
					session: edit.id,
				});
				if (!result) return;
				clearTimeout(timer.current);
				if (result.type === "studio:element:text-started") {
					edit.started = true;
					return;
				}
				session.current = null;
				setEditing(false);
				if (result.type === "studio:element:text-commit" && edit.started) {
					live.onSelect?.(null, active.frameId);
					live.onAction?.("edit-text", edit.target, result.text);
				} else if (
					result.type === "studio:element:text-end" &&
					result.reason !== "closed"
				) {
					live.onError?.(
						result.reason === "too-long"
							? "Teks melebihi batas 8.000 karakter."
							: "Teks tidak tersedia untuk diedit. Pilih ulang elemennya.",
					);
				}
				return;
			}
			if (
				type === "studio:element:hover" ||
				type === "studio:element:hover-clear"
			) {
				const hover = acceptStudioHoverMessage(event, sender);
				const node = outline.current;
				if (!hover || !node) return;
				const rect =
					!session.current && hover.type === "hover"
						? clampStudioRectToArtboard(hover.bounds, live)
						: null;
				node.style.display = rect ? "block" : "none";
				if (rect)
					Object.assign(node.style, {
						left: `${rect.x}px`,
						top: `${rect.y}px`,
						width: `${rect.width}px`,
						height: `${rect.height}px`,
					});
				return;
			}
			const selection = acceptStudioSelectionMessage(event, sender);
			if (!selection) return;
			if (selection.type === "studio:element:select") {
				setSelectedChannel(active.channel);
				setMenuOpen(true);
			} else if (selection.type === "studio:element:bounds") {
				if (
					live.target?.frameId !== active.frameId ||
					live.target.elementId !== selection.target?.elementId
				)
					return;
			} else setMenuOpen(false);
			live.onSelect?.(selection.target, active.frameId);
		}
		window.addEventListener("message", message);
		return () => window.removeEventListener("message", message);
	}, [dispatch]);

	useEffect(() => {
		setEditing(false);
		if (outline.current) outline.current.style.display = "none";
		if (!canInspect || !active) return;
		return () => {
			clearTimeout(timer.current);
			if (session.current) sendText(session.current, "text-cancel");
			session.current = null;
		};
	}, [active, canInspect]);

	function handleAction(
		action: StudioElementAction,
		selected: StudioElementTarget,
	) {
		if (!active || !canInspect || actionBusy) return;
		if (action !== "edit-text") {
			if (action === "delete") onSelect?.(null, selected.frameId);
			onAction?.(action, selected);
			return;
		}
		const source = frames.current.get(active.channel)?.contentWindow;
		if (!source || !selected.textEditable || session.current) return;
		const edit = {
			document: active,
			source,
			target: selected,
			id: crypto.randomUUID(),
			started: false,
		};
		session.current = edit;
		setEditing(true);
		if (outline.current) outline.current.style.display = "none";
		sendText(edit, "text-start");
		timer.current = setTimeout(() => {
			if (session.current !== edit || edit.started) return;
			sendText(edit, "text-cancel");
			session.current = null;
			setEditing(false);
			current.current.onError?.(
				"Editor teks tidak merespons. Pilih ulang elemennya.",
			);
		}, 1500);
	}

	const region =
		canInspect &&
		active &&
		selectedChannel === active.channel &&
		target &&
		target.baseHash === active.baseHash &&
		target.baseRevision === active.baseRevision &&
		target.frameId === active.frameId &&
		target.projectId === active.projectId
			? clampStudioRectToArtboard(target.bounds, { width, height })
			: null;
	return (
		<div
			data-testid="studio-live-surface"
			className="absolute inset-0 overflow-hidden"
			style={{
				visibility: visible ? "visible" : "hidden",
				pointerEvents: canInspect ? "auto" : "none",
			}}
			onPointerDown={(event) => canInspect && event.stopPropagation()}
			onWheel={(event) => canInspect && event.stopPropagation()}
		>
			{[active, state.incoming].map((document) => {
				if (!document) return null;
				const isActive = document === active;
				const inert = !isActive || !canInspect;
				return (
					<iframe
						key={document.channel}
						ref={(node) => {
							if (node) frames.current.set(document.channel, node);
							else frames.current.delete(document.channel);
						}}
						title={isActive ? title : `${title} (menyiapkan)`}
						data-testid="studio-live-document"
						data-live-document-key={document.keyId}
						data-live-channel={document.channel}
						data-studio-passive={inert || undefined}
						sandbox="allow-scripts"
						referrerPolicy="no-referrer"
						srcDoc={document.html}
						inert={inert}
						tabIndex={inert ? -1 : undefined}
						aria-hidden={inert || undefined}
						className="absolute top-0 left-0 border-0 bg-white"
						style={{
							width,
							height,
							visibility: isActive && visible ? "visible" : "hidden",
							pointerEvents: inert ? "none" : "auto",
						}}
					/>
				);
			})}
			<div
				key={active?.channel}
				ref={outline}
				aria-hidden
				data-ev-editor-overlay
				className="pointer-events-none absolute z-10 hidden border-solid border-blue-500/90"
				style={{
					borderWidth: 1 / zoom,
					visibility: canInspect ? "visible" : "hidden",
				}}
			/>
			{region && target && !editing ? (
				<>
					<div
						aria-hidden
						data-ev-editor-overlay
						className="pointer-events-none absolute z-10 border-solid border-blue-600"
						style={{
							left: region.x,
							top: region.y,
							width: region.width,
							height: region.height,
							borderWidth: 2 / zoom,
						}}
					/>
					{onAction ? (
						<StudioElementEditMenu
							key={target.elementId}
							target={target}
							open={menuOpen}
							onOpenChange={setMenuOpen}
							onAction={handleAction}
							busy={actionBusy}
							leftInsetPx={leftInsetPx}
							viewport={viewport}
							zoom={zoom}
							width={width}
							height={height}
						/>
					) : null}
				</>
			) : null}
		</div>
	);
}
