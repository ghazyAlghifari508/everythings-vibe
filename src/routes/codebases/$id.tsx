import { createFileRoute, redirect } from "@tanstack/react-router";
import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CodebaseArtifactCanvas } from "@/components/codebase/codebase-artifact-canvas";
import {
	type ChatStreamMessage,
	CodebaseChatWorkspace,
	type PipelineStage,
} from "@/components/codebase/codebase-chat-workspace";
import { CodebaseDocPreview } from "@/components/codebase/codebase-doc-preview";
import { CodebaseExplorerSidebar } from "@/components/codebase/codebase-explorer-sidebar";
import type { CodebaseArtifactRef } from "@/components/codebase/codebase-file-card";
import { CodebaseKanbanBoard } from "@/components/codebase/codebase-kanban-board";
import { stripInternalSectionMarkers } from "@/components/codebase/codebase-markdown";
import { CodebasePlanSwitcher } from "@/components/codebase/codebase-plan-switcher";
import { CodebaseResyncDrawer } from "@/components/codebase/codebase-resync-drawer";
import { CodebaseSourcePreview } from "@/components/codebase/codebase-source-preview";
import { CodebaseWorkspaceShell } from "@/components/codebase/codebase-workspace-shell";
import { CodebaseWorkspaceSkeleton } from "@/components/codebase/codebase-workspace-skeleton";
import { ScreenConnect } from "@/components/codebase/screen-connect";
import { ScreenIncompleteSync } from "@/components/codebase/screen-incomplete-sync";
import { FeatureMapCanvas } from "@/components/fitur/feature-map-canvas";
import { WhiteboardCanvas } from "@/components/task/whiteboard-canvas";
import { Logo } from "@/components/ui/logo";
import { useCodebaseSync } from "@/features/codebase/hooks/use-codebase-sync";
import { useWorkspaceArtifacts } from "@/features/codebase/hooks/use-workspace-artifacts";
import { useWorkspacePipeline } from "@/features/codebase/hooks/use-workspace-pipeline";
import { useWorkspacePlan } from "@/features/codebase/hooks/use-workspace-plan";
import { useWorkspaceQuestions } from "@/features/codebase/hooks/use-workspace-questions";
import { useWorkspaceSource } from "@/features/codebase/hooks/use-workspace-source";
import { loadCodebase } from "@/features/codebase/services/workspace-loader.functions";
import {
	buildAskHandoffAnswers,
	decideCodebaseDetailEntry,
	formatCodebaseSyncBadge,
} from "@/features/codebase/utils/workspace-contracts";
import { useKanbanTasks } from "@/hooks/use-kanban-polling";
import { codebaseStarterSuggestionsSchema } from "@/lib/codebase-analysis";
import {
	appendRunThinking,
	buildFeatureMessage,
	type CodebasePipelineStage,
	type CodebaseRunState,
	reconcilePipelineStage,
	resetRunThinking,
	resolvePersistedStage,
	runConfirmGenerate,
	serializeAskQuestions,
	setRunPhase,
	settleRun,
	shouldAutoRevealArtifact,
	startRun,
} from "@/lib/codebase-chat-flow";
import { artifactMimeTypeFor, downloadArtifact } from "@/lib/codebase-download";
import {
	assessRevisionImpact,
	buildRevisionRequest,
	type CodebaseComposerMode,
	describeRevisionImpact,
} from "@/lib/codebase-revision-intent";
import {
	emptyArtifactHydration,
	resolveWorkspaceView,
	type WorkspaceArtifactHydration,
} from "@/lib/codebase-workspace-hydration";
import { computeKanbanProgress } from "@/lib/kanban-utils";
import { consumeSseStream } from "@/lib/sse-consume";

export type {
	SnapshotFilePreviewResult,
	SourcePreviewState,
} from "@/features/codebase/types/source-preview";
export { toSourcePreviewState } from "@/features/codebase/types/source-preview";
export {
	buildAskHandoffAnswers,
	canRenderCodebaseReview,
	decideCodebaseDetailEntry,
	describeArtifactReadFailure,
	formatCodebaseSyncBadge,
	getCodebaseSessionRequestBody,
	resolveWorkspaceSnapshotReady,
} from "@/features/codebase/utils/workspace-contracts";

export const Route = createFileRoute("/codebases/$id")({
	loader: async ({ params }) => {
		if (decideCodebaseDetailEntry(params.id) === "deny")
			throw redirect({ to: "/codebases" });
		try {
			return await loadCodebase({ data: params.id });
		} catch (error) {
			if (error instanceof Error && error.message === "Unauthorized")
				throw redirect({ to: "/login" });
			throw error;
		}
	},
	head: ({ loaderData }) => ({
		meta: [{ title: loaderData?.codebase.name ?? "Codebase" }],
	}),
	component: CodebaseDetailPage,
	pendingComponent: CodebaseDetailPending,
	errorComponent: ({ error, reset }) => (
		<main className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
			<div
				role="alert"
				className="rounded-xl border border-crimson/40 bg-crimson/10 p-5 text-crimson"
			>
				<h1 className="text-lg font-semibold">Codebase tidak dapat dimuat</h1>
				<p className="mt-1 text-sm">
					{error instanceof Error && error.message === "NOT_FOUND"
						? "Codebase tidak ditemukan."
						: "Terjadi masalah saat membaca data codebase."}
				</p>
				<button
					type="button"
					onClick={reset}
					className="mt-4 min-h-11 rounded-md border border-crimson/50 px-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
				>
					Coba lagi
				</button>
			</div>
		</main>
	),
});

export function CodebaseDetailPending() {
	return <CodebaseWorkspaceSkeleton />;
}

