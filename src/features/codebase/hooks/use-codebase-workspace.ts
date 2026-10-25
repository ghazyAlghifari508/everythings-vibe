import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChatStreamMessage } from "@/features/codebase/components/chat/codebase-chat-workspace";
import {
	type CodebasePipelineStage,
	type CodebaseRunState,
	reconcilePipelineStage,
	resolvePersistedStage,
	shouldAutoRevealArtifact,
} from "@/features/codebase/services/chat-flow";
import type { CodebaseComposerMode } from "@/features/codebase/services/revision-intent";
import {
	emptyArtifactHydration,
	resolveWorkspaceView,
	type WorkspaceArtifactHydration,
} from "@/features/codebase/services/workspace-hydration";
import { useKanbanTasks } from "@/features/greenfield/hooks/use-kanban-polling";
import { computeKanbanProgress } from "@/lib/kanban-utils";
import type { CodebaseWorkspaceData } from "../services/workspace-loader.functions";
import { useCodebaseSync } from "./use-codebase-sync";
import { useWorkspaceArtifactPresentation } from "./use-workspace-artifact-presentation";
import { useWorkspaceArtifacts } from "./use-workspace-artifacts";
import { useWorkspaceComposer } from "./use-workspace-composer";
import { useWorkspaceFeatureGeneration } from "./use-workspace-feature-generation";
import { useWorkspaceGenerationActions } from "./use-workspace-generation-actions";
import { useWorkspaceOperationCompletion } from "./use-workspace-operation-completion";
import { useWorkspaceOperations } from "./use-workspace-operations";
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
	const [canvasOpen, setCanvasOpen] = useState(false);
	const [activeArtifactId, setActiveArtifactId] = useState<string | null>(null);
	const [canvasView, setCanvasView] = useState<"kanban" | "checklist">(
		"kanban",
	);
	const artifact = useWorkspaceArtifacts(
		sync.snapshotReady,
		effectiveFeatureId,
	);
	const answersReadOnly =
		Boolean(effectiveFeatureId) &&
		(artifact.artifactHydration.feature !== "empty" ||
			(run?.stage === "feature" && run.status === "running"));
	const questions = useWorkspaceQuestions(
		effectiveFeatureId,
		setRun,
		answersReadOnly,
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
			effectiveFeatureId && kanban.data?.columns
				? computeKanbanProgress(kanban.data.columns)
				: null,
		[kanban.data, effectiveFeatureId],
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
	const composerAvailable =
		!effectiveFeatureId ||
		plan.isCreatingNew ||
		(hydration.tasks === "empty" && !hasTasksInDb);
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
		activeProjectIdRef: artifact.activeProjectIdRef,
		loadPrd: artifact.loadPrd,
		pushAssistantMessage,
		openArtifactPreview,
		setStageBusy,
		setStageError,
		setRun,
	});
	const resetFeatureWorkspace = () => {
		source.clearSourcePreview();
		featureGeneration.setIsConfirming(false);
		featureGeneration.setSpecError(null);
		questions.invalidateRequests();
		artifact.activeProjectIdRef.current = null;
		artifact.setFeatureTree(null);
		artifact.setTaskTree(null);
		artifact.setPrdContent(null);
		artifact.setAcContent(null);
		artifact.setPrdError(null);
		artifact.setAcError(null);
		artifact.setArtifactHydration(emptyArtifactHydration());
		questions.setAiQuestions([]);
		questions.setChatAnswers({});
		questions.setLastFeaturePrompt("");
		setChatMessages([]);
		setRun(null);
		setStageBusy(null);
		setStageError(null);
		setActiveArtifactId(null);
		setCanvasOpen(false);
		setCanvasView("kanban");
		setPipelineStage("questions");
		userTookOverCanvas.current = false;
	};
	const composer = useWorkspaceComposer({
		codebase,
		composerAvailable,
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
		resetFeatureWorkspace,
		registerCreatedPlan: plan.registerCreatedPlan,
		setLastFeaturePrompt: questions.setLastFeaturePrompt,
		fetchAiQuestions: questions.fetchAiQuestions,
		runRevision,
	});
	const featureGeneration = useWorkspaceFeatureGeneration({
		activeProjectIdRef: artifact.activeProjectIdRef,
		effectiveFeatureId,
		readOnly: answersReadOnly,
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
		activeProjectIdRef: artifact.activeProjectIdRef,
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
		pipelineStage: run?.status === "failed" ? run.stage : pipelineStage,
		handleConfirmGenerate: featureGeneration.handleConfirmGenerate,
	});

	// onOperationCompleted extracted
	const onOperationCompleted = useWorkspaceOperationCompletion({
		activeProjectIdRef: artifact.activeProjectIdRef,
		resolvedFeatureName: resolvedFeature?.name,
		codebaseName: codebase.name,
		setAiQuestions: questions.setAiQuestions,
		refreshFeatureTree: artifact.refreshFeatureTree,
		loadPrd: artifact.loadPrd,
		loadAc: artifact.loadAc,
		refreshTaskTree: artifact.refreshTaskTree,
		refetchKanban: kanban.refetch,
		setPipelineStage,
		openArtifactPreview,
		pushAssistantMessage,
	});

	useWorkspaceOperations({
		effectiveFeatureId,
		activeProjectIdRef: artifact.activeProjectIdRef,
		setRun,
		setStageBusy,
		setStageError,
		onOperationCompleted,
	});

	const selectPlan = (projectId: string) => {
		composer.invalidateCreation();
		plan.setIsCreatingNew(false);
		plan.setRequestedProjectId(projectId);
		plan.setActiveFeature(null);
		resetFeatureWorkspace();
		featureGeneration.setSpecError(null);
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
		composerAvailable,
		answersReadOnly,
		composerTargetName,
		userTookOverCanvas,
		selectPlan,
	};
}
