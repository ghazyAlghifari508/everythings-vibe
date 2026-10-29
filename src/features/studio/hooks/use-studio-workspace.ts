import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
	StudioFrameRow,
	StudioJobRow,
	StudioProjectRow,
} from "@/db/schema";
import type { StudioComposerSubmitResult } from "@/features/studio/components/composer/studio-composer";
import { useStudioScreenSuggestions } from "@/features/studio/hooks/use-studio-screen-suggestions";
import { useStudioStatus } from "@/features/studio/hooks/use-studio-status";
import { useStudioWorkspaceActions } from "@/features/studio/hooks/use-studio-workspace-actions";
import type { StudioDesignSkillId } from "@/features/studio/services/studio-generation-options";
import { STUDIO_DESIGN_PRESETS } from "@/features/studio/services/studio-presets";
import type { StudioScreenSuggestion } from "@/features/studio/services/studio-screen-suggestions";
import type {
	AttachedDesignReference,
	StudioDetailLoaderData,
} from "@/features/studio/types/studio";

const NO_SUGGESTIONS: readonly StudioScreenSuggestion[] = [];

export interface StudioWorkspaceState {
	project: StudioProjectRow;
	frames: StudioFrameRow[];
	activeJob: StudioJobRow | null;
	selectedFrameId: string | null;
	selectedFrameIds: string[];
	selectedFrames: StudioFrameRow[];
	composerLoading: boolean;
	preferenceSaving: boolean;
	exportingZip: boolean;
	deleting: boolean;
	duplicating: boolean;
	/** Frames with a retry request in flight; their retry control is disabled. */
	retryingFrameIds: string[];
	/** Per-frame retry rejections, rendered inside that frame only. */
	frameRetryErrors: Record<string, string>;
	error: string;
	isProcessing: boolean;
	readyFramesCount: number;
	storedReferenceLabel: string | null;
	/** Empty while work is in flight; a new screen is already on its way. */
	suggestions: readonly StudioScreenSuggestion[];
	selectFrame: (id: string | null, additive?: boolean) => void;
	selectFrames: (ids: string[]) => void;
	removeSelectedFrame: (id: string) => void;
	setError: (message: string) => void;
	handleDuplicate: () => Promise<void>;
	handleDelete: () => Promise<void>;
	handleComposerSubmit: (
		promptText: string,
	) => Promise<StudioComposerSubmitResult>;
	handleApplyDesignSystem: (
		reference: AttachedDesignReference,
	) => Promise<boolean>;
	handleSkillChange: (skillId: StudioDesignSkillId) => Promise<void>;
	handleRetryFrame: (frameId: string) => Promise<void>;
	handleRetryPlanning: () => Promise<void>;
	handleDownloadAllZip: () => Promise<void>;
}

export function useStudioWorkspace(
	initialData: StudioDetailLoaderData,
): StudioWorkspaceState {
	const {
		project,
		frames,
		activeJob,
		isProcessing,
		syncProjectStatus,
		error: syncError,
		clearError: clearSyncError,
	} = useStudioStatus(initialData);
	const [selectedFrameId, setSelectedFrameId] = useState<string | null>(null);
	const [selectedFrameIds, setSelectedFrameIds] = useState<string[]>([]);
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
			setSelectedFrameId(null);
			setSelectedFrameIds([]);
		}
		loader.current = initialData;
		setActionError("");
	}, [initialData]);

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
		setSelectedFrameId(additive ? null : id);
	}, []);

	// Marquee selection reports the whole id set at once. Deduping and keeping
	// the incoming order means the composer chips mirror the canvas order and
	// every selected frame survives to the revision request.
	const selectFrames = useCallback((ids: string[]) => {
		const unique = [...new Set(ids)];
		setSelectedFrameIds(unique);
		setSelectedFrameId(unique.length === 1 ? unique[0] : null);
	}, []);

	const readyFramesCount = useMemo(
		() => frames.filter((f) => f.status === "ready").length,
		[frames],
	);

	const projectSuggestions = useStudioScreenSuggestions(project, frames);
	// While a job is running the project is mid-plan, and a next-screen request
	// would race the planning step that rewrites the frame list. Suggestions
	// come back as soon as the canvas is idle again.
	const suggestions = isProcessing ? NO_SUGGESTIONS : projectSuggestions;

	// Derived selection state must keep a stable identity: a fresh array on
	// every poll tick would re-render the composer even when nothing changed.
	const selectedFrames = useMemo(
		() => frames.filter((frame) => selectedFrameIds.includes(frame.id)),
		[frames, selectedFrameIds],
	);

	const removeSelectedFrame = useCallback((id: string) => {
		setSelectedFrameIds((previous) => previous.filter((entry) => entry !== id));
		setSelectedFrameId((previous) => (previous === id ? null : previous));
	}, []);

	const actions = useStudioWorkspaceActions({
		project,
		frames,
		selectedFrameIds,
		isProcessing,
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

	return {
		project,
		frames,
		activeJob,
		selectedFrameId,
		selectedFrameIds,
		selectedFrames,
		composerLoading: actions.composerLoading,
		preferenceSaving: actions.preferenceSaving,
		exportingZip: actions.exportingZip,
		deleting: actions.deleting,
		duplicating: actions.duplicating,
		retryingFrameIds: actions.retryingFrameIds,
		frameRetryErrors: actions.frameRetryErrors,
		error: error || syncError,
		isProcessing,
		readyFramesCount,
		storedReferenceLabel,
		suggestions,
		selectFrame,
		selectFrames,
		removeSelectedFrame,
		setError,
		handleDuplicate: actions.handleDuplicate,
		handleDelete: actions.handleDelete,
		handleComposerSubmit: actions.handleComposerSubmit,
		handleApplyDesignSystem: actions.handleApplyDesignSystem,
		handleSkillChange: actions.handleSkillChange,
		handleRetryFrame: actions.handleRetryFrame,
		handleRetryPlanning: actions.handleRetryPlanning,
		handleDownloadAllZip: actions.handleDownloadAllZip,
	};
}
