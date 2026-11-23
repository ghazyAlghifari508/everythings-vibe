"use client";
import { AlertCircleIcon } from "@hugeicons/core-free-icons";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { StudioCanvas } from "@/features/studio/components/canvas/studio-canvas";
import { StudioChatPanel } from "@/features/studio/components/workspace/studio-chat-panel";
import { StudioHeader } from "@/features/studio/components/workspace/studio-header";
import { useStudioChatDraft } from "@/features/studio/hooks/use-studio-chat-draft";
import { useStudioChatPanel } from "@/features/studio/hooks/use-studio-chat-panel";
import { useStudioFrameDevices } from "@/features/studio/hooks/use-studio-frame-devices";
import { useStudioWorkspace } from "@/features/studio/hooks/use-studio-workspace";
import type { StudioDetailLoaderData } from "@/features/studio/types/studio";
import type {
	StudioElementAction,
	StudioElementTarget,
} from "@/features/studio/types/studio-element";
import type { StudioPreviewTarget } from "@/features/studio/types/studio-preview-contract";
import { useStudioElementEditing } from "../../hooks/use-studio-element-editing";
import { StudioElementFeedback } from "./studio-element-feedback";

export function StudioWorkspace({
	initialData,
}: {
	initialData: StudioDetailLoaderData;
}) {
	const workspace = useStudioWorkspace(initialData);
	const chat = useStudioChatPanel();
	const elementEditing = useStudioElementEditing({
		projectId: workspace.project.id,
		userId: workspace.project.userId,
		frames: workspace.frames,
		selectedFrameIds: workspace.selectedFrameIds,
		setError: workspace.setError,
		syncProjectStatus: workspace.syncProjectStatus,
	});
	const draft = useStudioChatDraft(
		`studio-chat-draft:${workspace.project.userId}:${workspace.project.id}`,
	);
	const [selectedElement, setSelectedElement] =
		useState<StudioElementTarget | null>(null);
	const frameIdKey = workspace.frames.map((frame) => frame.id).join("|");
	// biome-ignore lint/correctness/useExhaustiveDependencies: frameIdKey is the stable identity of workspace.frames
	const frameIdList = useMemo(
		() => workspace.frames.map((frame) => frame.id),
		[frameIdKey],
	);
	const { frameDevices, setFrameDevice } = useStudioFrameDevices({
		userId: workspace.project.userId,
		projectId: workspace.project.id,
		frameIds: frameIdList,
	});
	const [frameRefreshTokens, setFrameRefreshTokens] = useState<
		Readonly<Record<string, number>>
	>({});
	const handleRefreshFrame = useCallback(
		(frameId: string) => {
			setFrameRefreshTokens((previous) => ({
				...previous,
				[frameId]: (previous[frameId] ?? 0) + 1,
			}));
			void workspace.syncProjectStatus();
		},
		[workspace.syncProjectStatus],
	);
	const navigate = useNavigate();
	// The viewer is a sibling route: leaving unmounts the canvas, and the camera,
	// frame selection and chat draft come back from their own persisted stores.
	const handleOpenPreview = useCallback(
		(target: StudioPreviewTarget) => {
			void navigate({
				to: "/design/$id/preview",
				params: { id: workspace.project.id },
				search: target.search,
			});
		},
		[navigate, workspace.project.id],
	);
	const { selectTarget, submit, busy: elementBusy } = elementEditing;
	const handleSelectElement = useCallback(
		(target: StudioElementTarget | null) => setSelectedElement(target),
		[],
	);
	const handleElementAction = useCallback(
		(
			action: StudioElementAction,
			target: StudioElementTarget,
			text?: string,
		) => {
			// Resolved inside the live surface where the indexed parent exists.
			if (action === "select-parent") return;
			// Clicking an element only opens the menu. Chat receives the target
			// when the user explicitly chooses "Edit with AI".
			if (action === "edit-ai") {
				selectTarget(target);
				chat.setOpen(true);
				return;
			}
			if (action === "edit-text") {
				void submit("Ganti teks elemen sesuai nilai yang dimasukkan.", {
					target,
					edit: { kind: "text", text: text ?? "" },
				});
				return;
			}
			void submit("Hapus elemen ini dari desain.", {
				target,
				edit: { kind: "remove" },
			});
		},
		[chat, selectTarget, submit],
	);
	return (
		<main className="relative flex h-dvh min-h-0 w-full flex-col overflow-hidden bg-charcoal text-snow">
			<StudioHeader
				title={workspace.project.title}
				duplicating={workspace.duplicating}
				exporting={workspace.exportingZip}
				renaming={workspace.renaming}
				canExport={workspace.readyFramesCount > 0}
				onDuplicate={() => void workspace.handleDuplicate()}
				onRename={workspace.handleRename}
				onExport={() => void workspace.handleDownloadAllZip()}
				onDelete={workspace.handleDelete}
			/>

			{/* The canvas fills the viewport behind the floating header and chat
			    panel; the panel never takes layout space from it. */}
			<div className="absolute inset-0 overflow-hidden">
				<StudioCanvas
					project={workspace.project}
					frames={workspace.frames}
					activeJob={workspace.activeJob}
					selectedFrameId={workspace.selectedFrameId}
					elementTarget={selectedElement}
					onSelectElement={handleSelectElement}
					onElementAction={handleElementAction}
					elementActionBusy={elementBusy}
					selectedFrameIds={workspace.selectedFrameIds}
					onSelectFrame={workspace.selectFrame}
					onSelectFrames={workspace.selectFrames}
					onRetryFrame={workspace.handleRetryFrame}
					onRetryPlanning={
						workspace.canRetryPlanning
							? workspace.handleRetryPlanning
							: undefined
					}
					retryingPlanning={workspace.retryingPlanning}
					onRefreshStatus={() => void workspace.syncProjectStatus()}
					retryingFrameIds={workspace.retryingFrameIds}
					frameRetryErrors={workspace.frameRetryErrors}
					frameDevices={frameDevices}
					onFrameDeviceChange={setFrameDevice}
					frameRefreshTokens={frameRefreshTokens}
					onRefreshFrame={handleRefreshFrame}
					onOpenPreview={handleOpenPreview}
					leftInsetPx={chat.insetPx}
					className="size-full"
				/>
			</div>
			<StudioChatPanel
				workspace={workspace}
				desktop={chat.desktop}
				open={chat.open}
				onOpenChange={chat.setOpen}
				elementEditing={elementEditing}
				draft={draft}
			/>
			<StudioElementFeedback editing={elementEditing} />

			{workspace.error && !chat.open && (
				<div
					role="alert"
					className="absolute left-1/2 z-40 flex w-[calc(100%-24px)] max-w-xl -translate-x-1/2 items-center gap-2 rounded-xl border border-crimson bg-obsidian px-4 py-2.5 text-sm text-crimson"
					style={{ top: "calc(4rem + env(safe-area-inset-top))" }}
				>
					<Icon icon={AlertCircleIcon} size={15} aria-hidden />
					<span>{workspace.error}</span>
					<button
						type="button"
						onClick={() => workspace.setError("")}
						aria-label="Tutup pesan error"
						className="ml-2 min-h-11 shrink-0 rounded px-2 text-xs font-medium text-crimson hover:bg-crimson/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-snow"
					>
						Tutup
					</button>
				</div>
			)}
		</main>
	);
}
