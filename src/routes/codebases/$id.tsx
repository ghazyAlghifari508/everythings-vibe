import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CodebaseArtifactCanvas } from "@/components/codebase/codebase-artifact-canvas";
import {
	type AdaptiveQuestion,
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
import { resolveOnboardingAnchorProject } from "@/lib/codebase-anchor";
import { buildFeatureMessage } from "@/lib/codebase-chat-flow";
import { artifactMimeTypeFor, downloadArtifact } from "@/lib/codebase-download";
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
		if (onboardingFeature && currentSnapshot) {
			const [row] = await db
				.select()
				.from(codebaseAnalyses)
				.where(
					and(
						eq(codebaseAnalyses.projectId, onboardingFeature.id),
						eq(codebaseAnalyses.snapshotId, currentSnapshot.id),
					),
				)
				.orderBy(desc(codebaseAnalyses.createdAt))
				.limit(1);
			if (row) {
				const parsed = safeParseCodebaseAnalysis(row.output);
				analysis = {
					id: row.id,
					projectId: row.projectId,
					snapshotId: row.snapshotId,
					status:
						row.status === "ready" ||
						row.status === "failed" ||
						row.status === "pending"
							? row.status
							: "failed",
					output: parsed.success ? parsed.data : null,
					errorCode: row.errorCode,
					errorMessage: row.errorMessage,
					createdAt: row.createdAt?.toISOString(),
					updatedAt: row.updatedAt?.toISOString(),
				};
			}
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
			hasStoredSnapshot,
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
		if (!snapshot) return { files: [], fileCount: 0, packageJsonText: null };
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
					packageJsonText = text.slice(0, 20000);
					break;
				} catch {}
			}
		}
		return {
			files: manifest.map((entry) => ({ path: entry.path })),
			fileCount: snapshot.fileCount ?? manifest.length,
			packageJsonText,
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
		hasStoredSnapshot,
	} = Route.useLoaderData();
	const [payload, setPayload] = useState<SyncPromptPayload | null>(null);
	const [manifestFiles, setManifestFiles] = useState<Array<{ path: string }>>(
		[],
	);
	const [manifestFileCount, setManifestFileCount] = useState<number | null>(
		null,
	);
	const [packageJsonText, setPackageJsonText] = useState<string | null>(null);
	const [chatMessages, setChatMessages] = useState<ChatStreamMessage[]>([]);
	const [aiQuestions, setAiQuestions] = useState<AdaptiveQuestion[]>([]);
	const [chatAnswers, setChatAnswers] = useState<Record<string, string>>({});
	const [questionsLoading, setQuestionsLoading] = useState(false);
	const [questionsError, setQuestionsError] = useState<string | null>(null);
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
	const analysisIdentity = `${onboardingFeature?.id ?? ""}:${status?.snapshotId ?? currentSnapshotId ?? ""}`;
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
			analysisIdentityRef.current = `${onboardingFeature?.id ?? ""}:${parsed.data.snapshotId ?? ""}`;
			setStatus(parsed.data);
			const snapshotId = parsed.data.snapshotId;
			const hasUsableSnapshot = Boolean(
				snapshotId && SNAPSHOT_CONTEXT_STATUSES.includes(parsed.data.status),
			);
			if (!hasUsableSnapshot || !snapshotId) {
				setAnalysis(null);
				return;
			}
			const projectId = onboardingFeature?.id;
			const analysisMatchesCurrent = Boolean(
				projectId &&
					(matchesWorkspaceAnalysis(analysis, projectId, snapshotId) ||
						matchesWorkspaceAnalysis(initialAnalysis, projectId, snapshotId)),
			);
			if (!analysisMatchesCurrent) setAnalysis(null);
			if (
				projectId &&
				shouldFetchWorkspaceAnalysis({
					projectId,
					snapshotId,
					analysisStatus: parsed.data.analysisStatus,
					analysis,
				})
			) {
				void readWorkspaceAnalysis(projectId, snapshotId);
			}
			if (
				projectId &&
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
		initialAnalysis,
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
		setAnalysis((current) => {
			if (
				matchesWorkspaceAnalysis(
					current,
					onboardingFeature?.id ?? "",
					currentSnapshotId ?? "",
				)
			) {
				return current;
			}
			return matchesWorkspaceAnalysis(
				initialAnalysis,
				onboardingFeature?.id ?? "",
				currentSnapshotId ?? "",
			)
				? initialAnalysis
				: null;
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

	const derivedStage: PipelineStage = hasTasksInDb
		? "handoff"
		: acContent
			? "ac"
			: prdContent
				? "prd"
				: featureTree
					? "feature"
					: "questions";
	const stage = pipelineStage;
	useEffect(() => {
		setPipelineStage((current) =>
			current === "questions" && derivedStage !== "questions"
				? derivedStage
				: current,
		);
	}, [derivedStage]);

	const analysisOutput = analysis?.output ?? null;

	const loadPrd = useCallback(async () => {
		if (!snapshotReady || !effectiveFeatureId) {
			setPrdContent(null);
			setPrdError(null);
			setPrdLoading(false);
			return;
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
				return;
			}
			const rows = parseVersionRows(body);
			if (!rows) {
				setPrdError("Dokumen PRD tidak valid.");
				setPrdContent(null);
				return;
			}
			setPrdContent(selectLatestVersionContent(rows));
		} catch {
			setPrdError("Server tidak dapat dihubungi.");
			setPrdContent(null);
		} finally {
			setPrdLoading(false);
		}
	}, [snapshotReady, effectiveFeatureId]);

	useEffect(() => {
		void loadPrd();
	}, [loadPrd]);

	const loadAc = useCallback(async () => {
		if (!snapshotReady || !effectiveFeatureId) {
			setAcContent(null);
			setAcError(null);
			setAcLoading(false);
			return;
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
				return;
			}
			const rows = parseVersionRows(body);
			if (!rows) {
				setAcError("Dokumen AC tidak valid.");
				setAcContent(null);
				return;
			}
			setAcContent(selectLatestVersionContent(rows));
		} catch {
			setAcError("Server tidak dapat dihubungi.");
			setAcContent(null);
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
			return;
		}
		try {
			const data = await loadFeatureTree({ data: projectId });
			setFeatureTree(data.featureTree);
		} catch {
			setFeatureTree(null);
		}
	}, []);

	const refreshTaskTree = useCallback(async (projectId: string | null) => {
		if (!projectId) {
			setTaskTree(null);
			return;
		}
		try {
			const data = await loadTaskTree({ data: projectId });
			setTaskTree(data.taskTree);
		} catch {
			setTaskTree(null);
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
				setManifestFileCount(
					typeof data.fileCount === "number" ? data.fileCount : null,
				);
				setPackageJsonText(data.packageJsonText ?? null);
			} catch {
				if (!cancelled) {
					setManifestFiles([]);
					setManifestFileCount(null);
					setPackageJsonText(null);
				}
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [snapshotReady, codebase.id]);

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
	const isPrdArtifactActive =
		Boolean(activeArtifact) &&
		resolvedFeature != null &&
		activeArtifact?.id === `prd-${resolvedFeature.id}`;
	const isAcArtifactActive =
		Boolean(activeArtifact) &&
		resolvedFeature != null &&
		activeArtifact?.id === `ac-${resolvedFeature.id}`;
	const isFeatureArtifactActive =
		Boolean(activeArtifact) &&
		resolvedFeature != null &&
		activeArtifact?.id === `feature-${resolvedFeature.id}`;
	const isTasksArtifactActive =
		Boolean(activeArtifact) &&
		resolvedFeature != null &&
		activeArtifact?.id === `tasks-${resolvedFeature.id}`;

	const fetchAiQuestions = useCallback(
		async (projectId: string, prompt: string) => {
			setQuestionsLoading(true);
			setQuestionsError(null);
			try {
				const response = await fetch("/api/ask/options", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ projectId, prompt, platform: "web" }),
				});
				const body: unknown = await response.json().catch(() => null);
				if (!response.ok) {
					setQuestionsError(
						"Pertanyaan klarifikasi tidak dapat dibuat. Coba lagi.",
					);
					return;
				}
				const rawQuestions =
					typeof body === "object" && body !== null && "questions" in body
						? (body as { questions: unknown }).questions
						: null;
				if (!Array.isArray(rawQuestions) || rawQuestions.length === 0) {
					setQuestionsError(
						"AI menghasilkan respons kosong. Coba kirim ulang fitur.",
					);
					return;
				}
				const mapped: AdaptiveQuestion[] = rawQuestions.flatMap(
					(item, index): AdaptiveQuestion[] => {
						if (typeof item !== "object" || item === null) return [];
						const record = item as Record<string, unknown>;
						const id =
							typeof record.id === "string" && record.id.trim()
								? record.id.trim()
								: `q${index + 1}`;
						const title =
							typeof record.question === "string" && record.question.trim()
								? record.question.trim()
								: null;
						if (!title) return [];
						const rawOptions = Array.isArray(record.options)
							? record.options
							: [];
						const options = rawOptions
							.filter(
								(option): option is string =>
									typeof option === "string" && option.trim().length > 0,
							)
							.slice(0, 6)
							.map((option, optionIndex) => ({
								id: `${id}-opt${optionIndex + 1}`,
								label: option.trim(),
								recommended: optionIndex === 0,
							}));
						if (record.type !== "text" && options.length === 0) return [];
						return [
							{
								id,
								title,
								options,
								customPlaceholder:
									typeof record.customPlaceholder === "string" &&
									record.customPlaceholder.trim()
										? record.customPlaceholder.trim()
										: undefined,
							},
						];
					},
				);
				if (mapped.length === 0) {
					setQuestionsError(
						"AI menghasilkan format tidak valid. Coba kirim ulang fitur.",
					);
					return;
				}
				setAiQuestions(mapped);
				setChatAnswers({});
			} catch {
				setQuestionsError("Server tidak dapat dihubungi. Coba lagi.");
			} finally {
				setQuestionsLoading(false);
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
			setLastFeaturePrompt(trimmed);
			const projectId = await ensureFeatureInWorkspace(trimmed);
			if (projectId) void fetchAiQuestions(projectId, trimmed);
		},
		[ensureFeatureInWorkspace, fetchAiQuestions],
	);

	const handleSubmitAnswer = useCallback(
		(questionId: string, answer: string) => {
			const trimmed = answer.trim();
			if (!trimmed) return;
			setChatAnswers((current) => ({ ...current, [questionId]: trimmed }));
		},
		[],
	);

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

	const handleConfirmGenerate = useCallback(async () => {
		if (!effectiveFeatureId || isConfirming) return;
		setIsConfirming(true);
		setSpecError(null);
		setStageError(null);
		try {
			const answersList = buildAskHandoffAnswers(chatAnswers, aiQuestions);
			try {
				await fetch("/api/ask/options", {
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
								questions: [],
							},
						},
					}),
				});
			} catch {
				return;
			}
			let specResponse: Response;
			try {
				specResponse = await fetch("/api/features/generate", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ projectId: effectiveFeatureId }),
				});
			} catch {
				setSpecError("Server tidak dapat dihubungi. Coba lagi.");
				return;
			}
			if (!specResponse.ok && specResponse.status !== 409) {
				setSpecError("Spesifikasi fitur gagal dibuat. Coba lagi.");
				return;
			}
			if (specResponse.status === 409) {
				pushAssistantMessage(
					`Pohon fitur ${resolvedFeature?.name ?? "fitur"} sedang disusun. Tunggu sebentar lalu klik Lanjut Bikin Fitur lagi untuk memuat hasilnya.`,
				);
				return;
			}
			await refreshFeatureTree(effectiveFeatureId);
			setPipelineStage("feature");
			const specMessage = buildFeatureMessage(
				resolvedFeature?.name ?? codebase.name,
				chatAnswers,
			);
			pushAssistantMessage(
				`Pohon fitur ${resolvedFeature?.name ?? "fitur"} berhasil disusun dari jawaban Anda: ${specMessage}. Klik file feature-*.json di bawah untuk melihat diagram pohon fitur.`,
			);
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
	]);

	const runPipelineStage = useCallback(
		async (
			target: PipelineStage,
			url: string,
			init: RequestInit,
			onSuccess: () => Promise<void>,
		) => {
			if (!effectiveFeatureId || stageBusy) return;
			setStageBusy(target);
			setStageError(null);
			try {
				const response = await fetch(url, init);
				const result = await consumeSseStream(response);
				if (result.error) {
					setStageError(result.error);
					return;
				}
				await onSuccess();
			} catch {
				setStageError("Server tidak dapat dihubungi. Coba lagi.");
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
				await loadPrd();
				setPipelineStage("prd");
				pushAssistantMessage(
					`PRD 8 seksi untuk ${resolvedFeature?.name ?? "fitur"} siap. Klik file PRD-*.md di bawah untuk membaca dokumen lengkap.`,
				);
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
				await loadAc();
				setPipelineStage("ac");
				pushAssistantMessage(
					`Acceptance Criteria untuk ${resolvedFeature?.name ?? "fitur"} siap. Klik file AC-*.md di bawah untuk membaca dokumen lengkap.`,
				);
			},
		);
	}, [
		effectiveFeatureId,
		resolvedFeature?.name,
		runPipelineStage,
		loadAc,
		pushAssistantMessage,
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
				await refreshTaskTree(effectiveFeatureId);
				setPipelineStage("handoff");
				pushAssistantMessage(
					`Task untuk ${resolvedFeature?.name ?? "fitur"} sudah tersimpan dan papan Kanban aktif. Klik file tasks-*.json di bawah untuk melihat diagram task, atau salin perintah handoff untuk mulai mengerjakan dengan AI Coding Agent.`,
				);
			},
		);
	}, [
		effectiveFeatureId,
		resolvedFeature?.name,
		runPipelineStage,
		kanban,
		refreshTaskTree,
		pushAssistantMessage,
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
								codebaseName={codebase.name}
								fileCount={status?.fileCount ?? manifestFileCount ?? undefined}
								files={explorerFiles}
								stack={explorerStack}
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
								questionsLoading={questionsLoading}
								questionsError={questionsError}
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
									analysis.snapshotId === status?.snapshotId
										? {
												analysisId: analysis.id,
												snapshotId: analysis.snapshotId,
												status: analysis.status,
												isRefreshing: isRefreshingStarterSuggestions,
												error: starterRefreshError,
											}
										: undefined
								}
								onRefreshStarterSuggestions={refreshStarterSuggestions}
								isSending={isWorking}
								isConfirming={isConfirming}
								specError={specError}
								onOpenArtifact={(artifact) => {
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
								fileName={activeArtifact?.fileName ?? "Preview artefak"}
								badge={activeArtifact?.badge ?? "PRATINJAU"}
								onClose={() => setCanvasOpen(false)}
								onDownload={
									activeArtifact
										? () => handleDownloadArtifact(activeArtifact)
										: undefined
								}
								isLoading={
									(isPrdArtifactActive && prdLoading) ||
									(isAcArtifactActive && acLoading)
								}
								error={
									isPrdArtifactActive
										? prdError
										: isAcArtifactActive
											? acError
											: null
								}
								onRetry={
									isPrdArtifactActive
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
								{!activeArtifact || !resolvedFeature ? (
									<div className="flex h-full flex-col items-start justify-center gap-3 p-2">
										<p className="text-sm font-semibold text-snow">
											Belum ada artefak terpilih
										</p>
										<p className="max-w-sm text-xs leading-5 text-fog">
											Pilih FileCard di kolom chat untuk preview dokumen atau
											papan Kanban langsung di sini.
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
