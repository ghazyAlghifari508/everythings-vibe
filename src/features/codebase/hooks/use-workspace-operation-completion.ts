import {
	type Dispatch,
	type RefObject,
	type SetStateAction,
	useCallback,
} from "react";
import type { ProjectFeatureTree } from "@/db/schema";
import {
	type AdaptiveQuestion,
	type CodebasePipelineStage,
	type CodebaseRunStage,
	mapAskQuestionsToAdaptive,
} from "@/features/codebase/services/chat-flow";
import type { DurableGenerationOperation } from "@/features/codebase/services/workspace-operations";
import { validateAskQuestions } from "@/features/greenfield/services/ask-service";
import type { TaskTree } from "@/features/greenfield/services/task-tree";

export interface WorkspaceOperationCompletionOptions {
	activeProjectIdRef: RefObject<string | null>;
	setAiQuestions: (questions: AdaptiveQuestion[]) => void;
	setLastFeaturePrompt?: (prompt: string) => void;
	refreshFeatureTree: (id: string | null) => Promise<ProjectFeatureTree | null>;
	loadPrd: () => Promise<string | null>;
	loadAc: () => Promise<string | null>;
	refreshTaskTree: (id: string | null) => Promise<TaskTree | null>;
	refetchKanban: () => Promise<unknown>;
	setPipelineStage: Dispatch<SetStateAction<CodebasePipelineStage>>;
	openArtifactPreview: (kind: "feature" | "prd" | "ac" | "tasks") => void;
	refreshTimeline: () => Promise<void>;
}

export function useWorkspaceOperationCompletion({
	activeProjectIdRef,
	setAiQuestions,
	setLastFeaturePrompt,
	refreshFeatureTree,
	loadPrd,
	loadAc,
	refreshTaskTree,
	refetchKanban,
	setPipelineStage,
	openArtifactPreview,
	refreshTimeline,
}: WorkspaceOperationCompletionOptions) {
	return useCallback(
		async (
			stage: CodebaseRunStage,
			op: DurableGenerationOperation,
		): Promise<boolean> => {
			if (activeProjectIdRef.current !== op.projectId) return false;
			void refreshTimeline();

			if (stage === "questions") {
				if (typeof op.input?.prompt === "string" && op.input.prompt.trim()) {
					setLastFeaturePrompt?.(op.input.prompt.trim());
				}
				if (op.result?.questions && Array.isArray(op.result.questions)) {
					const validated = validateAskQuestions(op.result.questions);
					if (validated && validated.length > 0) {
						setAiQuestions(mapAskQuestionsToAdaptive(validated));
						return true;
					}
				}
				return true;
			}

			if (stage === "feature") {
				const tree = await refreshFeatureTree(op.projectId);
				if (tree && activeProjectIdRef.current === op.projectId) {
					setPipelineStage("feature");
					openArtifactPreview("feature");
					void refreshTimeline();
					return true;
				}
				return false;
			}

			if (stage === "prd") {
				const content = await loadPrd();
				if (content && activeProjectIdRef.current === op.projectId) {
					setPipelineStage("prd");
					openArtifactPreview("prd");
					void refreshTimeline();
					return true;
				}
				return false;
			}

			if (stage === "ac") {
				const content = await loadAc();
				if (content && activeProjectIdRef.current === op.projectId) {
					setPipelineStage("ac");
					openArtifactPreview("ac");
					void refreshTimeline();
					return true;
				}
				return false;
			}

			if (stage === "task") {
				await refetchKanban();
				const tree = await refreshTaskTree(op.projectId);
				if (tree && activeProjectIdRef.current === op.projectId) {
					setPipelineStage("handoff");
					openArtifactPreview("tasks");
					void refreshTimeline();
					return true;
				}
				return false;
			}

			return false;
		},
		[
			activeProjectIdRef,
			setAiQuestions,
			refreshFeatureTree,
			loadPrd,
			loadAc,
			refreshTaskTree,
			refetchKanban,
			setPipelineStage,
			openArtifactPreview,
			refreshTimeline,
			setLastFeaturePrompt,
		],
	);
}
