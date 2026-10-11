import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
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
import {
	parseVersionRows,
	selectLatestVersionContent,
} from "@/components/codebase/codebase-markdown";
import { CodebaseSourcePreview } from "@/components/codebase/codebase-source-preview";
import { CodebaseWorkspaceShell } from "@/components/codebase/codebase-workspace-shell";
import { CodebaseWorkspaceSkeleton } from "@/components/codebase/codebase-workspace-skeleton";
import { ScreenConnect } from "@/components/codebase/screen-connect";
import { ScreenIncompleteSync } from "@/components/codebase/screen-incomplete-sync";
import { FeatureMapCanvas } from "@/components/fitur/feature-map-canvas";
import { WhiteboardCanvas } from "@/components/task/whiteboard-canvas";
import { Logo } from "@/components/ui/logo";
import type { ProjectFeatureTree } from "@/db/schema";
import { useKanbanTasks } from "@/hooks/use-kanban-polling";
import {
	type AnalysisResponse,
	codebaseStarterSuggestionsSchema,
	safeParseCodebaseAnalysis,
} from "@/lib/codebase-analysis";
import {
	type LatestAttempt,
	resolveWorkspaceSnapshotIdentity,
	selectWorkspaceAnalysis,
	shouldDiscardWorkspaceAnalysis,
} from "@/lib/codebase-analysis-selection";
import { resolveOnboardingAnchorProject } from "@/lib/codebase-anchor";
import {
	type AdaptiveQuestion,
	appendRunThinking,
	buildFeatureMessage,
	type CodebasePipelineStage,
	type CodebaseRunStage,
	type CodebaseRunState,
	mapAskQuestionsToAdaptive,
	parseRestoredAnswers,
	parseRestoredQuestions,
	resetRunThinking,
	resolveResumeStage,
	restoreAskState,
	runConfirmGenerate,
	serializeAskQuestions,
	settleRun,
	shouldAutoRevealArtifact,
	startRun,
} from "@/lib/codebase-chat-flow";
import { artifactMimeTypeFor, downloadArtifact } from "@/lib/codebase-download";
import {
	assessRevisionImpact,
	buildRevisionRequest,
	type CodebaseChatIntent,
	describeRevisionImpact,
	resolveIntentOptions,
} from "@/lib/codebase-revision-intent";
import {
	detectStackFromPackageJsonText,
	manifestToExplorerFiles,
	mergeStackWithFallback,
} from "@/lib/codebase-stack";
import {
	getPendingSyncPayloadKey,
	SNAPSHOT_CONTEXT_STATUSES,
	type SyncPromptPayload,
	type SyncStatusResponse,
	syncPromptPayloadSchema,
	syncStatusResponseSchema,
} from "@/lib/codebase-sync";
import {
	matchesWorkspaceAnalysis,
	shouldFetchWorkspaceAnalysis,
} from "@/lib/codebase-workspace-analysis";
import { CODEBASE_SYNC_POLL_INTERVAL_MS } from "@/lib/constants";
import { computeKanbanProgress } from "@/lib/kanban-utils";
import { validateAskQuestions } from "@/lib/services/ask-service";
import type { TaskTree } from "@/lib/services/task-service";
import { requireUserServer } from "@/lib/session";
import { consumeSseStream } from "@/lib/sse-consume";

export function decideCodebaseDetailEntry(
	codebaseId: string | undefined,
): "allow" | "deny" {
	return codebaseId?.trim() ? "allow" : "deny";
}

type CodebaseSessionStartAction = "initial" | "retry";

export function getCodebaseSessionRequestBody(
	action: CodebaseSessionStartAction,
): { action?: "retry" } {
	return action === "retry" ? { action: "retry" } : {};
}

export function buildAskHandoffAnswers(
	chatAnswers: Record<string, string>,
	questions: Array<{ id: string; title: string }>,
): Array<{ question: string; answer: string }> {
	return Object.entries(chatAnswers)
		.map(([questionId, answer]) => {
			const questionText =
				questions.find((q) => q.id === questionId)?.title ?? questionId;
			return {
				question: questionText.trim() || questionId,
				answer: answer.trim(),
			};
		})
		.filter((entry) => entry.answer.length > 0 && entry.question.length > 0);
}

export function canRenderCodebaseReview(
	analysis: Pick<AnalysisResponse, "snapshotId" | "output"> | null,
	status: Pick<SyncStatusResponse, "status" | "snapshotId"> | null,
): boolean {
	return Boolean(
		analysis?.output &&
			status?.snapshotId &&
			SNAPSHOT_CONTEXT_STATUSES.includes(status.status) &&
			analysis.snapshotId === status.snapshotId,
	);
}

export function formatCodebaseSyncBadge(
	fileCount: number | null | undefined,
): string {
	return typeof fileCount === "number"
		? `${fileCount} file tersinkron`
		: "Menunggu snapshot";
}

export function resolveWorkspaceSnapshotReady(input: {
	status?: Pick<SyncStatusResponse, "status" | "snapshotId"> | null;
	hasStoredSnapshot: boolean;
}): boolean {
	return (
		Boolean(
			input.status?.snapshotId &&
				SNAPSHOT_CONTEXT_STATUSES.includes(input.status.status),
		) || input.hasStoredSnapshot
	);
}

