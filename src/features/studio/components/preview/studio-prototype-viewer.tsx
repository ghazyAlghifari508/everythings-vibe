import { useNavigate } from "@tanstack/react-router";
import {
	useCallback,
	useEffect,
	useMemo,
	useReducer,
	useRef,
	useState,
} from "react";
import { useStudioPrototypeDocument } from "@/features/studio/hooks/use-studio-prototype-document";
import type {
	StudioPrototypeLoaderData,
	StudioPrototypeMessage,
	StudioPrototypeScreen,
} from "@/features/studio/types/studio-prototype";
import {
	STUDIO_DEVICES,
	type StudioDevice,
	studioNativeDevice,
} from "@/features/studio/types/studio-renderer";
import {
	createStudioPrototypeSession,
	reduceStudioPrototypeSession,
} from "@/features/studio/utils/studio-prototype-session";
import { computeStudioPrototypeStage } from "@/features/studio/utils/studio-prototype-stage";
import { StudioDeviceFrame } from "./studio-device-frame";
import { StudioPrototypeFrame } from "./studio-prototype-frame";
import {
	StudioPrototypeDrawer,
	StudioPrototypeSidebar,
} from "./studio-prototype-pages";
import { StudioPrototypeTopbar } from "./studio-prototype-topbar";

export interface StudioPrototypeViewerProps {
	data: StudioPrototypeLoaderData;
	initialFrameId?: string;
	initialDevice?: StudioDevice;
	/** Already validated against this project by the route. */
	returnTo: string;
}

function useElementSize<T extends HTMLElement>() {
	const ref = useRef<T>(null);
	const [size, setSize] = useState({ width: 0, height: 0 });
	useEffect(() => {
		const node = ref.current;
		if (!node) return;
		const observer = new ResizeObserver(([entry]) => {
			if (!entry) return;
			setSize({
				width: Math.floor(entry.contentRect.width),
				height: Math.floor(entry.contentRect.height),
			});
		});
		observer.observe(node);
		return () => observer.disconnect();
	}, []);
	return { ref, size };
}

