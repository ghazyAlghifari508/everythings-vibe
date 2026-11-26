"use client";
import { AlertCircleIcon } from "@hugeicons/core-free-icons";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { CreditExhaustedModal } from "@/features/billing/components/credit-exhausted-modal";
import { StudioCanvas } from "@/features/studio/components/canvas/studio-canvas";
import { StudioChatPanel } from "@/features/studio/components/workspace/studio-chat-panel";
import { StudioHeader } from "@/features/studio/components/workspace/studio-header";
import { useStudioChatDraft } from "@/features/studio/hooks/use-studio-chat-draft";
import { useStudioChatPanel } from "@/features/studio/hooks/use-studio-chat-panel";
import { useStudioCreditQuote } from "@/features/studio/hooks/use-studio-credit-quote";
import { useStudioFrameDevices } from "@/features/studio/hooks/use-studio-frame-devices";
import { useStudioWorkspace } from "@/features/studio/hooks/use-studio-workspace";
import type { StudioQuoteScope } from "@/features/studio/services/studio-credit-policy";
import type { StudioDetailLoaderData } from "@/features/studio/types/studio";
import type {
	StudioElementAction,
	StudioElementTarget,
} from "@/features/studio/types/studio-element";
import type { StudioPreviewTarget } from "@/features/studio/types/studio-preview-contract";
import { useStudioElementEditing } from "../../hooks/use-studio-element-editing";

export function StudioWorkspace({
	initialData,
}: {
	initialData: StudioDetailLoaderData;
}) {
	const workspace = useStudioWorkspace(initialData);
	const quoteScope = useMemo<StudioQuoteScope>(
		() => ({
			operation: "studio.revise",
			frames: Math.max(1, workspace.selectedFrames.length),
			promptChars: 0,
			designMdChars: workspace.project.designMd?.length ?? 0,
		}),
		[workspace.selectedFrames.length, workspace.project.designMd],
	);
	const quoteView = useStudioCreditQuote(quoteScope);

	const chat = useStudioChatPanel();
	const elementEditing = useStudioElementEditing({
		projectId: workspace.project.id,
		userId: workspace.project.userId,
		frames: workspace.frames,
		selectedFrameIds: workspace.selectedFrameIds,
		setError: workspace.setError,
		syncProjectStatus: workspace.syncProjectStatus,
		publishCommitted: workspace.publishCommitted,
	});
	const draft = useStudioChatDraft(
		`studio-chat-draft:${workspace.project.userId}:${workspace.project.id}`,
	);
	const [selectedElement, setSelectedElement] =
		useState<StudioElementTarget | null>(null);
	const currentElement =
		selectedElement &&
		workspace.frames.some(
			(frame) =>
				frame.id === selectedElement.frameId &&
				frame.revision === selectedElement.baseRevision,
		)
			? selectedElement
			: null;
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
			const previousFrame = workspace.frames.find(
				(frame) => frame.id === frameId,
			);
			void workspace.syncProjectStatus(({ frames }) => {
				const currentFrame = frames.find((frame) => frame.id === frameId);
				// A new renderer key already loads new committed HTML. Only force a
				// refetch when that document did not change during the status read.
				if (
					!currentFrame ||
					currentFrame.revision !== previousFrame?.revision ||
					currentFrame.htmlCode !== previousFrame.htmlCode
				)
					return;
				setFrameRefreshTokens((previous) => ({
					...previous,
					[frameId]: (previous[frameId] ?? 0) + 1,
				}));
			});
		},
		[workspace.frames, workspace.syncProjectStatus],
	);
	const [focusRequest, setFocusRequest] = useState<{
		frameId: string;
		nonce: number;
	} | null>(null);
	const { selectFrame, frames: workspaceFrames } = workspace;
	const { desktop: chatDesktop, setOpen: setChatOpen } = chat;
	// A result row may only open a frame of this project that still exists.
	const handleOpenResultFrame = useCallback(
		(frameId: string) => {
			if (!workspaceFrames.some((frame) => frame.id === frameId)) return;
			selectFrame(frameId);
			// The mobile drawer is modal and would cover the frame it opens.
			if (!chatDesktop) setChatOpen(false);
			setFocusRequest((previous) => ({
				frameId,
				nonce: (previous?.nonce ?? 0) + 1,
			}));
		},
		[workspaceFrames, selectFrame, chatDesktop, setChatOpen],
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
		(target: StudioElementTarget | null, frameId?: string) => {
			if (target && workspace.selectedFrameId !== target.frameId)
				workspace.selectFrame(target.frameId);
			setSelectedElement(
				(current) =>
					target ?? (!frameId || current?.frameId === frameId ? null : current),
			);
		},
		[workspace.selectedFrameId, workspace.selectFrame],
	);
	const handleElementAction = useCallback(
		(
			action: StudioElementAction,
			target: StudioElementTarget,
			text?: string,
		) => {
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
				elementEditing={elementEditing}
			/>

			{workspace.error && !chat.open && (
				<div
					role="alert"
					className="z-40 flex shrink-0 items-center gap-2 border-y border-crimson bg-obsidian px-3 text-sm text-crimson"
				>
					<Icon icon={AlertCircleIcon} size={15} aria-hidden />
					<span className="min-w-0 flex-1 break-words">{workspace.error}</span>
					<button
						type="button"
						onClick={() => workspace.setError("")}
						aria-label="Tutup pesan error"
						className="min-h-11 shrink-0 rounded px-2 text-xs font-medium focus-visible:outline-2 focus-visible:outline-snow"
					>
						Tutup
					</button>
				</div>
			)}
			<div className="relative min-h-0 flex-1 overflow-hidden">
				<StudioCanvas
					project={workspace.project}
					frames={workspace.frames}
					activeJob={workspace.activeJob}
					selectedFrameId={workspace.selectedFrameId}
					elementTarget={currentElement}
					onSelectElement={handleSelectElement}
					onElementAction={handleElementAction}
					elementActionBusy={elementBusy}
					onElementError={workspace.setError}
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
					focusRequest={focusRequest}
					leftInsetPx={chat.insetPx}
					className="size-full"
				/>
				<StudioChatPanel
					workspace={workspace}
					desktop={chat.desktop}
					open={chat.open}
					onOpenChange={chat.setOpen}
					elementEditing={elementEditing}
					onOpenFrame={handleOpenResultFrame}
					draft={draft}
					creditLabel={quoteView?.label ?? null}
				/>
			</div>
			<CreditExhaustedModal
				isOpen={workspace.creditsExhausted !== null}
				onClose={() => workspace.setCreditsExhausted(null)}
				errorMessage={workspace.creditsExhausted ?? ""}
				projectId={workspace.project.id}
				stage="prd"
				requiredCredits={quoteView?.requiredCredits ?? undefined}
				availableCredits={quoteView?.availableCredits}
			/>
		</main>
	);
}
