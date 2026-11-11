"use client";

import { AlertCircleIcon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import { StudioCanvas } from "@/features/studio/components/canvas/studio-canvas";
import { StudioChatPanel } from "@/features/studio/components/workspace/studio-chat-panel";
import { StudioHeader } from "@/features/studio/components/workspace/studio-header";
import { useStudioChatDraft } from "@/features/studio/hooks/use-studio-chat-draft";
import { useStudioChatPanel } from "@/features/studio/hooks/use-studio-chat-panel";
import { useStudioWorkspace } from "@/features/studio/hooks/use-studio-workspace";
import type { StudioDetailLoaderData } from "@/features/studio/types/studio";
import { useStudioElementEditing } from "../../hooks/use-studio-element-editing";
import { StudioElementPreview } from "./studio-element-preview";

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

	return (
		<main className="relative flex h-dvh min-h-0 w-full flex-col overflow-hidden bg-charcoal text-snow">
			<StudioHeader
				chatOpen={chat.open}
				onToggleChat={() => chat.setOpen(!chat.open)}
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

			<div className="relative flex min-h-0 flex-1 pt-[calc(3.5rem+env(safe-area-inset-top))]">
				<StudioChatPanel
					workspace={workspace}
					desktop={chat.desktop}
					open={chat.open}
					onOpenChange={chat.setOpen}
					elementEditing={elementEditing}
					draft={draft}
				/>
				<div className="relative min-w-0 flex-1 overflow-hidden">
					<StudioCanvas
						project={workspace.project}
						frames={workspace.frames}
						activeJob={workspace.activeJob}
						selectedFrameId={workspace.selectedFrameId}
						elementTarget={elementEditing.target}
						onSelectElement={(target) => {
							if (target) {
								elementEditing.selectTarget(target);
								chat.setOpen(true);
							} else elementEditing.clearTarget();
						}}
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
						onRefreshStatus={() => window.location.reload()}
						retryingFrameIds={workspace.retryingFrameIds}
						frameRetryErrors={workspace.frameRetryErrors}
						className="size-full"
					/>
				</div>
			</div>
			<StudioElementPreview
				editing={elementEditing}
				projectId={workspace.project.id}
				viewport={
					workspace.frames.find(
						(frame) => frame.id === elementEditing.preview?.frameId,
					)?.viewport ?? workspace.project.designMode
				}
			/>

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