export function StudioPrototypeViewer({
	data,
	initialFrameId,
	initialDevice,
	returnTo,
}: StudioPrototypeViewerProps) {
	const navigate = useNavigate();
	const [removed, setRemoved] = useState<ReadonlySet<string>>(
		() => new Set<string>(),
	);
	const [liveScreens, setLiveScreens] = useState<StudioPrototypeScreen[]>(
		data.screens,
	);
	const screens = useMemo(
		() => liveScreens.filter((screen) => !removed.has(screen.id)),
		[liveScreens, removed],
	);
	const screensRef = useRef(screens);
	screensRef.current = screens;
	const [session, dispatch] = useReducer(
		(
			state: ReturnType<typeof createStudioPrototypeSession>,
			action: Parameters<typeof reduceStudioPrototypeSession>[1],
		) => reduceStudioPrototypeSession(state, action, screensRef.current),
		undefined,
		() => createStudioPrototypeSession(data.screens, initialFrameId),
	);
	const current = screens.find((screen) => screen.id === session.currentId);
	const [device, setDevice] = useState<StudioDevice>(() => {
		if (initialDevice && STUDIO_DEVICES.includes(initialDevice))
			return initialDevice;
		const native = session.currentId
			? data.viewports[session.currentId]
			: undefined;
		return studioNativeDevice(native ?? "web");
	});
	const [drawerOpen, setDrawerOpen] = useState(false);
	const { document, status, markReady, retry } = useStudioPrototypeDocument({
		projectId: data.projectId,
		frameId: session.currentId,
		refresh: session.refresh,
	});
	const { ref: stageRef, size } = useElementSize<HTMLDivElement>();

	// A freshly loaded document is the source of truth for the page list, so
	// screens added elsewhere appear and deleted ones disappear on load/refresh.
	useEffect(() => {
		if (!document) return;
		setLiveScreens(document.screens);
		setRemoved(new Set());
		dispatch({ type: "sync", screens: document.screens });
	}, [document]);

	useEffect(() => {
		if (status.phase !== "failed" || !status.missing || !session.currentId)
			return;
		const gone = session.currentId;
		setRemoved((previous) => new Set(previous).add(gone));
		dispatch({
			type: "sync",
			screens: screensRef.current.filter((screen) => screen.id !== gone),
		});
	}, [status, session.currentId]);

	// Keep the URL in step with the sidebar so reload and sharing land on the
	// same page and device. Replace: viewer history is the prototype's own.
	const currentId = session.currentId;
	useEffect(() => {
		if (!currentId) return;
		void navigate({
			to: "/design/$id/preview",
			params: { id: data.projectId },
			search: { frameId: currentId, device, returnTo },
			replace: true,
		});
	}, [currentId, device, data.projectId, returnTo, navigate]);

	const handleMessage = useCallback(
		(message: StudioPrototypeMessage) => {
			if (message.type === "proto:ready") markReady();
			else if (message.type === "proto:navigate")
				dispatch({
					type: "go",
					screenId: message.target.screenId,
					requested: message.target.requested,
				});
			else if (message.type === "proto:back") dispatch({ type: "back" });
			else dispatch({ type: "state", state: message.state });
		},
		[markReady],
	);

	const goBack = useCallback(() => {
		void navigate({
			to: "/design/$id",
			params: { id: data.projectId },
		});
	}, [navigate, data.projectId]);

	const stage = computeStudioPrototypeStage(device, {
		width: size.width,
		height: size.height,
	});
	const note = useMemo(() => {
		if (!document) return null;
		if (document.interactionCount === 0)
			return "Layar ini belum memiliki interaksi prototipe. Konten ditampilkan apa adanya; kontrol statis tidak aktif.";
		if (document.inertLinks > 0)
			return `${document.inertLinks} tautan di layar ini belum terhubung ke halaman prototipe.`;
		return null;
	}, [document]);
	const message = session.notice ?? note;
	const loading = status.phase === "loading" || status.phase === "loaded";

	return (
		<main className="flex h-dvh min-h-0 w-full flex-col overflow-hidden bg-charcoal text-snow">
			<StudioPrototypeTopbar
				pageName={current?.name ?? null}
				route={current?.route ?? null}
				device={device}
				onDeviceChange={setDevice}
				onBack={goBack}
				onRefresh={() => dispatch({ type: "reset" })}
				onOpenPages={() => setDrawerOpen(true)}
				pageCount={screens.length}
			/>
			<div className="flex min-h-0 flex-1">
				<section
					aria-label="Pratinjau prototipe"
					className="relative flex min-h-0 min-w-0 flex-1 flex-col"
				>
					<div
						ref={stageRef}
						className="flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-onyx"
					>
						{session.currentId === null ? (
							<p className="max-w-sm px-6 text-center text-sm text-fog">
								Proyek ini belum memiliki halaman yang selesai dibuat.
							</p>
						) : document ? (
							<StudioDeviceFrame
								device={device}
								stage={stage}
								address={`app.example${current?.route ?? ""}`}
							>
								<StudioPrototypeFrame
									document={document}
									title={current?.name ?? "Prototipe"}
									state={session.state}
									onMessage={handleMessage}
								/>
							</StudioDeviceFrame>
						) : null}
					</div>
					{loading ? (
						<output className="absolute top-3 left-1/2 -translate-x-1/2 rounded-md border border-graphite bg-obsidian px-3 py-1.5 text-xs text-fog">
							Menyiapkan prototipe.
						</output>
					) : null}
					{status.phase === "failed" ? (
						<div
							role="alert"
							className="absolute top-3 left-1/2 flex max-w-[90%] -translate-x-1/2 items-center gap-3 rounded-md border border-crimson bg-obsidian px-3 py-2 text-sm text-crimson"
						>
							<span>{status.message}</span>
							{status.missing ? null : (
								<button
									type="button"
									onClick={retry}
									className="min-h-11 rounded px-2 text-xs font-medium hover:bg-crimson/10 focus-visible:outline-2 focus-visible:outline-snow"
								>
									Coba lagi
								</button>
							)}
						</div>
					) : null}
					{message ? (
						<output className="border-t border-graphite bg-obsidian px-4 py-2 text-xs text-fog">
							{message}
						</output>
					) : null}
				</section>
				<StudioPrototypeSidebar
					screens={screens}
					currentId={session.currentId}
					onSelect={(screenId) => dispatch({ type: "select", screenId })}
				/>
			</div>
			<StudioPrototypeDrawer
				open={drawerOpen}
				onOpenChange={setDrawerOpen}
				screens={screens}
				currentId={session.currentId}
				onSelect={(screenId) => dispatch({ type: "select", screenId })}
			/>
		</main>
	);
}
