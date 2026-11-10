import {
	type Dispatch,
	type RefObject,
	type SetStateAction,
	useCallback,
} from "react";
import {
	buildFeatureMessage,
	type CodebasePipelineStage,
} from "@/features/codebase/services/chat-flow";
import type { useWorkspaceArtifacts } from "./use-workspace-artifacts";
import type { useWorkspacePipeline } from "./use-workspace-pipeline";

export function useWorkspaceGenerationActions({
	effectiveFeatureId,
	activeProjectIdRef,
	featureName,
	codebaseName,
	chatAnswers,
	runPipelineStage,
	loadPrd,
	loadAc,
	refreshTaskTree,
	refetchKanban,
	setStageError,
	setPipelineStage,
	refreshTimeline,
	openArtifactPreview,
	pipelineStage,
	handleConfirmGenerate,
}: {
	effectiveFeatureId: string | null;
	activeProjectIdRef: RefObject<string | null>;
	featureName: string | undefined;
	codebaseName: string;
	chatAnswers: Record<string, string>;
	runPipelineStage: ReturnType<typeof useWorkspacePipeline>;
	loadPrd: ReturnType<typeof useWorkspaceArtifacts>["loadPrd"];
	loadAc: ReturnType<typeof useWorkspaceArtifacts>["loadAc"];
	refreshTaskTree: ReturnType<typeof useWorkspaceArtifacts>["refreshTaskTree"];
	refetchKanban: () => Promise<void>;
	setStageError: Dispatch<SetStateAction<string | null>>;
	setPipelineStage: Dispatch<SetStateAction<CodebasePipelineStage>>;
	refreshTimeline: () => Promise<void>;
	openArtifactPreview: (kind: "feature" | "prd" | "ac" | "tasks") => void;
	pipelineStage: CodebasePipelineStage;
	handleConfirmGenerate: (retry?: boolean) => Promise<void>;
}) {
	const handleGeneratePrd = useCallback(
		(retry = true) => {
			if (!effectiveFeatureId) return;
			const message = buildFeatureMessage(
				featureName ?? codebaseName,
				chatAnswers,
			);
			void runPipelineStage(
				"prd",
				"/api/chat",
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						projectId: effectiveFeatureId,
						mode: "generate",
						message,
					}),
				},
				async () => {
					const content = await loadPrd();
					if (activeProjectIdRef.current !== effectiveFeatureId) return false;
					if (!content) {
						setStageError(
							"PRD belum tersimpan di server. Coba generate ulang.",
						);
						return false;
					}
					setPipelineStage("prd");
					void refreshTimeline();
					openArtifactPreview("prd");
					return true;
				},
				retry,
			);
		},
		[
			effectiveFeatureId,
			featureName,
			codebaseName,
			chatAnswers,
			runPipelineStage,
			loadPrd,
			activeProjectIdRef,
			setStageError,
			setPipelineStage,
			refreshTimeline,
			openArtifactPreview,
		],
	);
	const handleGenerateAc = useCallback(
		(retry = true) => {
			if (!effectiveFeatureId) return;
			void runPipelineStage(
				"ac",
				"/api/ac/generate",
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ projectId: effectiveFeatureId }),
				},
				async () => {
					const content = await loadAc();
					if (activeProjectIdRef.current !== effectiveFeatureId) return false;
					if (!content) {
						setStageError(
							"Acceptance Criteria belum tersimpan di server. Coba generate ulang.",
						);
						return false;
					}
					setPipelineStage("ac");
					void refreshTimeline();
					openArtifactPreview("ac");
					return true;
				},
				retry,
			);
		},
		[
			effectiveFeatureId,
			runPipelineStage,
			loadAc,
			activeProjectIdRef,
			setStageError,
			setPipelineStage,
			refreshTimeline,
			openArtifactPreview,
		],
	);
	const handleGenerateTask = useCallback(
		(retry = true) => {
			if (!effectiveFeatureId) return;
			void runPipelineStage(
				"task",
				"/api/task/generate",
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ projectId: effectiveFeatureId }),
				},
				async () => {
					await refetchKanban();
					if (activeProjectIdRef.current !== effectiveFeatureId) return false;
					const persistedTaskTree = await refreshTaskTree(effectiveFeatureId);
					if (activeProjectIdRef.current !== effectiveFeatureId) return false;
					if (!persistedTaskTree) {
						setStageError(
							"Task belum tersimpan di server. Coba breakdown task ulang.",
						);
						return false;
					}
					setPipelineStage("handoff");
					void refreshTimeline();
					openArtifactPreview("tasks");
					return true;
				},
				retry,
			);
		},
		[
			effectiveFeatureId,
			runPipelineStage,
			refetchKanban,
			refreshTaskTree,
			activeProjectIdRef,
			setStageError,
			setPipelineStage,
			refreshTimeline,
			openArtifactPreview,
		],
	);
	const handleRetryStage = useCallback(() => {
		if (pipelineStage === "prd") {
			handleGeneratePrd(true);
			return;
		}
		if (pipelineStage === "ac") {
			handleGenerateAc(true);
			return;
		}
		if (pipelineStage === "task" || pipelineStage === "handoff") {
			handleGenerateTask(true);
			return;
		}
		void handleConfirmGenerate(true);
	}, [
		pipelineStage,
		handleGeneratePrd,
		handleGenerateAc,
		handleGenerateTask,
		handleConfirmGenerate,
	]);
	return {
		handleGeneratePrd,
		handleGenerateAc,
		handleGenerateTask,
		handleRetryStage,
	};
}
