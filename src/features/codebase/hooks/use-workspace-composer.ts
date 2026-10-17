import { type Dispatch, type SetStateAction, useCallback } from "react";
import type { ChatStreamMessage } from "@/features/codebase/components/chat/codebase-chat-workspace";
import type { CodebasePipelineStage } from "@/features/codebase/services/chat-flow";
import type { useWorkspaceArtifacts } from "./use-workspace-artifacts";
import type { useWorkspacePlan } from "./use-workspace-plan";

export function useWorkspaceComposer({
	codebase,
	snapshotReady,
	isWorking,
	setIsWorking,
	setError,
	setActiveFeature,
	setPipelineStage,
	setFeatureTree,
	setTaskTree,
	setPrdContent,
	setAcContent,
	setChatAnswers,
	setChatMessages,
	effectiveFeatureId,
	onboardingFeatureId,
	artifactCount,
	isCreatingNew,
	setIsCreatingNew,
	setLastFeaturePrompt,
	fetchAiQuestions,
	runRevision,
}: {
	codebase: { id: string; name: string };
	snapshotReady: boolean;
	isWorking: boolean;
	setIsWorking: (working: boolean) => void;
	setError: (error: string | null) => void;
	setActiveFeature: ReturnType<typeof useWorkspacePlan>["setActiveFeature"];
	setPipelineStage: Dispatch<SetStateAction<CodebasePipelineStage>>;
	setFeatureTree: ReturnType<typeof useWorkspaceArtifacts>["setFeatureTree"];
	setTaskTree: ReturnType<typeof useWorkspaceArtifacts>["setTaskTree"];
	setPrdContent: ReturnType<typeof useWorkspaceArtifacts>["setPrdContent"];
	setAcContent: ReturnType<typeof useWorkspaceArtifacts>["setAcContent"];
	setChatAnswers: Dispatch<SetStateAction<Record<string, string>>>;
	setChatMessages: Dispatch<SetStateAction<ChatStreamMessage[]>>;
	effectiveFeatureId: string | null;
	onboardingFeatureId: string | null;
	artifactCount: number;
	isCreatingNew: boolean;
	setIsCreatingNew: (creating: boolean) => void;
	setLastFeaturePrompt: (prompt: string) => void;
	fetchAiQuestions: (id: string, prompt: string) => Promise<void>;
	runRevision: (instruction: string) => Promise<void>;
}) {
	const ensureFeatureInWorkspace = useCallback(
		async (message: string): Promise<string | null> => {
			const trimmed = message.trim();
			if (!snapshotReady || trimmed.length < 3 || isWorking) return null;
			setIsWorking(true);
			setError(null);
			try {
				const response = await fetch(
					`/api/codebases/${encodeURIComponent(codebase.id)}/features`,
					{
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ message: trimmed }),
					},
				);
				const body: unknown = await response.json().catch(() => null);
				if (
					!response.ok ||
					typeof body !== "object" ||
					body === null ||
					!("projectId" in body) ||
					typeof body.projectId !== "string"
				) {
					setError("Fitur gagal dibuat. Coba lagi.");
					return null;
				}
				const created = body as { projectId: string; name?: unknown };
				setActiveFeature({
					id: created.projectId,
					name:
						typeof created.name === "string" && created.name.trim()
							? created.name.trim()
							: codebase.name,
					featuresStatus: "pending",
				});
				setPipelineStage("questions");
				setFeatureTree(null);
				setTaskTree(null);
				setPrdContent(null);
				setAcContent(null);
				setChatAnswers({});
				return created.projectId;
			} catch {
				setError("Server tidak dapat dihubungi.");
				return null;
			} finally {
				setIsWorking(false);
			}
		},
		[
			snapshotReady,
			isWorking,
			codebase.id,
			codebase.name,
			setFeatureTree,
			setTaskTree,
			setPrdContent,
			setAcContent,
			setError,
			setIsWorking,
			setChatAnswers,
			setActiveFeature,
			setPipelineStage,
		],
	);
	const handleCreateFeature = useCallback(() => {
		setIsCreatingNew(true);
	}, [setIsCreatingNew]);
	const handleSendMessage = useCallback(
		async (message: string) => {
			const trimmed = message.trim();
			if (!trimmed || trimmed.length < 3) return;
			setChatMessages((current) => [
				...current,
				{ id: `user-${Date.now()}`, role: "user", content: trimmed },
			]);
			const activeIsAnchor =
				effectiveFeatureId != null &&
				effectiveFeatureId === onboardingFeatureId;
			const activeHasPlanning = artifactCount > 0;
			if (
				isCreatingNew ||
				!effectiveFeatureId ||
				(activeIsAnchor && !activeHasPlanning)
			) {
				setLastFeaturePrompt(trimmed);
				const projectId = await ensureFeatureInWorkspace(trimmed);
				if (projectId) {
					setIsCreatingNew(false);
					void fetchAiQuestions(projectId, trimmed);
				}
				return;
			}
			if (activeHasPlanning) {
				await runRevision(trimmed);
				return;
			}
			setLastFeaturePrompt(trimmed);
			void fetchAiQuestions(effectiveFeatureId, trimmed);
		},
		[
			artifactCount,
			effectiveFeatureId,
			ensureFeatureInWorkspace,
			fetchAiQuestions,
			isCreatingNew,
			onboardingFeatureId,
			runRevision,
			setLastFeaturePrompt,
			setIsCreatingNew,
			setChatMessages,
		],
	);
	return { handleCreateFeature, handleSendMessage };
}
