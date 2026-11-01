import { type Dispatch, type SetStateAction, useCallback, useRef } from "react";
import type { ChatStreamMessage } from "@/features/codebase/components/chat/codebase-chat-workspace";
import type { CodebasePipelineStage } from "@/features/codebase/services/chat-flow";
import type {
	ComposerOperationMode,
	ComposerSubmissionPayload,
} from "@/features/codebase/services/composer-interactions";
import type { RevisionTargetKind } from "@/features/codebase/services/revision-base-version.server";
import {
	type CodebaseComposerMode,
	normalizeComposerMode,
} from "@/features/codebase/services/revision-intent";
import type { ComposerReferenceBinding } from "../types/revision";
import type { useWorkspaceArtifacts } from "./use-workspace-artifacts";
import type { useWorkspacePlan } from "./use-workspace-plan";

export function useWorkspaceComposer({
	codebase,
	composerAvailable = true,
	composerMode = "plan",
	setComposerMode,
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
	resetFeatureWorkspace,
	registerCreatedPlan,
}: {
	codebase: { id: string; name: string };
	composerAvailable?: boolean;
	composerMode?: CodebaseComposerMode;
	setComposerMode?: (mode: ComposerOperationMode) => void;
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
	runRevision: (
		instruction: string,
		options?: {
			targetKind?: RevisionTargetKind;
			optionalReferences?: readonly string[];
			referenceBindings?: readonly ComposerReferenceBinding[];
		},
	) => Promise<void>;
	resetFeatureWorkspace: () => void;
	registerCreatedPlan: (plan: { id: string; name: string }) => void;
}) {
	const creationInFlight = useRef(false);
	const creationId = useRef<string | null>(null);
	const workspaceEpoch = useRef(0);
	const ensureFeatureInWorkspace = useCallback(
		async (message: string): Promise<string | null> => {
			const trimmed = message.trim();
			if (
				!snapshotReady ||
				trimmed.length < 3 ||
				isWorking ||
				creationInFlight.current
			)
				return null;
			const epoch = workspaceEpoch.current;
			creationId.current ??= crypto.randomUUID();
			creationInFlight.current = true;
			setIsWorking(true);
			setError(null);
			try {
				const response = await fetch(
					`/api/codebases/${encodeURIComponent(codebase.id)}/features`,
					{
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							message: trimmed,
							requestId: creationId.current,
						}),
					},
				);
				const body: unknown = await response.json().catch(() => null);
				if (workspaceEpoch.current !== epoch) return null;
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
				registerCreatedPlan({
					id: created.projectId,
					name: typeof created.name === "string" ? created.name : codebase.name,
				});
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
				if (workspaceEpoch.current !== epoch) return null;
				setError("Server tidak dapat dihubungi.");
				return null;
			} finally {
				creationInFlight.current = false;
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
			registerCreatedPlan,
		],
	);
	const handleCreateFeature = useCallback(() => {
		workspaceEpoch.current += 1;
		creationId.current = null;
		resetFeatureWorkspace();
		setActiveFeature(null);
		setIsCreatingNew(true);
		setComposerMode?.("plan");
	}, [
		resetFeatureWorkspace,
		setActiveFeature,
		setIsCreatingNew,
		setComposerMode,
	]);
	const handleSendMessage = useCallback(
		async (
			message: string,
			submission?: Partial<ComposerSubmissionPayload>,
		) => {
			const trimmed = message.trim();
			const effectiveMode = normalizeComposerMode(
				submission?.mode ?? composerMode,
			);
			const canRunExplicitCompletedRevision =
				effectiveMode === "revise" && submission?.mode === "revise";
			if (
				(!composerAvailable && !canRunExplicitCompletedRevision) ||
				!trimmed ||
				trimmed.length < 3 ||
				creationInFlight.current ||
				isWorking
			)
				return false;

			if (effectiveMode === "revise") {
				if (!effectiveFeatureId || artifactCount === 0) {
					setError("Belum ada dokumen yang bisa direvisi pada fitur ini.");
					return false;
				}
				setChatMessages((current) => [
					...current,
					{ id: `user-${Date.now()}`, role: "user", content: trimmed },
				]);
				await runRevision(trimmed, {
					targetKind: submission?.targetKind,
					optionalReferences: submission?.optionalReferences,
					referenceBindings: submission?.referenceBindings,
				});
				return true;
			}

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
				return projectId !== null;
			}
			setLastFeaturePrompt(trimmed);
			void fetchAiQuestions(effectiveFeatureId, trimmed);
			return true;
		},
		[
			artifactCount,
			composerAvailable,
			composerMode,
			effectiveFeatureId,
			ensureFeatureInWorkspace,
			fetchAiQuestions,
			isCreatingNew,
			isWorking,
			onboardingFeatureId,
			runRevision,
			setError,
			setLastFeaturePrompt,
			setIsCreatingNew,
			setChatMessages,
		],
	);
	const handleSubmitComposer = useCallback(
		(payload: ComposerSubmissionPayload) =>
			handleSendMessage(payload.message, payload),
		[handleSendMessage],
	);
	return {
		handleCreateFeature,
		handleSendMessage,
		handleSubmitComposer,
		invalidateCreation: () => {
			workspaceEpoch.current += 1;
			creationId.current = null;
		},
	};
}
