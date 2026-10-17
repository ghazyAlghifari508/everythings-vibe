import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChatStreamMessage } from "@/features/codebase/components/chat/codebase-chat-workspace";
import {
	type CodebasePipelineStage,
	type CodebaseRunState,
	reconcilePipelineStage,
	resolvePersistedStage,
	shouldAutoRevealArtifact,
} from "@/features/codebase/services/chat-flow";
import {
	assessRevisionImpact,
	type CodebaseComposerMode,
} from "@/features/codebase/services/revision-intent";
import {
	emptyArtifactHydration,
	resolveWorkspaceView,
	type WorkspaceArtifactHydration,
} from "@/features/codebase/services/workspace-hydration";
import { useKanbanTasks } from "@/hooks/use-kanban-polling";
import { computeKanbanProgress } from "@/lib/kanban-utils";
import type { CodebaseWorkspaceData } from "../services/workspace-loader.functions";
import { useCodebaseSync } from "./use-codebase-sync";
import { useWorkspaceArtifactPresentation } from "./use-workspace-artifact-presentation";
import { useWorkspaceArtifacts } from "./use-workspace-artifacts";
import { useWorkspaceComposer } from "./use-workspace-composer";
import { useWorkspaceFeatureGeneration } from "./use-workspace-feature-generation";
import { useWorkspaceGenerationActions } from "./use-workspace-generation-actions";
import { useWorkspacePipeline } from "./use-workspace-pipeline";
import { useWorkspacePlan } from "./use-workspace-plan";
import { useWorkspaceQuestions } from "./use-workspace-questions";
import { useWorkspaceRevision } from "./use-workspace-revision";
import { useWorkspaceSource } from "./use-workspace-source";

