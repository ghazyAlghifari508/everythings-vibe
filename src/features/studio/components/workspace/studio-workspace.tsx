"use client";

import { AlertCircleIcon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import { StudioCanvas } from "@/features/studio/components/canvas/studio-canvas";
import { StudioComposer } from "@/features/studio/components/composer/studio-composer";
import { StudioDesignPicker } from "@/features/studio/components/design-system/studio-design-picker";
import { StudioHeader } from "@/features/studio/components/workspace/studio-header";
import { useStudioWorkspace } from "@/features/studio/hooks/use-studio-workspace";
import type { StudioDetailLoaderData } from "@/features/studio/types/studio";

/**
 * Full-screen Studio workspace: a floating header over a full-bleed canvas with
 * a floating composer.
 *
 * The header is a sibling of the canvas section, never a descendant: header
 * clicks therefore cannot start a canvas pan or change the selection.
 */
export function StudioWorkspace({
	initialData,
}: {
	initialData: StudioDetailLoaderData;
}) {
	const workspace = useStudioWorkspace(initialData);

	return (
		<main className="relative flex h-dvh min-h-0 w-full flex-col overflow-hidden bg-charcoal text-snow">
			{/* The header floats above the dotted canvas instead of occupying a
			    full-width navbar band, so the canvas extends behind it. */}
			<StudioHeader
				title={workspace.project.title}
				duplicating={workspace.duplicating}
				exporting={workspace.exportingZip}
				deleting={workspace.deleting}
				canExport={workspace.readyFramesCount > 0}
				onDuplicate={() => void workspace.handleDuplicate()}
				onExport={() => void workspace.handleDownloadAllZip()}
				onDelete={workspace.handleDelete}
				designSystemControl={
					<StudioDesignPicker
						designMd={workspace.project.designMd}
						disabled={workspace.isProcessing || workspace.preferenceSaving}
						scrapeSources={initialData.scrapeSources}
						onApply={workspace.handleApplyDesignSystem}
					/>
				}
			/>

			{/* Main Fullscreen Canvas Workspace */}
			<div className="relative flex-1 w-full overflow-hidden">
				<StudioCanvas
					project={workspace.project}
					frames={workspace.frames}
					activeJob={workspace.activeJob}
					selectedFrameId={workspace.selectedFrameId}
					selectedFrameIds={workspace.selectedFrameIds}
					onSelectFrame={workspace.selectFrame}
					onSelectFrames={workspace.selectFrames}
					onRetryFrame={workspace.handleRetryFrame}
					onRetryPlanning={workspace.handleRetryPlanning}
					className="size-full"
				/>

				{/* Floating AI Prompt Composer */}
				<StudioComposer
					selectedFrames={workspace.selectedFrames}
					onRemoveFrame={workspace.removeSelectedFrame}
					onSubmit={workspace.handleComposerSubmit}
					loading={workspace.composerLoading}
					designSkillId={workspace.project.designSkillId}
					onDesignSkillChange={workspace.handleSkillChange}
					referenceLabel={workspace.storedReferenceLabel}
				/>
			</div>

			{/* Error banner sits below the floating header band so it never
			    collides with the header controls. */}
			{workspace.error && (
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
						className="ml-2 rounded px-1.5 py-0.5 text-xs font-medium text-crimson hover:bg-crimson/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-snow"
					>
						Tutup
					</button>
				</div>
			)}
		</main>
	);
}
