import { type Dispatch, type SetStateAction, useCallback } from "react";
import {
	buildFeatureMessage,
	type CodebasePipelineStage,
} from "@/features/codebase/services/chat-flow";
import type { useWorkspaceArtifacts } from "./use-workspace-artifacts";
import type { useWorkspacePipeline } from "./use-workspace-pipeline";

export function useWorkspaceGenerationActions({
	effectiveFeatureId,
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
	pushAssistantMessage,
	openArtifactPreview,
	pipelineStage,
	handleConfirmGenerate,
}: {
	effectiveFeatureId: string | null;
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
	pushAssistantMessage: (content: string) => void;
	openArtifactPreview: (kind: "feature" | "prd" | "ac" | "tasks") => void;
	pipelineStage: CodebasePipelineStage;
	handleConfirmGenerate: () => Promise<void>;
}) {
	const handleGeneratePrd = useCallback(() => {
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
				if (!content) {
					setStageError("PRD belum tersimpan di server. Coba generate ulang.");
					return false;
				}
				setPipelineStage("prd");
				pushAssistantMessage(
					`PRD 8 seksi untuk ${featureName ?? "fitur"} siap.`,
				);
				openArtifactPreview("prd");
				return true;
			},
		);
	}, [
		effectiveFeatureId,
		featureName,
		codebaseName,
		chatAnswers,
		runPipelineStage,
		loadPrd,
		setStageError,
		setPipelineStage,
		pushAssistantMessage,
		openArtifactPreview,
	]);
	const handleGenerateAc = useCallback(() => {
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
				if (!content) {
					setStageError(
						"Acceptance Criteria belum tersimpan di server. Coba generate ulang.",
					);
					return false;
				}
				setPipelineStage("ac");
				pushAssistantMessage(
					`Acceptance Criteria untuk ${featureName ?? "fitur"} siap.`,
				);
				openArtifactPreview("ac");
				return true;
			},
		);
	}, [
		effectiveFeatureId,
		featureName,
		runPipelineStage,
		loadAc,
		setStageError,
		setPipelineStage,
		pushAssistantMessage,
		openArtifactPreview,
	]);
	const handleGenerateTask = useCallback(() => {
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
				const persistedTaskTree = await refreshTaskTree(effectiveFeatureId);
				if (!persistedTaskTree) {
					setStageError(
						"Task belum tersimpan di server. Coba breakdown task ulang.",
					);
					return false;
				}
				setPipelineStage("handoff");
				pushAssistantMessage(
					`Task untuk ${featureName ?? "fitur"} sudah tersimpan dan papan Kanban aktif.`,
				);
				openArtifactPreview("tasks");
				return true;
			},
		);
	}, [
		effectiveFeatureId,
		featureName,
		runPipelineStage,
		refetchKanban,
		refreshTaskTree,
		setStageError,
		setPipelineStage,
		pushAssistantMessage,
		openArtifactPreview,
	]);
	const handleRetryStage = useCallback(() => {
		if (pipelineStage === "prd") {
			handleGeneratePrd();
			return;
		}
		if (pipelineStage === "ac") {
			handleGenerateAc();
			return;
		}
		if (pipelineStage === "task" || pipelineStage === "handoff") {
			handleGenerateTask();
			return;
		}
		void handleConfirmGenerate();
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