export function useCodebaseWorkspace(data: CodebaseWorkspaceData) {
	const { codebase, onboardingFeatureId } = data;
	const plan = useWorkspacePlan(data);
	const { effectiveFeatureId, resolvedFeature, planState, onboardingFeature } =
		plan;
	const [chatMessages, setChatMessages] = useState<ChatStreamMessage[]>([]);
	const [run, setRun] = useState<CodebaseRunState | null>(null);
	const sync = useCodebaseSync({
		codebaseId: codebase.id,
		projectId: onboardingFeature?.id ?? null,
		currentSnapshotId: data.currentSnapshotId,
		initialAnalysis: data.analysis,
		hasStoredSnapshot: data.hasStoredSnapshot,
	});
	const questions = useWorkspaceQuestions(effectiveFeatureId, setRun);
	const [canvasOpen, setCanvasOpen] = useState(false);
	const [activeArtifactId, setActiveArtifactId] = useState<string | null>(null);
	const [canvasView, setCanvasView] = useState<"kanban" | "checklist">(
		"kanban",
	);
	const artifact = useWorkspaceArtifacts(
		sync.snapshotReady,
		effectiveFeatureId,
	);
	const [pipelineStage, setPipelineStage] =
		useState<CodebasePipelineStage>("questions");
	const [stageBusy, setStageBusy] = useState<CodebasePipelineStage | null>(
		null,
	);
	const [stageError, setStageError] = useState<string | null>(null);
	const kanban = useKanbanTasks({
		projectId: effectiveFeatureId ?? "",
		enabled: sync.snapshotReady && Boolean(effectiveFeatureId),
	});
	const kanbanProgress = useMemo(
		() =>
			kanban.data?.columns ? computeKanbanProgress(kanban.data.columns) : null,
		[kanban.data],
	);
	const hasTasksInDb = Boolean(
		(kanbanProgress && kanbanProgress.total > 0) || artifact.taskTree !== null,
	);
	const hydration: WorkspaceArtifactHydration = useMemo(() => {
		if (!hasTasksInDb || artifact.artifactHydration.tasks === "ready")
			return artifact.artifactHydration;
		if (artifact.artifactHydration.tasks === "empty")
			return { ...artifact.artifactHydration, tasks: "ready" };
		return artifact.artifactHydration;
	}, [artifact.artifactHydration, hasTasksInDb]);
	const workspaceView = useMemo(
		() =>
			resolveWorkspaceView({
				plan: planState,
				artifacts: hydration,
				hasMessages: chatMessages.length > 0,
				hasQuestions: questions.aiQuestions.length > 0,
				isSending: sync.isWorking,
				runStatus: run?.status ?? "idle",
			}),
		[
			planState,
			hydration,
			chatMessages.length,
			questions.aiQuestions.length,
			sync.isWorking,
			run?.status,
		],
	);
	const persistedStage = resolvePersistedStage({
		feature: hydration.feature,
		prd: hydration.prd,
		ac: hydration.ac,
		tasks: hydration.tasks,
	});
	const stage = reconcilePipelineStage(pipelineStage, persistedStage);
	useEffect(() => {
		setPipelineStage((current) =>
			reconcilePipelineStage(current, persistedStage),
		);
	}, [persistedStage]);
	const analysisOutput = sync.analysis?.output ?? null;
	const source = useWorkspaceSource({
		codebaseId: codebase.id,
		snapshotReady: sync.snapshotReady,
		polledSnapshotId: sync.status?.snapshotId,
		analysisOutput,
		setActiveArtifactId,
		setCanvasOpen,
	});
	const presentation = useWorkspaceArtifactPresentation({
		resolvedFeature,
		codebaseName: codebase.name,
		featureTree: artifact.featureTree,
		taskTree: artifact.taskTree,
		prdContent: artifact.prdContent,
		acContent: artifact.acContent,
		hasTasksInDb,
		activeArtifactId,
		sourcePreview: source.sourcePreview,
	});
	const activeIsAnchorPlan =
		effectiveFeatureId != null && effectiveFeatureId === onboardingFeatureId;
	const activeHasPlanning = presentation.artifacts.length > 0;
	const composerMode: CodebaseComposerMode =
		plan.isCreatingNew ||
		!effectiveFeatureId ||
		(activeIsAnchorPlan && !activeHasPlanning)
			? "create"
			: activeHasPlanning
				? "revise"
				: "clarify";
	const composerTargetName =
		composerMode === "create" ? null : (resolvedFeature?.name ?? null);
	const revisionImpact = useMemo(() => {
		const all = kanban.data?.columns
			? [
					...kanban.data.columns.pending,
					...kanban.data.columns.in_progress,
					...kanban.data.columns.completed,
					...kanban.data.columns.failed,
				]
			: [];
		return assessRevisionImpact(all.map((task) => ({ status: task.status })));
	}, [kanban.data]);
	const pushAssistantMessage = useCallback((content: string) => {
		setChatMessages((current) => [
			...current,
			{ id: `assistant-${Date.now()}`, role: "assistant", content },
		]);
	}, []);
	const userTookOverCanvas = useRef(false);
	const openArtifactPreview = useCallback(
		(kind: "feature" | "prd" | "ac" | "tasks") => {
			if (
				!effectiveFeatureId ||
				!shouldAutoRevealArtifact({
					persisted: true,
					userTookOverCanvas: userTookOverCanvas.current,
				})
			)
				return;
			setActiveArtifactId(`${kind}-${effectiveFeatureId}`);
			if (kind === "tasks") setCanvasView("kanban");
			setCanvasOpen(true);
		},
		[effectiveFeatureId],
	);
	const runRevision = useWorkspaceRevision({
		effectiveFeatureId,
		stageBusy,
		featureName: resolvedFeature?.name ?? codebase.name,
		resolvedFeatureName: resolvedFeature?.name,
		requiresTaskReplacementConfirmation:
			revisionImpact.requiresTaskReplacementConfirmation,
		loadPrd: artifact.loadPrd,
		pushAssistantMessage,
		openArtifactPreview,
		setStageBusy,
		setStageError,
		setRun,
	});
	const composer = useWorkspaceComposer({
		codebase,
		snapshotReady: sync.snapshotReady,
		isWorking: sync.isWorking,
		setIsWorking: sync.setIsWorking,
		setError: sync.setError,
		setActiveFeature: plan.setActiveFeature,
		setPipelineStage,
		setFeatureTree: artifact.setFeatureTree,
		setTaskTree: artifact.setTaskTree,
		setPrdContent: artifact.setPrdContent,
		setAcContent: artifact.setAcContent,
		setChatAnswers: questions.setChatAnswers,
		setChatMessages,
		effectiveFeatureId,
		onboardingFeatureId,
		artifactCount: presentation.artifacts.length,
		isCreatingNew: plan.isCreatingNew,
		setIsCreatingNew: plan.setIsCreatingNew,
		setLastFeaturePrompt: questions.setLastFeaturePrompt,
		fetchAiQuestions: questions.fetchAiQuestions,
		runRevision,
	});
	const featureGeneration = useWorkspaceFeatureGeneration({
		effectiveFeatureId,
		chatAnswers: questions.chatAnswers,
		aiQuestions: questions.aiQuestions,
		lastFeaturePrompt: questions.lastFeaturePrompt,
		featureName: resolvedFeature?.name,
		codebaseName: codebase.name,
		refreshFeatureTree: artifact.refreshFeatureTree,
		pushAssistantMessage,
		openArtifactPreview,
		setPipelineStage,
		setStageError,
		setRun,
	});
	const runPipelineStage = useWorkspacePipeline({
		effectiveFeatureId,
		stageBusy,
		activeProjectIdRef: artifact.activeProjectIdRef,
		setStageBusy,
		setStageError,
		setRun,
	});
	const generation = useWorkspaceGenerationActions({
		effectiveFeatureId,
		featureName: resolvedFeature?.name,
		codebaseName: codebase.name,
		chatAnswers: questions.chatAnswers,
		runPipelineStage,
		loadPrd: artifact.loadPrd,
		loadAc: artifact.loadAc,
		refreshTaskTree: artifact.refreshTaskTree,
		refetchKanban: kanban.refetch,
		setStageError,
		setPipelineStage,
		pushAssistantMessage,
		openArtifactPreview,
		pipelineStage,
		handleConfirmGenerate: featureGeneration.handleConfirmGenerate,
	});
	const selectPlan = (projectId: string) => {
		plan.setIsCreatingNew(false);
		plan.setRequestedProjectId(projectId);
		plan.setActiveFeature(null);
		artifact.setFeatureTree(null);
		artifact.setTaskTree(null);
		artifact.setPrdContent(null);
		artifact.setAcContent(null);
		artifact.setPrdError(null);
		artifact.setAcError(null);
		questions.setAiQuestions([]);
		questions.setChatAnswers({});
		setChatMessages([]);
		setRun(null);
		setStageError(null);
		featureGeneration.setSpecError(null);
		setActiveArtifactId(null);
		setCanvasOpen(false);
		artifact.setArtifactHydration(emptyArtifactHydration());
		setPipelineStage("questions");
	};
	return {
		...plan,
		...sync,
		...questions,
		...artifact,
		...source,
		...presentation,
		...composer,
		...featureGeneration,
		...generation,
		chatMessages,
		run,
		canvasOpen,
		setCanvasOpen,
		activeArtifactId,
		setActiveArtifactId,
		canvasView,
		setCanvasView,
		stageBusy,
		stageError,
		kanban,
		kanbanProgress,
		hasTasksInDb,
		hydration,
		workspaceView,
		stage,
		analysisOutput,
		composerMode,
		composerTargetName,
		revisionImpact,
		userTookOverCanvas,
		selectPlan,
	};
}