function CodebaseDetailPage() {
	const {
		codebase,
		plans,
		onboardingFeatureId,
		currentSnapshotId,
		planningSnapshotByProject,
		analysis: initialAnalysis,
		hasStoredSnapshot,
		canOpenFullBoard,
	} = Route.useLoaderData();
	const {
		setRequestedProjectId,
		isCreatingNew,
		setIsCreatingNew,
		onboardingFeature,
		userFacingPlans,
		setActiveFeature,
		resolvedFeature,
		effectiveFeatureId,
		planState,
	} = useWorkspacePlan({ codebase, plans, onboardingFeatureId });
	const [chatMessages, setChatMessages] = useState<ChatStreamMessage[]>([]);
	/**
	 * The one in-flight or settled AI request for this workspace. Every stage
	 * (questions, Feature, PRD, AC, Task) records its real start, settle time,
	 * outcome, and the model's own streamed reasoning here, so the workspace
	 * shows exactly one honest Thinking surface per operation.
	 */
	const [run, setRun] = useState<CodebaseRunState | null>(null);
	const [isConfirming, setIsConfirming] = useState(false);
	const {
		analysis,
		activeWorkspaceSnapshotId,
		triggerAnalysis,
		isRefreshingStarterSuggestions,
		starterRefreshError,
		refreshStarterSuggestions,
		payload,
		isResyncDrawerOpen,
		setIsResyncDrawerOpen,
		status,
		error,
		setError,
		isStarting,
		isWorking,
		setIsWorking,
		readStatus,
		startSession,
		snapshotReady,
	} = useCodebaseSync({
		codebaseId: codebase.id,
		projectId: onboardingFeature?.id ?? null,
		currentSnapshotId,
		initialAnalysis,
		hasStoredSnapshot,
	});
	const {
		aiQuestions,
		setAiQuestions,
		chatAnswers,
		setChatAnswers,
		lastFeaturePrompt,
		setLastFeaturePrompt,
		fetchAiQuestions,
		handleSubmitAnswer,
	} = useWorkspaceQuestions(effectiveFeatureId, setRun);
	const [canvasOpen, setCanvasOpen] = useState(false);
	const [activeArtifactId, setActiveArtifactId] = useState<string | null>(null);
	const [canvasView, setCanvasView] = useState<"kanban" | "checklist">(
		"kanban",
	);
	const {
		prdContent,
		setPrdContent,
		prdLoading,
		prdError,
		setPrdError,
		acContent,
		setAcContent,
		acLoading,
		acError,
		setAcError,
		featureTree,
		setFeatureTree,
		taskTree,
		setTaskTree,
		artifactHydration,
		setArtifactHydration,
		activeProjectIdRef,
		loadPrd,
		loadAc,
		refreshFeatureTree,
		refreshTaskTree,
	} = useWorkspaceArtifacts(snapshotReady, effectiveFeatureId);
	const [pipelineStage, setPipelineStage] =
		useState<PipelineStage>("questions");
	const [stageBusy, setStageBusy] = useState<PipelineStage | null>(null);
	const [stageError, setStageError] = useState<string | null>(null);

	const kanban = useKanbanTasks({
		projectId: effectiveFeatureId ?? "",
		enabled: snapshotReady && Boolean(effectiveFeatureId),
	});
	const kanbanProgress = useMemo(() => {
		if (!kanban.data?.columns) return null;
		return computeKanbanProgress(kanban.data.columns);
	}, [kanban.data]);

	const hasTasksInDb = Boolean(
		(kanbanProgress && kanbanProgress.total > 0) || taskTree !== null,
	);

	// Tasks arrive from the Kanban query as well as the task tree, so the task
	// artifact's status is settled from both real sources. A tree that loaded
	// empty while live Kanban rows exist is still `ready`.
	const hydration: WorkspaceArtifactHydration = useMemo(() => {
		if (!hasTasksInDb || artifactHydration.tasks === "ready") {
			return artifactHydration;
		}
		if (artifactHydration.tasks === "empty") {
			return { ...artifactHydration, tasks: "ready" };
		}
		return artifactHydration;
	}, [artifactHydration, hasTasksInDb]);

	/**
	 * What the chat pane may show. Derived from the resolved plan plus the real
	 * per-artifact statuses, so a pending read is loading and a failed read is a
	 * reported failure — never the initial empty composer.
	 */
	const workspaceView = useMemo(
		() =>
			resolveWorkspaceView({
				plan: planState,
				artifacts: hydration,
				hasMessages: chatMessages.length > 0,
				hasQuestions: aiQuestions.length > 0,
				isSending: isWorking,
				runStatus: run?.status ?? "idle",
			}),
		[
			planState,
			hydration,
			chatMessages.length,
			aiQuestions.length,
			isWorking,
			run?.status,
		],
	);

	// The stage a reopened workspace resumes at is derived from the artifacts
	// that are actually persisted, so a refresh or History re-entry continues
	// where the project really is instead of restarting the pipeline. Presence
	// is read from each artifact's real hydration status, so a failed or still
	// pending read can never be mistaken for a missing artifact.
	const persistedStage: CodebasePipelineStage = resolvePersistedStage({
		feature: hydration.feature,
		prd: hydration.prd,
		ac: hydration.ac,
		tasks: hydration.tasks,
	});
	// Reconcile forward only: a slow task read still lifts the stage to handoff
	// after a fast feature read latched an earlier one, and no late or failed
	// read can ever rewind a stage the user has already left.
	const stage = reconcilePipelineStage(pipelineStage, persistedStage);
	useEffect(() => {
		setPipelineStage((current) =>
			reconcilePipelineStage(current, persistedStage),
		);
	}, [persistedStage]);

	const analysisOutput = analysis?.output ?? null;

	const {
		manifestFileCount,
		sourcePreview,
		selectSourceFile,
		clearSourcePreview,
		explorerFiles,
		explorerStack,
		contextFiles,
	} = useWorkspaceSource({
		codebaseId: codebase.id,
		snapshotReady,
		polledSnapshotId: status?.snapshotId,
		analysisOutput,
		setActiveArtifactId,
		setCanvasOpen,
	});
	const featureSlug = useMemo(() => {
		const base = (resolvedFeature?.name ?? codebase.name)
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 40);
		return base || "fitur";
	}, [resolvedFeature?.name, codebase.name]);
	const artifacts = useMemo<CodebaseArtifactRef[]>(() => {
		if (!resolvedFeature) return [];
		const list: CodebaseArtifactRef[] = [];
		if (featureTree) {
			list.push({
				id: `feature-${resolvedFeature.id}`,
				fileName: `feature-${featureSlug}.json`,
				fileSizeBytes: null,
				badge: "FITUR",
				description: `Spesifikasi fitur ${resolvedFeature.name}`,
			});
		}
		if (prdContent) {
			list.push({
				id: `prd-${resolvedFeature.id}`,
				fileName: `PRD-${featureSlug}.md`,
				fileSizeBytes: null,
				badge: "MARKDOWN",
				description: "Dokumen PRD 8 seksi",
			});
		}
		if (acContent) {
			list.push({
				id: `ac-${resolvedFeature.id}`,
				fileName: `AC-${featureSlug}.md`,
				fileSizeBytes: null,
				badge: "MARKDOWN",
				description: "Kriteria penerimaan formal",
			});
		}
		if (hasTasksInDb) {
			list.push({
				id: `tasks-${resolvedFeature.id}`,
				fileName: `tasks-${featureSlug}.json`,
				fileSizeBytes: null,
				badge: "KANBAN LIVE",
				description: "Task tree dan papan Kanban live",
			});
		}
		return list;
	}, [
		resolvedFeature,
		featureTree,
		featureSlug,
		hasTasksInDb,
		prdContent,
		acContent,
	]);
	/**
	 * What the next composer message means, mirroring `handleSendMessage` so
	 * the label above the composer always names the real target.
	 */
	const activeIsAnchorPlan =
		effectiveFeatureId != null && effectiveFeatureId === onboardingFeatureId;
	const activeHasPlanning = artifacts.length > 0;
	const composerMode: CodebaseComposerMode =
		isCreatingNew ||
		!effectiveFeatureId ||
		(activeIsAnchorPlan && !activeHasPlanning)
			? "create"
			: activeHasPlanning
				? "revise"
				: "clarify";
	const composerTargetName =
		composerMode === "create" ? null : (resolvedFeature?.name ?? null);
	const activeArtifact =
		artifacts.find((item) => item.id === activeArtifactId) ?? null;
	const isSourcePreviewOpen = sourcePreview.kind !== "idle";
	const sourcePreviewPath =
		sourcePreview.kind === "idle" ? "" : sourcePreview.path;
	const isPrdArtifactActive =
		!isSourcePreviewOpen &&
		Boolean(activeArtifact) &&
		resolvedFeature != null &&
		activeArtifact?.id === `prd-${resolvedFeature.id}`;
	const isAcArtifactActive =
		!isSourcePreviewOpen &&
		Boolean(activeArtifact) &&
		resolvedFeature != null &&
		activeArtifact?.id === `ac-${resolvedFeature.id}`;
	const isFeatureArtifactActive =
		!isSourcePreviewOpen &&
		Boolean(activeArtifact) &&
		resolvedFeature != null &&
		activeArtifact?.id === `feature-${resolvedFeature.id}`;
	const isTasksArtifactActive =
		!isSourcePreviewOpen &&
		Boolean(activeArtifact) &&
		resolvedFeature != null &&
		activeArtifact?.id === `tasks-${resolvedFeature.id}`;

	// One canonical copy target for the header toolbar. A truncated source
	// preview has no complete content to copy, so it resolves to null and the
	// action is disabled rather than copying a partial file as though it were
	// whole.
	const canvasCopy = useMemo((): {
		value: string | null;
		label?: string;
		unavailableReason?: string;
	} => {
		if (isSourcePreviewOpen) {
			if (sourcePreview.kind === "ready") {
				return sourcePreview.truncated
					? {
							value: null,
							label: "Salin isi sumber",
							unavailableReason:
								"Pratinjau dipotong — buka file di repository lokal untuk menyalin isi lengkap.",
						}
					: { value: sourcePreview.content, label: "Salin isi sumber" };
			}
			return { value: null };
		}
		if (!activeArtifact) return { value: null };
		if (activeArtifact.id.startsWith("feature-") && featureTree) {
			return { value: JSON.stringify(featureTree, null, 2) };
		}
		if (activeArtifact.id.startsWith("prd-") && prdContent) {
			return { value: stripInternalSectionMarkers(prdContent) };
		}
		if (activeArtifact.id.startsWith("ac-") && acContent) {
			return { value: stripInternalSectionMarkers(acContent) };
		}
		if (activeArtifact.id.startsWith("tasks-") && taskTree) {
			return { value: JSON.stringify(taskTree, null, 2) };
		}
		return { value: null };
	}, [
		isSourcePreviewOpen,
		sourcePreview,
		activeArtifact,
		featureTree,
		prdContent,
		acContent,
		taskTree,
	]);

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
				const newFeature = {
					id: created.projectId,
					name:
						typeof created.name === "string" && created.name.trim()
							? created.name.trim()
							: codebase.name,
					featuresStatus: "pending",
				};
				setActiveFeature(newFeature);
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
		],
	);

	/**
	 * Whether a revision would replace tasks the user already progressed. The
	 * impact is computed from the real Kanban rows, so the warning names actual
	 * counts and the confirmation gates the same data it describes.
	 */
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

	const [specError, setSpecError] = useState<string | null>(null);

	const pushAssistantMessage = useCallback((content: string) => {
		setChatMessages((current) => [
			...current,
			{
				id: `assistant-${Date.now()}`,
				role: "assistant" as const,
				content,
			},
		]);
	}, []);

	/**
	 * Whether the user has taken over the right panel since the last automatic
	 * reveal. A manual close or a different selection sets this, and an
	 * automatic reveal then stays out of the way instead of stealing focus
	 * mid-generation.
	 */
	const userTookOverCanvas = useRef(false);

	/**
	 * Reveal the artifact a finished stage produced.
	 *
	 * Only ever called after the artifact was reloaded from the authoritative
	 * server state, so the reveal can never be based on an assumed success. The
	 * user's own panel interaction always wins: once they open another artifact
	 * or close the panel, this stops moving the canvas.
	 */
	const openArtifactPreview = useCallback(
		(kind: "feature" | "prd" | "ac" | "tasks") => {
			if (
				!effectiveFeatureId ||
				!shouldAutoRevealArtifact({
					persisted: true,
					userTookOverCanvas: userTookOverCanvas.current,
				})
			) {
				return;
			}
			setActiveArtifactId(`${kind}-${effectiveFeatureId}`);
			if (kind === "tasks") setCanvasView("kanban");
			setCanvasOpen(true);
		},
		[effectiveFeatureId],
	);
	/**
	 * Revise the current feature plan.
	 *
	 * The request carries the user's own instruction plus an explicit scope
	 * bound, and the existing revision engine applies only the sections the
	 * request actually affects — a revision never rewrites the whole document.
	 * The result is appended as a new PRD version (the previous one stays
	 * readable), and the task list is never touched here: when the impact
	 * assessment says real task progress exists, the user must confirm before
	 * anything downstream is regenerated.
	 */
	const runRevision = useCallback(
		async (instruction: string) => {
			if (!effectiveFeatureId || stageBusy) return;
			setStageBusy("prd");
			setStageError(null);
			setRun(startRun("prd", Date.now()));
			try {
				const response = await fetch("/api/chat", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						projectId: effectiveFeatureId,
						mode: "revise",
						message: buildRevisionRequest({
							featureName: resolvedFeature?.name ?? codebase.name,
							instruction,
						}),
						displayMessage: instruction,
						// Only sent when the user saw the impact and accepted it, so
						// the server's ac/task lock keeps blocking every silent
						// revision of a locked document.
						...(revisionImpact.requiresTaskReplacementConfirmation
							? { confirmedImpact: true }
							: {}),
					}),
				});
				const result = await consumeSseStream(response, {
					onThinking: (text) =>
						setRun((current) => appendRunThinking(current, text)),
					onThinkingReset: () => setRun((current) => resetRunThinking(current)),
					onDelta: () =>
						setRun((current) => setRunPhase(current, "generating")),
				});
				if (result.error) {
					const failure = result.error;
					setStageError(failure);
					setRun((current) =>
						settleRun(current, "failed", Date.now(), failure),
					);
					return;
				}
				// The stream closing is not proof the revision was stored: reload
				// the authoritative document and only report success when the new
				// version is actually readable.
				const content = await loadPrd();
				if (!content) {
					const failure =
						"Revisi belum tersimpan di server. Coba kirim ulang permintaan.";
					setStageError(failure);
					setRun((current) =>
						settleRun(current, "failed", Date.now(), failure),
					);
					return;
				}
				setRun((current) => settleRun(current, "done", Date.now()));
				pushAssistantMessage(
					`Revisi untuk ${resolvedFeature?.name ?? "fitur"} sudah diterapkan sebagai versi PRD baru. Dokumen versi sebelumnya tetap tersimpan.`,
				);
				openArtifactPreview("prd");
			} catch {
				const failure = "Server tidak dapat dihubungi. Coba lagi.";
				setStageError(failure);
				setRun((current) => settleRun(current, "failed", Date.now(), failure));
			} finally {
				setStageBusy(null);
			}
		},
		[
			effectiveFeatureId,
			stageBusy,
			resolvedFeature?.name,
			codebase.name,
			revisionImpact.requiresTaskReplacementConfirmation,
			loadPrd,
			pushAssistantMessage,
			openArtifactPreview,
		],
	);

	const handleCreateFeature = useCallback(() => {
		setIsCreatingNew(true);
	}, [setIsCreatingNew]);

	/**
	 * Direct a new composer message without ever asking what it is for.
	 *
	 * A message in a user-facing plan stays with that plan: it revises real
	 * planning, or clarifies a draft that has none yet. A new project is only
	 * created from the explicit "Buat fitur baru" action, from an empty
	 * repository, or from the onboarding anchor that still carries no planning
	 * — never silently from an ambiguous message in an existing plan.
	 */
	const handleSendMessage = useCallback(
		async (message: string) => {
			const trimmed = message.trim();
			if (!trimmed || trimmed.length < 3) return;
			setChatMessages((current) => [
				...current,
				{
					id: `user-${Date.now()}`,
					role: "user" as const,
					content: trimmed,
				},
			]);
			const activeIsAnchor =
				effectiveFeatureId != null &&
				effectiveFeatureId === onboardingFeatureId;
			const activeHasPlanning = artifacts.length > 0;
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
			artifacts.length,
			effectiveFeatureId,
			ensureFeatureInWorkspace,
			fetchAiQuestions,
			isCreatingNew,
			onboardingFeatureId,
			runRevision,
			setLastFeaturePrompt,
			setIsCreatingNew,
		],
	);

	const handleConfirmGenerate = useCallback(async () => {
		if (!effectiveFeatureId || isConfirming) return;
		setIsConfirming(true);
		setSpecError(null);
		setStageError(null);
		setRun(startRun("feature", Date.now()));
		try {
			const answersList = buildAskHandoffAnswers(chatAnswers, aiQuestions);
			const outcome = await runConfirmGenerate({
				// Persistence is a hard precondition for generation: an unsaved
				// handoff would leave the Feature/PRD/AC/Task generators without
				// the user's answers, so a failed save blocks generation.
				saveHandoff: async () => {
					try {
						const response = await fetch("/api/ask/options", {
							method: "POST",
							headers: { "Content-Type": "application/json" },
							body: JSON.stringify({
								projectId: effectiveFeatureId,
								action: "save-handoff",
								handoff: {
									projectId: effectiveFeatureId,
									answers: answersList,
									state: {
										prompt:
											lastFeaturePrompt.trim() ||
											resolvedFeature?.name ||
											"Fitur baru",
										platform: "web",
										session: 1,
										questions: serializeAskQuestions(aiQuestions),
									},
								},
							}),
						});
						return response.ok;
					} catch {
						return false;
					}
				},
				generateFeature: async () => {
					try {
						const response = await fetch("/api/features/generate", {
							method: "POST",
							headers: { "Content-Type": "application/json" },
							body: JSON.stringify({ projectId: effectiveFeatureId }),
						});
						return { status: response.status };
					} catch {
						return { status: 0 };
					}
				},
				// A 200 alone does not prove the artifact persisted: reload the
				// authoritative tree and only advance when it is actually there.
				reloadFeatureTree: () => refreshFeatureTree(effectiveFeatureId),
			});

			if (outcome.kind === "handoff_failed") {
				const message =
					"Jawaban gagal disimpan, jadi spesifikasi tidak dibuat. Coba lagi.";
				setSpecError(message);
				setRun((current) => settleRun(current, "failed", Date.now(), message));
				return;
			}
			if (outcome.kind === "spec_failed") {
				const message = "Spesifikasi fitur gagal dibuat. Coba lagi.";
				setSpecError(message);
				setRun((current) => settleRun(current, "failed", Date.now(), message));
				return;
			}
			if (outcome.kind === "generating") {
				// The server still owns the in-flight generation: this is not a
				// finished run, so the Thinking surface stays running until the
				// persisted tree can actually be reloaded.
				pushAssistantMessage(
					`Pohon fitur ${resolvedFeature?.name ?? "fitur"} sedang disusun. Tunggu sebentar lalu klik Buat Spesifikasi Fitur lagi untuk memuat hasilnya.`,
				);
				setRun((current) =>
					settleRun(
						current,
						"failed",
						Date.now(),
						"Generasi masih berjalan di server. Coba muat ulang sebentar lagi.",
					),
				);
				return;
			}
			if (outcome.kind === "not_persisted") {
				const message =
					"Spesifikasi fitur belum tersimpan di server. Coba lagi sebentar lagi.";
				setSpecError(message);
				setRun((current) => settleRun(current, "failed", Date.now(), message));
				return;
			}
			setPipelineStage("feature");
			setRun((current) => settleRun(current, "done", Date.now()));
			const specMessage = buildFeatureMessage(
				resolvedFeature?.name ?? codebase.name,
				chatAnswers,
			);
			pushAssistantMessage(
				`Pohon fitur ${resolvedFeature?.name ?? "fitur"} berhasil disusun dari jawaban Anda: ${specMessage}`,
			);
			// The artifact is confirmed persisted (the tree reloaded above), so
			// the canvas opens on it. A manual panel interaction is respected by
			// openArtifactPreview, which never fights the user for focus.
			openArtifactPreview("feature");
		} finally {
			setIsConfirming(false);
		}
	}, [
		effectiveFeatureId,
		isConfirming,
		chatAnswers,
		aiQuestions,
		lastFeaturePrompt,
		resolvedFeature?.name,
		codebase.name,
		refreshFeatureTree,
		pushAssistantMessage,
		openArtifactPreview,
	]);

	const runPipelineStage = useWorkspacePipeline({
		effectiveFeatureId,
		stageBusy,
		activeProjectIdRef,
		setStageBusy,
		setStageError,
		setRun,
	});

	const handleGeneratePrd = useCallback(() => {
		if (!effectiveFeatureId) return;
		const message = buildFeatureMessage(
			resolvedFeature?.name ?? codebase.name,
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
					`PRD 8 seksi untuk ${resolvedFeature?.name ?? "fitur"} siap.`,
				);
				openArtifactPreview("prd");
				return true;
			},
		);
	}, [
		effectiveFeatureId,
		resolvedFeature?.name,
		codebase.name,
		chatAnswers,
		runPipelineStage,
		loadPrd,
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
					`Acceptance Criteria untuk ${resolvedFeature?.name ?? "fitur"} siap.`,
				);
				openArtifactPreview("ac");
				return true;
			},
		);
	}, [
		effectiveFeatureId,
		resolvedFeature?.name,
		runPipelineStage,
		loadAc,
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
				await kanban.refetch();
				const persistedTaskTree = await refreshTaskTree(effectiveFeatureId);
				if (!persistedTaskTree) {
					setStageError(
						"Task belum tersimpan di server. Coba breakdown task ulang.",
					);
					return false;
				}
				setPipelineStage("handoff");
				pushAssistantMessage(
					`Task untuk ${resolvedFeature?.name ?? "fitur"} sudah tersimpan dan papan Kanban aktif.`,
				);
				openArtifactPreview("tasks");
				return true;
			},
		);
	}, [
		effectiveFeatureId,
		resolvedFeature?.name,
		runPipelineStage,
		kanban,
		refreshTaskTree,
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

	const handleDownloadArtifact = useCallback(
		(artifact: CodebaseArtifactRef) => {
			if (!resolvedFeature) return;
			const isJson = artifact.fileName.toLowerCase().endsWith(".json");
			if (isJson) {
				if (artifact.id.startsWith("feature-") && featureTree) {
					downloadArtifact({
						fileName: artifact.fileName,
						content: JSON.stringify(featureTree, null, 2),
						mimeType: artifactMimeTypeFor(artifact.fileName),
					});
				}
				if (artifact.id.startsWith("tasks-") && taskTree) {
					downloadArtifact({
						fileName: artifact.fileName,
						content: JSON.stringify(taskTree, null, 2),
						mimeType: artifactMimeTypeFor(artifact.fileName),
					});
				}
				return;
			}
			if (artifact.id.startsWith("prd-") && prdContent) {
				downloadArtifact({
					fileName: artifact.fileName,
					content: stripInternalSectionMarkers(prdContent),
					mimeType: artifactMimeTypeFor(artifact.fileName),
				});
			}
			if (artifact.id.startsWith("ac-") && acContent) {
				downloadArtifact({
					fileName: artifact.fileName,
					content: stripInternalSectionMarkers(acContent),
					mimeType: artifactMimeTypeFor(artifact.fileName),
				});
			}
		},
		[resolvedFeature, featureTree, taskTree, prdContent, acContent],
	);

	if (snapshotReady) {
		const kanbanColumns = kanban.data?.columns ?? null;
		return (
			<main
				data-testid="codebase-workspace-page"
				className="flex h-dvh flex-col overflow-hidden bg-onyx text-snow"
			>
				<header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-graphite bg-charcoal px-4">
					<div className="flex min-w-0 items-center gap-2">
						<Logo height={22} />
						<span aria-hidden="true" className="shrink-0 text-slate">
							/
						</span>
						<span className="flex min-w-0 items-center gap-1.5 rounded-md border border-graphite bg-obsidian px-2 py-1 font-mono text-xs text-mist">
							<span className="truncate">{codebase.name}</span>
						</span>
					</div>
					<div className="flex shrink-0 items-center gap-2">
						<button
							type="button"
							data-testid="codebase-resync-action"
							onClick={() => {
								setIsResyncDrawerOpen(true);
								if (!payload) {
									void startSession("retry");
								}
							}}
							disabled={isStarting}
							className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-graphite bg-obsidian px-2.5 font-mono text-[11px] text-fog transition hover:text-snow disabled:cursor-wait disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
						>
							<RefreshCw size={12} aria-hidden />
							{isStarting ? "Menyiapkan..." : "Sync ulang"}
						</button>
						<span
							data-testid="codebase-sync-badge"
							className="shrink-0 rounded-md border border-graphite bg-obsidian px-2.5 py-1 font-mono text-[11px] text-fog"
						>
							{formatCodebaseSyncBadge(status?.fileCount ?? manifestFileCount)}
						</span>
					</div>
				</header>
				{error && (
					<div
						role="alert"
						className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-crimson/40 bg-crimson/10 px-4 py-2 text-xs text-crimson"
					>
						<span>{error}</span>
						<button
							type="button"
							onClick={() => void readStatus()}
							className="min-h-9 rounded-md border border-crimson/50 px-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
						>
							Coba lagi
						</button>
					</div>
				)}
				<CodebaseResyncDrawer
					isOpen={isResyncDrawerOpen}
					onClose={() => setIsResyncDrawerOpen(false)}
					projectName={codebase.name}
					payload={payload}
					isStarting={isStarting}
					status={status}
					statusError={error}
					onRequestNewToken={() => void startSession("retry")}
					onRetrySync={() => void startSession("retry")}
					analysis={analysis}
					isAnalyzing={isWorking}
					onRetryAnalysis={
						activeWorkspaceSnapshotId
							? () => void triggerAnalysis(activeWorkspaceSnapshotId)
							: undefined
					}
				/>
				<div className="min-h-0 flex-1">
					<CodebaseWorkspaceShell
						canvasOpen={canvasOpen}
						leftPane={
							<CodebaseExplorerSidebar
								files={explorerFiles}
								stack={explorerStack}
								codebaseId={codebase.id}
								onSelectFile={selectSourceFile}
							/>
						}
						chatPane={
							<CodebaseChatWorkspace
								featureName={resolvedFeature?.name ?? codebase.name}
								view={workspaceView}
								planSwitcher={
									userFacingPlans.length > 0 ? (
										<CodebasePlanSwitcher
											plans={userFacingPlans}
											activePlanId={effectiveFeatureId}
											activePlanName={resolvedFeature?.name ?? null}
											onSelectPlan={(projectId) => {
												setIsCreatingNew(false);
												setRequestedProjectId(projectId);
												// A different plan is a different set of artifacts:
												// drop the previous plan's content and mark every
												// artifact unread so nothing from the old plan can
												// be shown as if it belonged to the new one.
												setActiveFeature(null);
												setFeatureTree(null);
												setTaskTree(null);
												setPrdContent(null);
												setAcContent(null);
												setPrdError(null);
												setAcError(null);
												setAiQuestions([]);
												setChatAnswers({});
												setChatMessages([]);
												setRun(null);
												setStageError(null);
												setSpecError(null);
												setActiveArtifactId(null);
												setCanvasOpen(false);
												setArtifactHydration(emptyArtifactHydration());
												setPipelineStage("questions");
											}}
											onCreateFeature={handleCreateFeature}
										/>
									) : null
								}
								contextFiles={contextFiles}
								fileCount={status?.fileCount ?? manifestFileCount ?? undefined}
								kanbanProgress={kanbanProgress}
								messages={chatMessages}
								questions={aiQuestions}
								answers={chatAnswers}
								run={run}
								composerMode={composerMode}
								composerTargetName={composerTargetName}
								revisionImpactNotice={describeRevisionImpact(revisionImpact)}
								artifacts={artifacts}
								activeArtifactId={activeArtifactId}
								projectIdForHandoff={hasTasksInDb ? effectiveFeatureId : null}
								stage={stage}
								stageBusy={stageBusy}
								stageError={stageError}
								tasksUnresolved={hydration.tasks !== "empty"}
								codebaseName={codebase.name}
								planningSnapshotId={
									effectiveFeatureId
										? (planningSnapshotByProject[effectiveFeatureId] ?? null)
										: null
								}
								currentSnapshotId={activeWorkspaceSnapshotId}
								onReviewPlan={() => {
									// Reviewing is a read: it reveals the stored plan and
									// never regenerates anything.
									userTookOverCanvas.current = true;
									if (resolvedFeature && featureTree) {
										setActiveArtifactId(`feature-${resolvedFeature.id}`);
										setCanvasOpen(true);
									}
								}}
								starterSuggestions={analysisOutput?.starterSuggestions}
								starterRefresh={
									analysis?.status === "ready" &&
									analysis.output &&
									!codebaseStarterSuggestionsSchema.safeParse(
										analysis.output.starterSuggestions,
									).success &&
									analysis.projectId === onboardingFeature?.id &&
									analysis.snapshotId === activeWorkspaceSnapshotId
										? {
												analysisId: analysis.id,
												snapshotId: analysis.snapshotId,
												status: analysis.status,
												isRefreshing: isRefreshingStarterSuggestions,
												error: starterRefreshError,
											}
										: undefined
								}
								newerAttemptFailure={
									analysis &&
									status?.analysisAttemptStatus === "failed" &&
									status.snapshotId === analysis.snapshotId &&
									status.analysisAttemptId !== analysis.id
										? { errorMessage: status.errorMessage ?? null }
										: null
								}
								onRefreshStarterSuggestions={refreshStarterSuggestions}
								isSending={isWorking}
								isConfirming={isConfirming}
								specError={specError}
								onOpenArtifact={(artifact) => {
									// An explicit user choice owns the panel from now on.
									userTookOverCanvas.current = true;
									clearSourcePreview();
									setActiveArtifactId(artifact.id);
									if (
										resolvedFeature &&
										artifact.id === `tasks-${resolvedFeature.id}`
									) {
										setCanvasView("kanban");
									}
									setCanvasOpen(true);
								}}
								onDownloadArtifact={handleDownloadArtifact}
								onSubmitAnswer={handleSubmitAnswer}
								onSendMessage={(message) => void handleSendMessage(message)}
								onConfirmGenerate={() => void handleConfirmGenerate()}
								onRetryGenerate={() => void handleConfirmGenerate()}
								onRetryStage={() => void handleRetryStage()}
								onGeneratePrd={() => void handleGeneratePrd()}
								onGenerateAc={() => void handleGenerateAc()}
								onGenerateTask={() => void handleGenerateTask()}
								onRetryQuestions={() => {
									if (effectiveFeatureId && lastFeaturePrompt)
										void fetchAiQuestions(
											effectiveFeatureId,
											lastFeaturePrompt,
										);
								}}
							/>
						}
						canvasPane={
							<CodebaseArtifactCanvas
								fileName={
									isSourcePreviewOpen
										? sourcePreviewPath
										: (activeArtifact?.fileName ?? "Preview artefak")
								}
								badge={
									isSourcePreviewOpen
										? "SUMBER"
										: (activeArtifact?.badge ?? "PRATINJAU")
								}
								copyValue={canvasCopy.value}
								copyLabel={canvasCopy.label}
								copyUnavailableReason={canvasCopy.unavailableReason}
								onClose={() => {
									// Closing the panel is a deliberate user action: the
									// workspace stops auto-revealing artifacts after it.
									userTookOverCanvas.current = true;
									setCanvasOpen(false);
								}}
								onDownload={
									!isSourcePreviewOpen && activeArtifact
										? () => handleDownloadArtifact(activeArtifact)
										: undefined
								}
								isLoading={
									(sourcePreview.kind === "loading" && isSourcePreviewOpen) ||
									(isPrdArtifactActive && prdLoading) ||
									(isAcArtifactActive && acLoading)
								}
								error={
									isSourcePreviewOpen && sourcePreview.kind === "failed"
										? sourcePreview.message
										: isPrdArtifactActive
											? prdError
											: isAcArtifactActive
												? acError
												: null
								}
								onRetry={
									isSourcePreviewOpen && sourcePreview.kind === "failed"
										? () => selectSourceFile(sourcePreview.path)
										: isPrdArtifactActive
											? () => void loadPrd()
											: isAcArtifactActive
												? () => void loadAc()
												: undefined
								}
								subnav={
									isTasksArtifactActive ? (
										<>
											<fieldset
												aria-label="Mode tampilan task"
												className="flex rounded-md border border-graphite bg-obsidian p-0.5"
											>
												<legend className="sr-only">Mode tampilan task</legend>
												<button
													type="button"
													onClick={() => setCanvasView("kanban")}
													aria-pressed={canvasView === "kanban"}
													className={`min-h-8 rounded px-2.5 text-[11px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo ${
														canvasView === "kanban"
															? "bg-steel/40 text-snow"
															: "text-fog hover:text-snow"
													}`}
												>
													Papan Kanban
												</button>
												<button
													type="button"
													onClick={() => setCanvasView("checklist")}
													aria-pressed={canvasView === "checklist"}
													className={`min-h-8 rounded px-2.5 text-[11px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo ${
														canvasView === "checklist"
															? "bg-steel/40 text-snow"
															: "text-fog hover:text-snow"
													}`}
												>
													Checklist Tree
												</button>
											</fieldset>
											<span className="font-mono text-[10px] text-slate">
												{kanban.staleness === "live"
													? "Live dari database"
													: "Data terakhir"}
											</span>
										</>
									) : undefined
								}
							>
								{isSourcePreviewOpen ? (
									sourcePreview.kind === "ready" ? (
										<CodebaseSourcePreview
											key={sourcePreview.path}
											path={sourcePreview.path}
											content={sourcePreview.content}
											truncated={sourcePreview.truncated}
											sizeBytes={sourcePreview.sizeBytes}
										/>
									) : sourcePreview.kind === "unsupported" ? (
										<div
											data-testid="codebase-source-unsupported"
											className="flex h-full flex-col items-start justify-center gap-2 p-2"
										>
											<p className="text-sm font-semibold text-snow">
												Pratinjau tidak tersedia
											</p>
											<p className="max-w-sm text-xs leading-5 text-fog">
												{sourcePreview.path} bukan berkas teks atau melebihi
												batas tampilan. Buka di repository lokal untuk
												membacanya.
											</p>
										</div>
									) : sourcePreview.kind === "unavailable" ? (
										<div
											data-testid="codebase-source-unavailable"
											className="flex h-full flex-col items-start justify-center gap-2 p-2"
										>
											<p className="text-sm font-semibold text-snow">
												File tidak ada di snapshot ini
											</p>
											<p className="max-w-sm text-xs leading-5 text-fog">
												{sourcePreview.path} tidak pernah ter-sync, atau
												snapshot sudah diganti. Sinkronkan ulang repository
												untuk melihat isinya.
											</p>
										</div>
									) : null
								) : !activeArtifact || !resolvedFeature ? (
									<div className="flex h-full flex-col items-start justify-center gap-3 p-2">
										<p className="text-sm font-semibold text-snow">
											Belum ada artefak terpilih
										</p>
										<p className="max-w-sm text-xs leading-5 text-fog">
											Pilih file di panel kiri untuk membaca sourcecode, atau
											FileCard di kolom chat untuk preview dokumen atau papan
											Kanban langsung di sini.
										</p>
									</div>
								) : isPrdArtifactActive ? (
									prdContent ? (
										<CodebaseDocPreview content={prdContent} />
									) : null
								) : isAcArtifactActive ? (
									acContent ? (
										<CodebaseDocPreview content={acContent} />
									) : null
								) : isTasksArtifactActive ? (
									canvasView === "kanban" ? (
										<CodebaseKanbanBoard
											projectId={resolvedFeature.id}
											codebaseId={codebase.id}
											columns={kanbanColumns}
											staleness={kanban.staleness}
											isLoadingExternal={kanban.isLoading}
											isErrorExternal={kanban.isError}
											onRetryExternal={() => void kanban.refetch()}
											canOpenFullBoard={canOpenFullBoard}
										/>
									) : (
										<div
											data-testid="codebase-checklist-tree"
											className="h-full min-h-0"
										>
											<WhiteboardCanvas
												projectName={resolvedFeature.name}
												taskTree={taskTree}
												featureTree={featureTree}
											/>
										</div>
									)
								) : isFeatureArtifactActive ? (
									<div className="h-full min-h-0">
										<FeatureMapCanvas
											productName={resolvedFeature.name}
											featureTree={featureTree}
										/>
									</div>
								) : (
									<div className="flex flex-col gap-3">
										<div className="rounded-lg border border-graphite bg-charcoal p-3">
											<p className="font-mono text-[11px] uppercase tracking-wider text-slate">
												Fitur
											</p>
											<p className="mt-1 text-sm font-semibold text-snow">
												{resolvedFeature.name}
											</p>
											<p className="mt-1 font-mono text-[11px] text-fog">
												Project: {resolvedFeature.id}
											</p>
											{status?.snapshotId ? (
												<p className="mt-1 font-mono text-[11px] text-fog">
													Snapshot: {status.snapshotId}
												</p>
											) : null}
										</div>
										{analysisOutput?.impactAreas &&
										analysisOutput.impactAreas.length > 0 ? (
											<div className="rounded-lg border border-graphite bg-charcoal p-3">
												<p className="font-mono text-[11px] uppercase tracking-wider text-slate">
													Area dampak terdeteksi
												</p>
												<ul className="mt-1.5 flex list-disc flex-col gap-1 pl-5 text-xs leading-5 text-fog">
													{analysisOutput.impactAreas.map((area) => (
														<li key={area}>{area}</li>
													))}
												</ul>
											</div>
										) : null}
										<p className="text-xs leading-5 text-fog">
											Jawab pertanyaan klarifikasi di kolom chat, lalu pilih
											Lanjut Bikin Fitur untuk menyusun spesifikasi.
										</p>
									</div>
								)}
							</CodebaseArtifactCanvas>
						}
					/>
				</div>
			</main>
		);
	}

	return (
		<main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10 sm:px-6 sm:py-14">
			<header className="border-b border-graphite pb-6">
				<p className="font-mono text-xs uppercase tracking-widest text-fog">
					Codebase / {codebase.name}
				</p>
				<h1 className="mt-2 text-3xl font-semibold tracking-tight text-snow">
					Konteks repository
				</h1>
				<p className="mt-2 max-w-2xl text-sm leading-6 text-fog">
					Hubungkan repository, tunggu snapshot terverifikasi, lalu rencanakan
					fitur baru dengan konteks yang nyata.
				</p>
			</header>
			{error && (
				<div
					role="alert"
					className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-crimson/40 bg-crimson/10 p-4 text-sm text-crimson"
				>
					<span>{error}</span>
					<button
						type="button"
						onClick={() => {
							if (status?.analysisStatus === "failed" && status.snapshotId) {
								void triggerAnalysis(status.snapshotId);
							} else if (
								status?.status === "failed" ||
								status?.status === "expired"
							) {
								void startSession("retry");
							} else if (status) {
								void readStatus();
							} else {
								void startSession("initial");
							}
						}}
						className="min-h-11 rounded-md border border-crimson/50 px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
					>
						Coba lagi
					</button>
				</div>
			)}
			{payload !== null || isStarting ? (
				<ScreenConnect
					projectName={codebase.name}
					payload={payload}
					isStarting={isStarting}
					status={status}
					onRequestNewToken={() => void startSession("retry")}
					onRetrySync={() => void startSession("retry")}
				/>
			) : (
				<ScreenIncompleteSync
					projectName={codebase.name}
					isStarting={isStarting}
					onStartSync={() => void startSession("retry")}
				/>
			)}
		</main>
	);
}
