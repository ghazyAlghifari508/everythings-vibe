import { type Dispatch, type SetStateAction, useCallback, useRef } from "react";
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
import type { WorkspaceMessageInput } from "../types/workspace-timeline";
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
	persistMessage,
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
	persistMessage: (input: WorkspaceMessageInput) => Promise<unknown>;
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
			requestId?: string;
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
	const pendingMessage = useRef<{
		content: string;
		projectId: string;
		type: WorkspaceMessageInput["type"];
		stage: WorkspaceMessageInput["stage"];
		id: string;
	} | null>(null);
	const sending = useRef(false);
	const activeKey = `${codebase.id}:${effectiveFeatureId ?? "new"}:${isCreatingNew}`;
	const activeScope = useRef(activeKey);
	activeScope.current = activeKey;
	const persist = useCallback(
		async (
			projectId: string,
			content: string,
			type: WorkspaceMessageInput["type"],
			target?: RevisionTargetKind,
		) => {
			const stage =
				type === "user_message"
					? "questions"
					: target === "tasks"
						? "task"
						: (target ?? "prd");
			if (
				pendingMessage.current?.content !== content ||
				pendingMessage.current.projectId !== projectId ||
				pendingMessage.current.type !== type ||
				pendingMessage.current.stage !== stage
			)
				pendingMessage.current = {
					content,
					projectId,
					type,
					stage,
					id: crypto.randomUUID(),
				};
			const id = pendingMessage.current.id;
			await persistMessage({
				codebaseId: codebase.id,
				projectId,
				id,
				content,
				type,
				stage,
			});
			return id;
		},
		[codebase.id, persistMessage],
	);
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
			const explicitRevision =
				effectiveMode === "revise" && submission?.mode === "revise";
			if (
				(!composerAvailable && !explicitRevision) ||
				trimmed.length < 3 ||
				creationInFlight.current ||
				sending.current ||
				isWorking
			)
				return false;
			const key = activeKey;
			const epoch = workspaceEpoch.current;
			const isCurrent = () =>
				activeScope.current === key && workspaceEpoch.current === epoch;
			sending.current = true;
			try {
				if (effectiveMode === "revise") {
					if (!effectiveFeatureId || artifactCount === 0) {
						setError("Belum ada dokumen yang bisa direvisi pada fitur ini.");
						return false;
					}
					const requestId = await persist(
						effectiveFeatureId,
						trimmed,
						"revision_requested",
						submission?.targetKind,
					);
					if (!isCurrent()) return false;
					await runRevision(trimmed, {
						targetKind: submission?.targetKind,
						requestId,
						optionalReferences: submission?.optionalReferences,
						referenceBindings: submission?.referenceBindings,
					});
					pendingMessage.current = null;
					return isCurrent();
				}
				const activeIsAnchor =
					effectiveFeatureId != null &&
					effectiveFeatureId === onboardingFeatureId;
				if (
					isCreatingNew ||
					!effectiveFeatureId ||
					(activeIsAnchor && artifactCount === 0)
				) {
					setLastFeaturePrompt(trimmed);
					const projectId = await ensureFeatureInWorkspace(trimmed);
					if (!projectId) return false;
					setIsCreatingNew(false);
					void fetchAiQuestions(projectId, trimmed);
					return true;
				}
				await persist(effectiveFeatureId, trimmed, "user_message");
				if (!isCurrent()) return false;
				pendingMessage.current = null;
				setLastFeaturePrompt(trimmed);
				void fetchAiQuestions(effectiveFeatureId, trimmed);
				return true;
			} catch {
				if (isCurrent()) setError("Pesan belum tersimpan. Coba kirim ulang.");
				return false;
			} finally {
				sending.current = false;
			}
		},
		[
			activeKey,
			artifactCount,
			composerAvailable,
			composerMode,
			effectiveFeatureId,
			ensureFeatureInWorkspace,
			fetchAiQuestions,
			isCreatingNew,
			isWorking,
			onboardingFeatureId,
			persist,
			runRevision,
			setError,
			setLastFeaturePrompt,
			setIsCreatingNew,
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