const loadCodebase = createServerFn({ method: "GET" })
	.validator((id: string) => id)
	.handler(async ({ data: id }) => {
		const user = await requireUserServer();
		const { db } = await import("@/db");
		const { codebases, codebaseAnalyses, codebaseSnapshots, projects } =
			await import("@/db/schema");
		const { and, desc, eq, inArray, isNull } = await import("drizzle-orm");
		// Resolved on the server with the rest of the loader data: the workspace
		// needs it to decide whether the full Kanban route will open for this
		// account, and the route already gates that same decision server-side.
		const { hasFullWorkflow } = await import("@/lib/credits");
		const { getUserPlanAndQuota } = await import("@/lib/session");
		const { plan } = await getUserPlanAndQuota();
		const canOpenFullBoard = hasFullWorkflow(plan);
		const [codebase] = await db
			.select({
				id: codebases.id,
				name: codebases.name,
				onboardingProjectId: codebases.onboardingProjectId,
			})
			.from(codebases)
			.where(and(eq(codebases.id, id), eq(codebases.userId, user.id)))
			.limit(1);
		if (!codebase) throw new Error("NOT_FOUND");
		const featureProjects = await db
			.select({
				id: projects.id,
				name: projects.name,
				featuresStatus: projects.featuresStatus,
			})
			.from(projects)
			.where(
				and(
					eq(projects.codebaseId, id),
					eq(projects.userId, user.id),
					isNull(projects.deletedAt),
				),
			)
			.orderBy(desc(projects.updatedAt));
		const feature = featureProjects[0] ?? null;
		const onboardingFeature = resolveOnboardingAnchorProject({
			onboardingProjectId: codebase.onboardingProjectId,
			projects: featureProjects,
			expectedCodebaseId: id,
		});
		const [currentSnapshot] = await db
			.select({ id: codebaseSnapshots.id })
			.from(codebaseSnapshots)
			.where(
				and(
					eq(codebaseSnapshots.codebaseId, id),
					inArray(codebaseSnapshots.status, [...SNAPSHOT_CONTEXT_STATUSES]),
				),
			)
			.orderBy(desc(codebaseSnapshots.createdAt))
			.limit(1);
		let analysis: AnalysisResponse | null = null;
		let latestAnalysisAttempt: LatestAttempt | null = null;
		if (onboardingFeature && currentSnapshot) {
			// Every attempt for this exact project + snapshot is a candidate: a
			// newer pending or failed run must not hide an older ready result
			// that already carries the repository-aware starter suggestions.
			const rows = await db
				.select()
				.from(codebaseAnalyses)
				.where(
					and(
						eq(codebaseAnalyses.projectId, onboardingFeature.id),
						eq(codebaseAnalyses.snapshotId, currentSnapshot.id),
					),
				)
				.orderBy(desc(codebaseAnalyses.createdAt));
			const selection = selectWorkspaceAnalysis(rows, {
				projectId: onboardingFeature.id,
				snapshotId: currentSnapshot.id,
			});
			analysis = selection.selected;
			latestAnalysisAttempt = selection.latestAttempt;
		}
		// Stored snapshot derived from usable current snapshot independent of sync session expiry
		// (including empty repositories).
		const storedSnapshot = currentSnapshot;
		const hasStoredSnapshot = Boolean(storedSnapshot);
		return {
			codebase,
			feature,
			onboardingFeature,
			currentSnapshotId: currentSnapshot?.id ?? null,
			analysis,
			latestAnalysisAttempt,
			hasStoredSnapshot,
			canOpenFullBoard,
		};
	});

const loadSnapshotManifest = createServerFn({ method: "GET" })
	.validator((id: string) => id)
	.handler(async ({ data: id }) => {
		const user = await requireUserServer();
		const { db } = await import("@/db");
		const { codebases, codebaseSnapshotFiles, codebaseSnapshots } =
			await import("@/db/schema");
		const { manifestEntrySchema } = await import("@/lib/codebase-sync");
		const { SNAPSHOT_CONTEXT_STATUSES } = await import("@/lib/codebase-sync");
		const { and, asc, desc, eq, inArray } = await import("drizzle-orm");
		const { CODEBASE_PACKAGE_JSON_PREVIEW_MAX_CHARS } = await import(
			"@/lib/constants"
		);
		const [codebase] = await db
			.select({ id: codebases.id })
			.from(codebases)
			.where(and(eq(codebases.id, id), eq(codebases.userId, user.id)))
			.limit(1);
		if (!codebase) throw new Error("NOT_FOUND");
		const [snapshot] = await db
			.select({
				id: codebaseSnapshots.id,
				manifest: codebaseSnapshots.manifest,
				fileCount: codebaseSnapshots.fileCount,
			})
			.from(codebaseSnapshots)
			.where(
				and(
					eq(codebaseSnapshots.codebaseId, id),
					inArray(codebaseSnapshots.status, [...SNAPSHOT_CONTEXT_STATUSES]),
				),
			)
			.orderBy(desc(codebaseSnapshots.createdAt))
			.limit(1);
		if (!snapshot)
			return {
				snapshotId: null,
				files: [],
				fileCount: 0,
				packageJsonText: null,
			};
		const parsed = manifestEntrySchema.array().safeParse(snapshot.manifest);
		const manifest = parsed.success ? parsed.data : [];
		const rows = await db
			.select({
				path: codebaseSnapshotFiles.path,
				chunkIndex: codebaseSnapshotFiles.chunkIndex,
				data: codebaseSnapshotFiles.data,
			})
			.from(codebaseSnapshotFiles)
			.where(eq(codebaseSnapshotFiles.snapshotId, snapshot.id))
			.orderBy(
				asc(codebaseSnapshotFiles.path),
				asc(codebaseSnapshotFiles.chunkIndex),
			);
		const chunksByPath = new Map<string, string[]>();
		for (const row of rows) {
			const group = chunksByPath.get(row.path) ?? [];
			group[row.chunkIndex] = row.data;
			chunksByPath.set(row.path, group);
		}
		let packageJsonText: string | null = null;
		for (const entry of manifest) {
			if (
				entry.path === "package.json" ||
				entry.path.endsWith("/package.json")
			) {
				const group = chunksByPath.get(entry.path);
				if (!group) continue;
				try {
					const text = Buffer.from(group.join(""), "base64").toString("utf8");
					packageJsonText = text.slice(
						0,
						CODEBASE_PACKAGE_JSON_PREVIEW_MAX_CHARS,
					);
					break;
				} catch {}
			}
		}
		return {
			snapshotId: snapshot.id,
			files: manifest.map((entry) => ({ path: entry.path })),
			fileCount: snapshot.fileCount ?? manifest.length,
			packageJsonText,
		};
	});

export type SnapshotFilePreviewResult =
	| {
			status: "ok";
			snapshotId: string;
			path: string;
			content: string;
			truncated: boolean;
			sizeBytes: number;
	  }
	| {
			status: "unsupported";
			snapshotId: string;
			path: string;
			sizeBytes: number;
	  }
	| { status: "unavailable"; snapshotId: string | null; path: string };

