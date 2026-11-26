import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import type { StudioFrameRow, StudioMessageRow } from "@/db/schema";
import type { StudioComposerSubmitResult } from "@/features/studio/components/composer/studio-composer";
import { useStudioPlanningRetry } from "@/features/studio/hooks/use-studio-planning-retry";
import { useStudioStatus } from "@/features/studio/hooks/use-studio-status";
import { useStudioWorkspaceActions } from "@/features/studio/hooks/use-studio-workspace-actions";
import {
	readStudioChatStorage,
	writeStudioChatStorage,
} from "@/features/studio/services/studio-chat-storage";
import { extractDesignSystemTokens } from "@/features/studio/services/studio-design-tokens";
import { STUDIO_DESIGN_PRESETS } from "@/features/studio/services/studio-presets";
import type { StudioDetailLoaderData } from "@/features/studio/types/studio";
import type {
	StudioStatus,
	StudioVisibleJob,
	StudioVisibleProject,
} from "@/features/studio/types/studio-status";
import { pruneStudioFrameSelection } from "@/features/studio/utils/studio-frame-selection";
import { deriveStudioLifecycle } from "@/features/studio/utils/studio-lifecycle";

const selectedFrameIdsSchema = z.array(z.string().min(1));

export interface StudioWorkspaceState {
	project: StudioVisibleProject;
	frames: StudioFrameRow[];
	activeJob: StudioVisibleJob | null;
	messages: StudioMessageRow[];
	selectedFrameId: string | null;
	selectedFrameIds: string[];
	selectedFrames: StudioFrameRow[];
	composerLoading: boolean;
	exportingZip: boolean;
	duplicating: boolean;
	renaming: boolean;
	/** Frames with a retry request in flight; their retry control is disabled. */
	retryingPlanning: boolean;
	canRetryPlanning: boolean;
	retryingFrameIds: string[];
	/** Per-frame retry rejections, rendered inside that frame only. */
	frameRetryErrors: Record<string, string>;
	creditsExhausted: string | null;
	setCreditsExhausted: (message: string | null) => void;
	error: string;
	isProcessing: boolean;
	readyFramesCount: number;
	storedReferenceLabel: string | null;
	storedReferenceColors: readonly string[] | null;
	/** Attaches exactly one live frame by name; null clears composer targets. */
	selectTargetFrameByName: (frameName: string | null) => void;
	selectFrame: (id: string | null, additive?: boolean) => void;
	selectFrames: (ids: string[]) => void;
	removeSelectedFrame: (id: string) => void;
	clearSelectedFrames: () => void;
	setError: (message: string) => void;
	handleDuplicate: () => Promise<void>;
	handleDelete: () => Promise<void>;
	handleRename: (name: string) => Promise<void>;
	handleComposerSubmit: (
		promptText: string,
	) => Promise<StudioComposerSubmitResult>;
	handleRetryFrame: (frameId: string) => Promise<void>;
	handleRetryPlanning: () => Promise<void>;
	handleDownloadAllZip: () => Promise<void>;
	syncProjectStatus: (
		onSuccess?: (status: StudioStatus) => void,
	) => Promise<void>;
	publishCommitted: (
		projectId: string,
		frameId: string,
		revision: number,
		html: string,
	) => void;
}

