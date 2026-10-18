import { useRouter } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
	StudioFrameRow,
	StudioJobRow,
	StudioProjectRow,
} from "@/db/schema";
import type { StudioComposerScope } from "@/features/studio/components/composer/studio-composer";
import { useStudioWorkspaceActions } from "@/features/studio/hooks/use-studio-workspace-actions";
import type { StudioDesignSkillId } from "@/features/studio/services/studio-generation-options";
import { STUDIO_DESIGN_PRESETS } from "@/features/studio/services/studio-presets";
import type {
	AttachedDesignReference,
	StudioDetailLoaderData,
} from "@/features/studio/types/studio";

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
	isAddFrameOpen: boolean;
	error: string;
	isProcessing: boolean;
	readyFramesCount: number;
	storedReferenceLabel: string | null;
	selectFrame: (id: string | null, additive?: boolean) => void;
	selectFrames: (ids: string[]) => void;
	removeSelectedFrame: (id: string) => void;
	setIsAddFrameOpen: (open: boolean) => void;
	setError: (message: string) => void;
	handleDuplicate: () => Promise<void>;
	handleDelete: () => Promise<void>;
	handleComposerSubmit: (
		promptText: string,
		scope: StudioComposerScope,
	) => Promise<boolean>;
	handleAddFrame: (input: { name: string; prompt: string }) => Promise<void>;
	handleApplyDesignSystem: (
		reference: AttachedDesignReference,
	) => Promise<boolean>;
	handleSkillChange: (skillId: StudioDesignSkillId) => Promise<void>;
	handleRetryFrame: (frameId: string) => Promise<void>;
	handleRetryPlanning: () => Promise<void>;
	handleDownloadAllZip: () => Promise<void>;
}

/**
 * State, polling and server actions for one Studio project workspace.
 *
 * Every write goes through the authoritative API and then re-reads project
 * status, so the canvas, the composer and the header all reconcile from
 * persisted state instead of an optimistic guess.
 */
export function useStudioWorkspace(
	initialData: StudioDetailLoaderData,
): StudioWorkspaceState {
	const [project, setProject] = useState(initialData.project);
	const [frames, setFrames] = useState<StudioFrameRow[]>(initialData.frames);
	const [activeJob, setActiveJob] = useState<StudioJobRow | null>(
		initialData.activeJob,
	);
	const [selectedFrameId, setSelectedFrameId] = useState<string | null>(null);
	const [selectedFrameIds, setSelectedFrameIds] = useState<string[]>([]);
	const [isAddFrameOpen, setIsAddFrameOpen] = useState(false);
	const [error, setError] = useState("");
	const router = useRouter();

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

	const isProcessing = useMemo(() => {
		if (
			activeJob &&
			(activeJob.status === "queued" ||
				activeJob.status === "planning" ||
				activeJob.status === "generating")
		) {
			return true;
		}
		return frames.some(
			(f) => f.status === "queued" || f.status === "generating",
		);
	}, [activeJob, frames]);

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
		setSelectedFrameId((previous) => (previous === id ? null : previous));
	}, []);

	const syncProjectStatus = useCallback(async () => {
		try {
			const res = await fetch(`/api/studio/status?id=${project.id}`);
			// 404 means the project no longer exists (deleted here or in another
			// tab). Leave the workspace instead of polling a dead id forever.
			if (res.status === 404) {
				void router.invalidate();
				return;
			}
			if (!res.ok) return;
			const data = (await res.json()) as {
				project: StudioProjectRow;
				frames: StudioFrameRow[];
				activeJob: StudioJobRow | null;
			};
			if (data.project) setProject(data.project);
			if (data.frames) setFrames(data.frames);
			if (data.activeJob !== undefined) setActiveJob(data.activeJob);
		} catch {
			// Network hiccup during polling
		}
	}, [project.id, router]);

	// Poll authoritative status while jobs or frames are actively processing
	useEffect(() => {
		if (!isProcessing) return;
		const timer = setInterval(() => {
			void syncProjectStatus();
		}, 1500);
		return () => clearInterval(timer);
	}, [isProcessing, syncProjectStatus]);

	const actions = useStudioWorkspaceActions({
		project,
		frames,
		selectedFrameIds,
		isProcessing,
		syncProjectStatus,
		setError,
		setIsAddFrameOpen,
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
		isAddFrameOpen,
		error,
		isProcessing,
		readyFramesCount,
		storedReferenceLabel,
		selectFrame,
		selectFrames,
		removeSelectedFrame,
		setIsAddFrameOpen,
		setError,
		handleDuplicate: actions.handleDuplicate,
		handleDelete: actions.handleDelete,
		handleComposerSubmit: actions.handleComposerSubmit,
		handleAddFrame: actions.handleAddFrame,
		handleApplyDesignSystem: actions.handleApplyDesignSystem,
		handleSkillChange: actions.handleSkillChange,
		handleRetryFrame: actions.handleRetryFrame,
		handleRetryPlanning: actions.handleRetryPlanning,
		handleDownloadAllZip: actions.handleDownloadAllZip,
	};
}