export type SourcePreviewState =
	| { kind: "idle" }
	| { kind: "loading"; path: string }
	| {
			kind: "ready";
			path: string;
			content: string;
			truncated: boolean;
			sizeBytes: number;
	  }
	| { kind: "unsupported"; path: string }
	| { kind: "unavailable"; path: string }
	| { kind: "failed"; path: string; message: string };

/**
 * Map a server preview answer to what the right panel shows. Every non-`ok`
 * outcome gets its own explicit state: a file the snapshot never stored is
 * never rendered as an empty file, and binary content is never rendered as
 * broken source.
 */
export function toSourcePreviewState(
	result: SnapshotFilePreviewResult,
	requestedPath: string,
): SourcePreviewState {
	if (result.status === "ok") {
		if (result.content.length === 0) {
			return { kind: "unavailable", path: result.path };
		}
		return {
			kind: "ready",
			path: result.path,
			content: result.content,
			truncated: result.truncated,
			sizeBytes: result.sizeBytes,
		};
	}
	if (result.status === "unsupported") {
		return { kind: "unsupported", path: result.path };
	}
	return { kind: "unavailable", path: result.path || requestedPath };
}

/**
 * Read one synchronized file for the read-only preview.
 *
 * The snapshot is derived from the authenticated codebase, never from a
 * caller-supplied snapshot id, so one user's request can never reach another
 * user's stored content. The requested path must survive the same relative-path
 * guard the upload boundary uses AND appear in this snapshot's persisted
 * manifest, so traversal, absolute paths, and files that were never uploaded
 * are all rejected before any chunk is read.
 */
const loadSnapshotFileContent = createServerFn({ method: "GET" })
	.validator((input: { codebaseId: string; path: string }) => input)
	.handler(async ({ data: input }): Promise<SnapshotFilePreviewResult> => {
		const user = await requireUserServer();
		const { db } = await import("@/db");
		const { codebases, codebaseSnapshotFiles, codebaseSnapshots } =
			await import("@/db/schema");
		const {
			isSafeRelativePath,
			isStrictBase64,
			manifestEntrySchema,
			SNAPSHOT_CONTEXT_STATUSES,
		} = await import("@/lib/codebase-sync");
		const {
			assembleSnapshotFileChunks,
			isDisplayableTextContent,
			truncatePreviewContent,
		} = await import("@/lib/codebase-source-preview");
		const { and, asc, desc, eq, inArray } = await import("drizzle-orm");
		const { CODEBASE_FILE_PREVIEW_MAX_CHARS } = await import("@/lib/constants");

		const requestedPath = input.path.trim();
		if (!isSafeRelativePath(requestedPath)) {
			return { status: "unavailable", snapshotId: null, path: requestedPath };
		}

		const [codebase] = await db
			.select({ id: codebases.id })
			.from(codebases)
			.where(
				and(eq(codebases.id, input.codebaseId), eq(codebases.userId, user.id)),
			)
			.limit(1);
		if (!codebase) throw new Error("NOT_FOUND");

		const [snapshot] = await db
			.select({
				id: codebaseSnapshots.id,
				manifest: codebaseSnapshots.manifest,
			})
			.from(codebaseSnapshots)
			.where(
				and(
					eq(codebaseSnapshots.codebaseId, input.codebaseId),
					inArray(codebaseSnapshots.status, [...SNAPSHOT_CONTEXT_STATUSES]),
				),
			)
			.orderBy(desc(codebaseSnapshots.createdAt))
			.limit(1);
		if (!snapshot) {
			return { status: "unavailable", snapshotId: null, path: requestedPath };
		}

		const parsedManifest = manifestEntrySchema
			.array()
			.safeParse(snapshot.manifest ?? []);
		if (!parsedManifest.success) {
			return {
				status: "unavailable",
				snapshotId: snapshot.id,
				path: requestedPath,
			};
		}
		// Only files this snapshot actually uploaded are readable.
		const entry = parsedManifest.data.find(
			(item) => item.path === requestedPath,
		);
		if (!entry) {
			return {
				status: "unavailable",
				snapshotId: snapshot.id,
				path: requestedPath,
			};
		}

		const rows = await db
			.select({
				chunkIndex: codebaseSnapshotFiles.chunkIndex,
				chunkTotal: codebaseSnapshotFiles.chunkTotal,
				data: codebaseSnapshotFiles.data,
			})
			.from(codebaseSnapshotFiles)
			.where(
				and(
					eq(codebaseSnapshotFiles.snapshotId, snapshot.id),
					eq(codebaseSnapshotFiles.path, requestedPath),
				),
			)
			.orderBy(asc(codebaseSnapshotFiles.chunkIndex));

		const assembled = assembleSnapshotFileChunks(rows);
		if (!assembled || !isStrictBase64(assembled)) {
			return {
				status: "unavailable",
				snapshotId: snapshot.id,
				path: requestedPath,
			};
		}

		let decoded: string;
		try {
			decoded = Buffer.from(assembled, "base64").toString("utf8");
		} catch {
			return {
				status: "unavailable",
				snapshotId: snapshot.id,
				path: requestedPath,
			};
		}
		if (!isDisplayableTextContent(decoded)) {
			return {
				status: "unsupported",
				snapshotId: snapshot.id,
				path: requestedPath,
				sizeBytes: entry.size,
			};
		}

		const bounded = truncatePreviewContent(
			decoded,
			CODEBASE_FILE_PREVIEW_MAX_CHARS,
		);
		return {
			status: "ok",
			snapshotId: snapshot.id,
			path: requestedPath,
			content: bounded.content,
			truncated: bounded.truncated,
			sizeBytes: entry.size,
		};
	});

const loadFeatureTree = createServerFn({ method: "GET" })
	.validator((id: string) => id)
	.handler(async ({ data: id }) => {
		const user = await requireUserServer();
		const { db } = await import("@/db");
		const { projects } = await import("@/db/schema");
		const { and, eq, isNull } = await import("drizzle-orm");
		const { featureTreeSchema } = await import(
			"@/lib/services/feature-service"
		);
		const [row] = await db
			.select({ featureTree: projects.featureTree })
			.from(projects)
			.where(
				and(
					eq(projects.id, id),
					eq(projects.userId, user.id),
					isNull(projects.deletedAt),
				),
			)
			.limit(1);
		if (!row) return { featureTree: null };
		const parsed = featureTreeSchema.safeParse(row.featureTree);
		return { featureTree: parsed.success ? parsed.data : null };
	});