export function useStudioWorkspace(
	initialData: StudioDetailLoaderData,
): StudioWorkspaceState {
	const {
		project,
		frames,
		activeJob,
		messages,
		isProcessing,
		syncProjectStatus,
		publishCommitted,
		error: syncError,
		clearError: clearSyncError,
	} = useStudioStatus(initialData);
	const lifecycle = deriveStudioLifecycle({ project, frames, activeJob });
	const [selectedFrameIds, setSelectedFrameIds] = useState<string[]>([]);
	const selectedFrameId =
		selectedFrameIds.length === 1 ? selectedFrameIds[0] : null;
	const [error, setActionError] = useState("");
	const setError = useCallback(
		(message: string) => {
			setActionError(message);
			if (!message) clearSyncError();
		},
		[clearSyncError],
	);
	const loader = useRef(initialData);
	useEffect(() => {
		if (loader.current === initialData) return;
		if (loader.current.project.id !== initialData.project.id) {
			setSelectedFrameIds([]);
		}
		loader.current = initialData;
		setActionError("");
	}, [initialData]);

	const selectionKey = `studio-chat-selection:${project.userId}:${project.id}`;
	const [loadedSelectionKey, setLoadedSelectionKey] = useState("");
	useEffect(() => {
		let stored: unknown = [];
		try {
			stored = JSON.parse(readStudioChatStorage(selectionKey) ?? "[]");
		} catch {
			stored = [];
		}
		const parsed = selectedFrameIdsSchema.safeParse(stored);
		const ids = parsed.success ? [...new Set(parsed.data)] : [];
		setSelectedFrameIds(ids);
		setLoadedSelectionKey(selectionKey);
	}, [selectionKey]);
	useEffect(() => {
		if (loadedSelectionKey === selectionKey)
			writeStudioChatStorage(selectionKey, JSON.stringify(selectedFrameIds));
	}, [loadedSelectionKey, selectionKey, selectedFrameIds]);

	const selectFrame = useCallback((id: string | null, additive = false) => {
		setSelectedFrameIds((previous) =>
			id === null
				? []
				: additive
					? previous.includes(id)
						? previous.filter((entry) => entry !== id)
						: [...previous, id]
					: [id],
		);
	}, []);

	// Marquee selection reports the whole id set at once. Deduping and keeping
	// the incoming order means the composer chips mirror the canvas order and
	// every selected frame survives to the revision request.
	const selectFrames = useCallback((ids: string[]) => {
		const unique = [...new Set(ids)];
		setSelectedFrameIds(unique);
	}, []);

	const readyFramesCount = useMemo(
		() => frames.filter((f) => f.status === "ready").length,
		[frames],
	);

	// Derived selection state must keep a stable identity: a fresh array on
	// every poll tick would re-render the composer even when nothing changed.
	const selectedFrames = useMemo(
		() => frames.filter((frame) => selectedFrameIds.includes(frame.id)),
		[frames, selectedFrameIds],
	);

	const removeSelectedFrame = useCallback((id: string) => {
		setSelectedFrameIds((previous) => previous.filter((entry) => entry !== id));
	}, []);

	const clearSelectedFrames = useCallback(() => {
		setSelectedFrameIds([]);
	}, []);

	// A card may only attach a frame that actually exists. An unknown name
	// clears the attachment instead of sending a stale target to the server.
	const selectTargetFrameByName = useCallback(
		(frameName: string | null) => {
			if (!frameName) {
				clearSelectedFrames();
				return;
			}
			const frame = frames.find((entry) => entry.name === frameName);
			if (frame) selectFrame(frame.id);
			else clearSelectedFrames();
		},
		[clearSelectedFrames, frames, selectFrame],
	);

	// A frame row can be replaced (planning rewrites its slots) or deleted while
	// its id is still selected. The operation endpoint refuses an unknown target,
	// so a stale id would reject every selected-frame request while the composer
	// showed no chip to remove. Pruning keeps targets and canvas in step; both
	// setters bail out when nothing changed, so a poll never re-renders.
	const liveFrameIds = useMemo(() => frames.map((frame) => frame.id), [frames]);
	useEffect(() => {
		setSelectedFrameIds((previous) =>
			pruneStudioFrameSelection(previous, liveFrameIds),
		);
	}, [liveFrameIds]);

	const actions = useStudioWorkspaceActions({
		project,
		frames,
		selectedFrameIds,
		syncProjectStatus,
		setError,
	});
	const planningRetry = useStudioPlanningRetry({
		projectId: project.id,
		canRetryPlanning: lifecycle.canRetryPlanning && !syncError,
		syncProjectStatus,
		setError,
	});

	const storedReferenceLabel = useMemo(() => {
		const reference = project.designReference;
		if (reference?.kind === "theme") {
			const preset = STUDIO_DESIGN_PRESETS.find(
				(entry) => entry.id === reference.id,
			);
			return preset ? `${preset.name}` : null;
		}
		if (reference?.kind === "custom") return reference.filename;
		if (reference?.kind === "scrape") return reference.sourceUrl;
		if (project.designMd) return "Referensi desain";
		return null;
	}, [project.designReference, project.designMd]);

	const storedReferenceColors = useMemo(() => {
		const reference = project.designReference;
		if (reference?.kind === "theme") {
			const preset = STUDIO_DESIGN_PRESETS.find(
				(entry) => entry.id === reference.id,
			);
			if (preset) {
				return [preset.tokens.canvas, preset.tokens.primary, preset.tokens.ink];
			}
		}
		if (project.designMd) {
			const tokens = extractDesignSystemTokens(project.designMd);
			if (tokens) {
				const candidateColors = [
					tokens.colors.canvas,
					tokens.colors.primary,
					tokens.colors.ink,
				].filter(
					(color): color is string =>
						typeof color === "string" &&
						/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(
							color.trim(),
						),
				);
				if (candidateColors.length > 0) {
					return candidateColors;
				}
			}
		}
		return null;
	}, [project.designReference, project.designMd]);
	return {
		project,
		frames,
		activeJob,
		messages: messages ?? [],
		selectedFrameId,
		selectedFrameIds,
		selectedFrames,
		composerLoading: actions.composerLoading,
		exportingZip: actions.exportingZip,
		duplicating: actions.duplicating,
		renaming: actions.renaming,
		retryingFrameIds: actions.retryingFrameIds,
		retryingPlanning: planningRetry.retryingPlanning,
		canRetryPlanning: lifecycle.canRetryPlanning && !syncError,
		frameRetryErrors: actions.frameRetryErrors,
		creditsExhausted: actions.creditsExhausted,
		setCreditsExhausted: actions.setCreditsExhausted,
		error: error || syncError,
		isProcessing,
		readyFramesCount,
		storedReferenceLabel,
		storedReferenceColors,
		selectTargetFrameByName,
		selectFrame,
		selectFrames,
		removeSelectedFrame,
		clearSelectedFrames,
		setError,
		handleDuplicate: actions.handleDuplicate,
		handleDelete: actions.handleDelete,
		handleRename: actions.handleRename,
		handleComposerSubmit: actions.handleComposerSubmit,
		handleRetryFrame: actions.handleRetryFrame,
		handleRetryPlanning: planningRetry.handleRetryPlanning,
		handleDownloadAllZip: actions.handleDownloadAllZip,
		syncProjectStatus,
		publishCommitted,
	};
}