const loadTaskTree = createServerFn({ method: "GET" })
	.validator((id: string) => id)
	.handler(async ({ data: id }) => {
		const user = await requireUserServer();
		const { db } = await import("@/db");
		const { projects } = await import("@/db/schema");
		const { and, eq, isNull } = await import("drizzle-orm");
		const { getTaskTree } = await import("@/lib/services/task-service");
		const [row] = await db
			.select({ id: projects.id })
			.from(projects)
			.where(
				and(
					eq(projects.id, id),
					eq(projects.userId, user.id),
					isNull(projects.deletedAt),
				),
			)
			.limit(1);
		if (!row) return { taskTree: null };
		return { taskTree: await getTaskTree(id) };
	});

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
		feature,
		onboardingFeature,
		currentSnapshotId,
		analysis: initialAnalysis,
		latestAnalysisAttempt,
		hasStoredSnapshot,
		canOpenFullBoard,
	} = Route.useLoaderData();
	const [payload, setPayload] = useState<SyncPromptPayload | null>(null);
	const [manifestFiles, setManifestFiles] = useState<Array<{ path: string }>>(
		[],
	);
	const [manifestFileCount, setManifestFileCount] = useState<number | null>(
		null,
	);
	const [packageJsonText, setPackageJsonText] = useState<string | null>(null);
	const [manifestSnapshotId, setManifestSnapshotId] = useState<string | null>(
		null,
	);
	const [sourcePreview, setSourcePreview] = useState<SourcePreviewState>({
		kind: "idle",
	});
	const [chatMessages, setChatMessages] = useState<ChatStreamMessage[]>([]);
	const [aiQuestions, setAiQuestions] = useState<AdaptiveQuestion[]>([]);
	const [chatAnswers, setChatAnswers] = useState<Record<string, string>>({});
	/**
	 * The one in-flight or settled AI request for this workspace. Every stage
	 * (questions, Feature, PRD, AC, Task) records its real start, settle time,
	 * outcome, and the model's own streamed reasoning here, so the workspace
	 * shows exactly one honest Thinking surface per operation.
	 */
	const [run, setRun] = useState<CodebaseRunState | null>(null);
	const [lastFeaturePrompt, setLastFeaturePrompt] = useState("");
	const [isConfirming, setIsConfirming] = useState(false);
	const [status, setStatus] = useState<SyncStatusResponse | null>(null);
	const [analysis, setAnalysis] = useState<AnalysisResponse | null>(() =>
		matchesWorkspaceAnalysis(
			initialAnalysis,
			onboardingFeature?.id ?? "",
			currentSnapshotId ?? "",
		)
			? initialAnalysis
			: null,
	);
	const [error, setError] = useState<string | null>(null);
	const [isStarting, setIsStarting] = useState(false);
	const [isWorking, setIsWorking] = useState(false);
	const inFlight = useRef(false);
	const analysisAttemptedFor = useRef<string | null>(null);
	const analysisReadInFlight = useRef(new Set<string>());
	const analysisRefreshInFlight = useRef(false);
	const activeWorkspaceSnapshotId = resolveWorkspaceSnapshotIdentity({
		persistedSnapshotId: currentSnapshotId ?? null,
		polledSnapshotId: status?.snapshotId ?? null,
	});
	const analysisIdentity = `${onboardingFeature?.id ?? ""}:${activeWorkspaceSnapshotId ?? ""}`;
	const analysisIdentityRef = useRef(analysisIdentity);
	analysisIdentityRef.current = analysisIdentity;

	const triggerAnalysis = useCallback(
		async (snapshotId: string) => {
			if (!onboardingFeature?.id) return;
			const requestIdentity = `${onboardingFeature.id}:${snapshotId}`;
			if (analysisAttemptedFor.current === requestIdentity) return;
			analysisAttemptedFor.current = requestIdentity;
			setIsWorking(true);
			setError(null);
			try {
				const response = await fetch(
					`/api/v1/projects/${encodeURIComponent(onboardingFeature.id)}/codebase/analysis`,
					{
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ snapshotId }),
					},
				);
				const body: unknown = await response.json().catch(() => null);
				const parsed = safeParseAnalysisResponse(body);
				if (
					!response.ok ||
					!parsed ||
					!matchesWorkspaceAnalysis(parsed, onboardingFeature.id, snapshotId)
				) {
					if (analysisIdentityRef.current === requestIdentity) {
						setError("Analisis codebase gagal. Coba analisis ulang.");
					}
					return;
				}
				if (analysisIdentityRef.current === requestIdentity)
					setAnalysis(parsed);
			} catch {
				if (analysisIdentityRef.current === requestIdentity) {
					setError("Server tidak dapat dihubungi.");
				}
			} finally {
				setIsWorking(false);
			}
		},
		[onboardingFeature?.id],
	);

	const readWorkspaceAnalysis = useCallback(
		async (projectId: string, snapshotId: string) => {
			const key = `${projectId}:${snapshotId}`;
			if (analysisReadInFlight.current.has(key)) return;
			analysisReadInFlight.current.add(key);
			try {
				const response = await fetch(
					`/api/v1/projects/${encodeURIComponent(projectId)}/codebase/analysis?snapshotId=${encodeURIComponent(snapshotId)}`,
				);
				const body: unknown = await response.json().catch(() => null);
				if (
					!response.ok ||
					!matchesWorkspaceAnalysis(body, projectId, snapshotId)
				) {
					if (analysisIdentityRef.current === key) {
						setError("Analisis codebase tidak dapat dibaca. Coba lagi.");
					}
					return;
				}
				const parsed = safeParseAnalysisResponse(body);
				if (!parsed) {
					if (analysisIdentityRef.current === key) {
						setError("Hasil analisis tidak valid.");
					}
					return;
				}
				if (analysisIdentityRef.current === key) setAnalysis(parsed);
			} catch {
				if (analysisIdentityRef.current === key) {
					setError("Server tidak dapat dihubungi. Coba lagi.");
				}
			} finally {
				analysisReadInFlight.current.delete(key);
			}
		},
		[],
	);

	const readStatus = useCallback(async () => {
		if (inFlight.current) return;
		inFlight.current = true;
		try {
			const queryParams = new URLSearchParams();
			if (status?.sessionId) queryParams.set("sessionId", status.sessionId);
			if (onboardingFeature?.id)
				queryParams.set("projectId", onboardingFeature.id);
			const query = queryParams.toString() ? `?${queryParams}` : "";
			const response = await fetch(
				`/api/codebases/${encodeURIComponent(codebase.id)}/status${query}`,
			);
			const parsed = syncStatusResponseSchema.safeParse(
				await response.json().catch(() => null),
			);
			if (!response.ok || !parsed.success) {
				setError(
					response.ok
						? "Status sync tidak valid. Coba muat ulang."
						: "Status sync tidak dapat dibaca. Coba lagi.",
				);
				return;
			}
			// The workspace stays bound to whichever snapshot is persisted, and
			// polling only moves it forward when the CLI reports a freshly
			// uploaded one. Session lifecycle is deliberately absent here: an
			// expired, consumed, or failed session says nothing about the
			// validity of the analysis already on screen.
			const activeSnapshotId = resolveWorkspaceSnapshotIdentity({
				persistedSnapshotId: currentSnapshotId ?? null,
				polledSnapshotId: parsed.data.snapshotId ?? null,
			});
			analysisIdentityRef.current = `${onboardingFeature?.id ?? ""}:${activeSnapshotId ?? ""}`;
			setStatus(parsed.data);
			const snapshotId = activeSnapshotId;
			if (!snapshotId) return;
			const projectId = onboardingFeature?.id;
			const retained = analysis ?? initialAnalysis;
			if (
				shouldDiscardWorkspaceAnalysis({
					analysis: retained,
					projectId: projectId ?? "",
					activeSnapshotId: snapshotId,
				})
			) {
				setAnalysis(null);
			}
			if (
				projectId &&
				shouldFetchWorkspaceAnalysis({
					projectId,
					snapshotId,
					analysisStatus: parsed.data.analysisStatus,
					analysis: retained,
				})
			) {
				void readWorkspaceAnalysis(projectId, snapshotId);
			}
			// A fresh analysis is only ever requested for a snapshot that has
			// none at all: reopening a workspace must never spend credits.
			if (
				projectId &&
				!latestAnalysisAttempt &&
				!parsed.data.analysisId &&
				!parsed.data.analysisStatus &&
				analysisAttemptedFor.current !== `${projectId}:${snapshotId}`
			) {
				void triggerAnalysis(snapshotId);
			}
		} catch {
			setError("Server tidak dapat dihubungi. Coba lagi.");
		} finally {
			inFlight.current = false;
		}
	}, [
		analysis,
		codebase.id,
		currentSnapshotId,
		initialAnalysis,
		latestAnalysisAttempt,
		onboardingFeature?.id,
		readWorkspaceAnalysis,
		status?.sessionId,
		triggerAnalysis,
	]);

	const [isRefreshingStarterSuggestions, setIsRefreshingStarterSuggestions] =
		useState(false);
	const [starterRefreshError, setStarterRefreshError] = useState<string | null>(
		null,
	);
	const refreshStarterSuggestions = useCallback(
		async (analysisId: string, snapshotId: string) => {
			if (
				!onboardingFeature?.id ||
				!analysis ||
				analysis.id !== analysisId ||
				analysis.snapshotId !== snapshotId ||
				!matchesWorkspaceAnalysis(analysis, onboardingFeature.id, snapshotId) ||
				analysisRefreshInFlight.current
			) {
				return;
			}
			analysisRefreshInFlight.current = true;
			setIsRefreshingStarterSuggestions(true);
			setStarterRefreshError(null);
			try {
				const response = await fetch(
					`/api/v1/projects/${encodeURIComponent(onboardingFeature.id)}/codebase/analysis`,
					{
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							snapshotId,
							refreshStarterSuggestionsForAnalysisId: analysisId,
						}),
					},
				);
				const body: unknown = await response.json().catch(() => null);
				const parsed = safeParseAnalysisResponse(body);
				const parsedSuggestions = codebaseStarterSuggestionsSchema.safeParse(
					parsed?.output?.starterSuggestions,
				);
				if (
					!response.ok ||
					!parsed ||
					!matchesWorkspaceAnalysis(parsed, onboardingFeature.id, snapshotId) ||
					!parsedSuggestions.success
				) {
					setStarterRefreshError("Pembaruan saran gagal. Coba lagi.");
					return;
				}
				if (
					analysisIdentityRef.current ===
					`${onboardingFeature.id}:${snapshotId}`
				) {
					setAnalysis(parsed);
				}
			} catch {
				if (
					analysisIdentityRef.current ===
					`${onboardingFeature?.id ?? ""}:${snapshotId}`
				) {
					setStarterRefreshError("Server tidak dapat dihubungi. Coba lagi.");
				}
			} finally {
				analysisRefreshInFlight.current = false;
				setIsRefreshingStarterSuggestions(false);
			}
		},
		[analysis, onboardingFeature?.id],
	);
	useEffect(() => {
		const projectId = onboardingFeature?.id ?? "";
		setAnalysis((current) => {
			if (
				!shouldDiscardWorkspaceAnalysis({
					analysis: current,
					projectId,
					activeSnapshotId: currentSnapshotId ?? null,
				})
			) {
				return current;
			}
			return shouldDiscardWorkspaceAnalysis({
				analysis: initialAnalysis,
				projectId,
				activeSnapshotId: currentSnapshotId ?? null,
			})
				? null
				: initialAnalysis;
		});
	}, [currentSnapshotId, initialAnalysis, onboardingFeature?.id]);
	useEffect(() => {
		try {
			const raw = sessionStorage.getItem(getPendingSyncPayloadKey(codebase.id));
			if (!raw) return;
			const parsed = syncPromptPayloadSchema.safeParse(JSON.parse(raw));
			if (parsed.success && parsed.data.projectId === codebase.id)
				setPayload(parsed.data);
			sessionStorage.removeItem(getPendingSyncPayloadKey(codebase.id));
		} catch {
			setError("Instruksi sync tidak dapat dibaca dari browser.");
		}
	}, [codebase.id]);

	useEffect(() => {
		void readStatus();
		const interval = setInterval(
			() => void readStatus(),
			CODEBASE_SYNC_POLL_INTERVAL_MS,
		);
		return () => clearInterval(interval);
	}, [readStatus]);

	const startSession = async (
		action: CodebaseSessionStartAction = "initial",
	) => {
		setIsStarting(true);
		setError(null);
		try {
			const response = await fetch(
				`/api/codebases/${encodeURIComponent(codebase.id)}/session`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(getCodebaseSessionRequestBody(action)),
				},
			);
			const parsed = syncPromptPayloadSchema.safeParse(
				await response.json().catch(() => null),
			);
			if (!response.ok || !parsed.success) {
				setError("Sesi sync gagal dibuat. Coba lagi.");
				return;
			}
			setPayload(parsed.data);
			setStatus(null);
			setAnalysis(null);
			// A fresh session resets the visible attempt: the prompt returns and the
			// stage list drops the previous attempt's state.
			analysisAttemptedFor.current = null;
		} catch {
			setError("Server tidak dapat dihubungi.");
		} finally {
			setIsStarting(false);
		}
	};

	const snapshotReady = resolveWorkspaceSnapshotReady({
		status,
		hasStoredSnapshot,
	});
	const [activeFeature, setActiveFeature] = useState<{
		id: string;
		name: string;
		featuresStatus?: string | null;
	} | null>(null);
	const resolvedFeature = activeFeature ?? feature;
	const effectiveFeatureId = resolvedFeature?.id ?? null;
	const [canvasOpen, setCanvasOpen] = useState(false);
	const [activeArtifactId, setActiveArtifactId] = useState<string | null>(null);
	const [canvasView, setCanvasView] = useState<"kanban" | "checklist">(
		"kanban",
	);
	const [prdContent, setPrdContent] = useState<string | null>(null);
	const [prdLoading, setPrdLoading] = useState(false);
	const [prdError, setPrdError] = useState<string | null>(null);
	const [acContent, setAcContent] = useState<string | null>(null);
	const [acLoading, setAcLoading] = useState(false);
	const [acError, setAcError] = useState<string | null>(null);
	const [featureTree, setFeatureTree] = useState<ProjectFeatureTree | null>(
		null,
	);
	const [taskTree, setTaskTree] = useState<TaskTree | null>(null);
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

	// The stage a reopened workspace resumes at is derived from the artifacts
	// that are actually persisted, so a refresh or History re-entry continues
	// where the project really is instead of restarting the pipeline.
	const derivedStage: CodebasePipelineStage = resolveResumeStage({
		hasFeatureTree: featureTree !== null,
		hasPrd: prdContent !== null,
		hasAc: acContent !== null,
		hasTasks: hasTasksInDb,
	});
	const stage = pipelineStage;
	useEffect(() => {
		setPipelineStage((current) =>
			current === "questions" && derivedStage !== "questions"
				? derivedStage
				: current,
		);
	}, [derivedStage]);

	const analysisOutput = analysis?.output ?? null;

	const loadPrd = useCallback(async (): Promise<string | null> => {
		if (!snapshotReady || !effectiveFeatureId) {
			setPrdContent(null);
			setPrdError(null);
			setPrdLoading(false);
			return null;
		}
		setPrdLoading(true);
		setPrdError(null);
		try {
			const response = await fetch(
				`/api/projects/${encodeURIComponent(effectiveFeatureId)}/versions`,
			);
			const body: unknown = await response.json().catch(() => null);
			if (!response.ok) {
				setPrdError("Dokumen PRD tidak dapat dimuat.");
				setPrdContent(null);
				return null;
			}
			const rows = parseVersionRows(body);
			if (!rows) {
				setPrdError("Dokumen PRD tidak valid.");
				setPrdContent(null);
				return null;
			}
			const content = selectLatestVersionContent(rows);
			setPrdContent(content);
			return content;
		} catch {
			setPrdError("Server tidak dapat dihubungi.");
			setPrdContent(null);
			return null;
		} finally {
			setPrdLoading(false);
		}
	}, [snapshotReady, effectiveFeatureId]);

	useEffect(() => {
		void loadPrd();
	}, [loadPrd]);

	const loadAc = useCallback(async (): Promise<string | null> => {
		if (!snapshotReady || !effectiveFeatureId) {
			setAcContent(null);
			setAcError(null);
			setAcLoading(false);
			return null;
		}
		setAcLoading(true);
		setAcError(null);
		try {
			const response = await fetch(
				`/api/projects/${encodeURIComponent(effectiveFeatureId)}/ac-versions`,
			);
			const body: unknown = await response.json().catch(() => null);
			if (!response.ok) {
				setAcError("Dokumen AC tidak dapat dimuat.");
				setAcContent(null);
				return null;
			}
			const rows = parseVersionRows(body);
			if (!rows) {
				setAcError("Dokumen AC tidak valid.");
				setAcContent(null);
				return null;
			}
			const content = selectLatestVersionContent(rows);
			setAcContent(content);
			return content;
		} catch {
			setAcError("Server tidak dapat dihubungi.");
			setAcContent(null);
			return null;
		} finally {
			setAcLoading(false);
		}
	}, [snapshotReady, effectiveFeatureId]);

	useEffect(() => {
		void loadAc();
	}, [loadAc]);

	const refreshFeatureTree = useCallback(async (projectId: string | null) => {
		if (!projectId) {
			setFeatureTree(null);
			return null;
		}
		try {
			const data = await loadFeatureTree({ data: projectId });
			setFeatureTree(data.featureTree);
			return data.featureTree;
		} catch {
			setFeatureTree(null);
			return null;
		}
	}, []);

	const refreshTaskTree = useCallback(async (projectId: string | null) => {
		if (!projectId) {
			setTaskTree(null);
			return null;
		}
		try {
			const data = await loadTaskTree({ data: projectId });
			setTaskTree(data.taskTree);
			return data.taskTree;
		} catch {
			setTaskTree(null);
			return null;
		}
	}, []);

	useEffect(() => {
		void refreshFeatureTree(effectiveFeatureId);
		void refreshTaskTree(effectiveFeatureId);
	}, [effectiveFeatureId, refreshFeatureTree, refreshTaskTree]);

	useEffect(() => {
		if (!snapshotReady) return;
		let cancelled = false;
		void (async () => {
			try {
				const data = await loadSnapshotManifest({ data: codebase.id });
				if (cancelled) return;
				setManifestFiles(data.files ?? []);
				setManifestSnapshotId(data.snapshotId ?? null);
				setManifestFileCount(
					typeof data.fileCount === "number" ? data.fileCount : null,
				);
				setPackageJsonText(data.packageJsonText ?? null);
			} catch {
				if (!cancelled) {
					setManifestFiles([]);
					setManifestSnapshotId(null);
					setManifestFileCount(null);
					setPackageJsonText(null);
				}
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [snapshotReady, codebase.id]);

	// A new snapshot replaces every file the previous one contributed, so any
	// inspected source content is stale by definition and must be dropped.
	const sourcePreviewRequestRef = useRef(0);
	const activeSnapshotId = status?.snapshotId ?? manifestSnapshotId;
	const appliedSnapshotRef = useRef<string | null | undefined>(undefined);
	useEffect(() => {
		if (appliedSnapshotRef.current === activeSnapshotId) return;
		appliedSnapshotRef.current = activeSnapshotId;
		sourcePreviewRequestRef.current += 1;
		setSourcePreview({ kind: "idle" });
		setActiveArtifactId(null);
	}, [activeSnapshotId]);

	const selectSourceFile = useCallback(
		(path: string) => {
			const requestId = sourcePreviewRequestRef.current + 1;
			sourcePreviewRequestRef.current = requestId;
			setActiveArtifactId(null);
			setSourcePreview({ kind: "loading", path });
			setCanvasOpen(true);
			void (async () => {
				try {
					const result = await loadSnapshotFileContent({
						data: { codebaseId: codebase.id, path },
					});
					if (sourcePreviewRequestRef.current !== requestId) return;
					if (
						result.status === "ok" &&
						result.snapshotId !== activeSnapshotId
					) {
						setSourcePreview({ kind: "idle" });
						setCanvasOpen(false);
						return;
					}
					setSourcePreview(toSourcePreviewState(result, path));
				} catch {
					if (sourcePreviewRequestRef.current !== requestId) return;
					setSourcePreview({
						kind: "failed",
						path,
						message: "Pratinjau file tidak dapat dimuat.",
					});
				}
			})();
		},
		[codebase.id, activeSnapshotId],
	);

	const clearSourcePreview = useCallback(() => {
		sourcePreviewRequestRef.current += 1;
		setSourcePreview({ kind: "idle" });
	}, []);

	const explorerFiles = useMemo(() => {
		if (manifestFiles.length > 0) return manifestFiles;
		return manifestToExplorerFiles(analysisOutput?.relevantFiles ?? []);
	}, [manifestFiles, analysisOutput]);
	const explorerStack = useMemo(() => {
		const fromPackageJson = detectStackFromPackageJsonText(packageJsonText);
		const raw = analysisOutput
			? [
					analysisOutput.framework,
					analysisOutput.language,
					analysisOutput.database,
					analysisOutput.auth,
					analysisOutput.packageManager,
					...(analysisOutput.dependencies ?? []).slice(0, 5),
				].filter(
					(value): value is string =>
						typeof value === "string" &&
						value.trim().length > 0 &&
						value.trim() !== "Tidak terdeteksi",
				)
			: [];
		return mergeStackWithFallback(fromPackageJson, raw);
	}, [packageJsonText, analysisOutput]);
	const contextFiles = useMemo(
		() => (analysisOutput?.relevantFiles ?? []).slice(0, 2),
		[analysisOutput],
	);
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
			return { value: prdContent };
		}
		if (activeArtifact.id.startsWith("ac-") && acContent) {
			return { value: acContent };
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

	const fetchAiQuestions = useCallback(
		async (projectId: string, prompt: string) => {
			const startedAt = Date.now();
			setRun(startRun("questions", startedAt));
			try {
				const response = await fetch("/api/ask/options", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ projectId, prompt, platform: "web" }),
				});
				const body: unknown = await response.json().catch(() => null);
				const serverError =
					typeof body === "object" &&
					body !== null &&
					"error" in body &&
					typeof body.error === "string"
						? body.error
						: null;
				if (!response.ok) {
					// The server already distinguishes "repository context is not
					// ready" from a failed generation; surface that copy instead of
					// collapsing every failure into one generic sentence.
					setRun((current) =>
						settleRun(
							current,
							"failed",
							Date.now(),
							serverError ??
								(response.status === 409
									? "Konteks repositori belum siap. Selesaikan analisis codebase lalu coba lagi."
									: "Pertanyaan klarifikasi tidak dapat dibuat."),
						),
					);
					return;
				}
				// The endpoint already validated the array against the shared
				// ask-service contract; validate again here so a malformed or
				// empty payload can never reach the question UI. Never re-wrap
				// the array in the JSON envelope parser — that shape mismatch was
				// the bug that rejected every valid response.
				const parsed =
					typeof body === "object" && body !== null && "questions" in body
						? validateAskQuestions((body as { questions: unknown }).questions)
						: null;
				if (!parsed || parsed.length === 0) {
					setRun((current) =>
						settleRun(
							current,
							"failed",
							Date.now(),
							"AI tidak mengembalikan pertanyaan yang valid. Coba kirim ulang fitur.",
						),
					);
					return;
				}
				const mapped = mapAskQuestionsToAdaptive(parsed);
				setAiQuestions(mapped);
				setChatAnswers({});
				setRun((current) => settleRun(current, "done", Date.now()));
			} catch {
				setRun((current) =>
					settleRun(
						current,
						"failed",
						Date.now(),
						"Server tidak dapat dihubungi. Coba lagi.",
					),
				);
			}
		},
		[],
	);

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
		[snapshotReady, isWorking, codebase.id, codebase.name],
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

	const handleSubmitAnswer = useCallback(
		(questionId: string, answer: string) => {
			const trimmed = answer.trim();
			if (!trimmed) return;
			setChatAnswers((current) => ({ ...current, [questionId]: trimmed }));
		},
		[],
	);

	const [specError, setSpecError] = useState<string | null>(null);

	// Refresh and History recovery: reopen a project's persisted questions and
	// answers from the authoritative server handoff instead of transient state.
	// Completed artifacts (feature tree / PRD / AC / task) are reloaded by the
	// existing loaders; this restores the Ask stage.
	const handoffRestoredFor = useRef<string | null>(null);
	const hasLocalAskStateRef = useRef(false);
	hasLocalAskStateRef.current =
		aiQuestions.length > 0 || Object.keys(chatAnswers).length > 0;
	useEffect(() => {
		const projectId = effectiveFeatureId;
		if (!projectId || handoffRestoredFor.current === projectId) return;
		handoffRestoredFor.current = projectId;
		void (async () => {
			try {
				const response = await fetch("/api/ask/options", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ projectId, action: "get-handoff" }),
				});
				if (!response.ok) return;
				const body: unknown = await response.json().catch(() => null);
				if (typeof body !== "object" || body === null) return;
				const handoff = (body as { handoff?: unknown }).handoff;
				if (typeof handoff !== "object" || handoff === null) return;
				const record = handoff as {
					answers?: unknown;
					state?: { questions?: unknown; prompt?: unknown } | null;
				};
				// Never clobber state the user is actively building in this session.
				if (hasLocalAskStateRef.current) return;
				const persistedQuestions = parseRestoredQuestions(
					record.state?.questions,
				);
				const persistedAnswers = parseRestoredAnswers(record.answers);
				if (persistedQuestions.length === 0) return;
				const restored = restoreAskState(persistedQuestions, persistedAnswers);
				if (restored.questions.length === 0) return;
				setAiQuestions(restored.questions);
				setChatAnswers(restored.answers);
				if (
					typeof record.state?.prompt === "string" &&
					record.state.prompt.trim()
				) {
					setLastFeaturePrompt(record.state.prompt.trim());
				}
			} catch {
				// Recovery is best-effort: a failed read leaves the workspace
				// usable and the user can re-ask without losing completed stages.
			}
		})();
	}, [effectiveFeatureId]);

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

	const handleSendMessage = useCallback(
		async (message: string, intent: CodebaseChatIntent) => {
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
			if (intent === "revise_current") {
				await runRevision(trimmed);
				return;
			}
			setLastFeaturePrompt(trimmed);
			const projectId = await ensureFeatureInWorkspace(trimmed);
			if (projectId) void fetchAiQuestions(projectId, trimmed);
		},
		[ensureFeatureInWorkspace, fetchAiQuestions, runRevision],
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

	const runPipelineStage = useCallback(
		async (
			target: CodebaseRunStage,
			url: string,
			init: RequestInit,
			onSuccess: () => Promise<boolean>,
		) => {
			if (!effectiveFeatureId || stageBusy) return;
			setStageBusy(target);
			setStageError(null);
			// One honest Thinking surface for this request. `startedAt` is the
			// real client start; the model's streamed reasoning and the settle
			// outcome are filled from the stream's own events.
			setRun(startRun(target, Date.now()));
			try {
				const response = await fetch(url, init);
				const result = await consumeSseStream(response, {
					onThinking: (text) =>
						setRun((current) => appendRunThinking(current, text)),
					onThinkingReset: () => setRun((current) => resetRunThinking(current)),
				});
				if (result.error) {
					const failure = result.error;
					setStageError(failure);
					setRun((current) =>
						settleRun(current, "failed", Date.now(), failure),
					);
					return;
				}
				// A completed stream is not yet a usable artifact: the caller
				// reloads the authoritative server state and reports whether the
				// artifact really persisted.
				const persisted = await onSuccess();
				if (!persisted) {
					setRun((current) =>
						settleRun(
							current,
							"failed",
							Date.now(),
							"Hasil generasi belum tersimpan di server. Coba generate ulang.",
						),
					);
					return;
				}
				setRun((current) => settleRun(current, "done", Date.now()));
			} catch {
				const message = "Server tidak dapat dihubungi. Coba lagi.";
				setStageError(message);
				setRun((current) => settleRun(current, "failed", Date.now(), message));
			} finally {
				setStageBusy(null);
			}
		},
		[effectiveFeatureId, stageBusy],
	);

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
					content: prdContent,
					mimeType: artifactMimeTypeFor(artifact.fileName),
				});
			}
			if (artifact.id.startsWith("ac-") && acContent) {
				downloadArtifact({
					fileName: artifact.fileName,
					content: acContent,
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
					<span
						data-testid="codebase-sync-badge"
						className="shrink-0 rounded-md border border-graphite bg-obsidian px-2.5 py-1 font-mono text-[11px] text-fog"
					>
						{formatCodebaseSyncBadge(status?.fileCount ?? manifestFileCount)}
					</span>
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
								contextFiles={contextFiles}
								fileCount={status?.fileCount ?? manifestFileCount ?? undefined}
								kanbanProgress={kanbanProgress}
								messages={chatMessages}
								questions={aiQuestions}
								answers={chatAnswers}
								run={run}
								intentOptions={resolveIntentOptions({
									hasExistingFeature: artifacts.length > 0,
								})}
								revisionImpactNotice={describeRevisionImpact(revisionImpact)}
								artifacts={artifacts}
								activeArtifactId={activeArtifactId}
								projectIdForHandoff={hasTasksInDb ? effectiveFeatureId : null}
								stage={stage}
								stageBusy={stageBusy}
								stageError={stageError}
								codebaseName={codebase.name}
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
								onSendMessage={(message, intent) =>
									void handleSendMessage(message, intent)
								}
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

function safeParseAnalysisResponse(input: unknown): AnalysisResponse | null {
	if (typeof input !== "object" || input === null) return null;
	if (
		!("id" in input) ||
		!("projectId" in input) ||
		!("snapshotId" in input) ||
		!("status" in input)
	)
		return null;
	const output =
		"output" in input
			? safeParseCodebaseAnalysis(input.output)
			: { success: false as const };
	if (
		input.id &&
		typeof input.id === "string" &&
		input.projectId &&
		typeof input.projectId === "string" &&
		input.snapshotId &&
		typeof input.snapshotId === "string" &&
		(input.status === "pending" ||
			input.status === "ready" ||
			input.status === "failed")
	)
		return {
			id: input.id,
			projectId: input.projectId,
			snapshotId: input.snapshotId,
			status: input.status,
			output: output.success ? output.data : null,
		};
	return null;
}
