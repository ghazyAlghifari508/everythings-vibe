import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CodebaseArtifactCanvas } from "@/components/codebase/codebase-artifact-canvas";
import {
	type AdaptiveQuestion,
	type ChatStreamMessage,
	CodebaseChatWorkspace,
} from "@/components/codebase/codebase-chat-workspace";
import { CodebaseExplorerSidebar } from "@/components/codebase/codebase-explorer-sidebar";
import type { CodebaseArtifactRef } from "@/components/codebase/codebase-file-card";
import { CodebaseKanbanBoard } from "@/components/codebase/codebase-kanban-board";
import {
	CodebaseMarkdown,
	parseVersionRows,
	selectLatestVersionContent,
} from "@/components/codebase/codebase-markdown";
import { CodebaseWorkspaceShell } from "@/components/codebase/codebase-workspace-shell";
import { ScreenConnect } from "@/components/codebase/screen-connect";
import { SyncStatus } from "@/components/codebase/sync-status";
import { useKanbanTasks } from "@/hooks/use-kanban-polling";
import {
	type AnalysisResponse,
	safeParseCodebaseAnalysis,
} from "@/lib/codebase-analysis";
import { buildFeatureMessage } from "@/lib/codebase-chat-flow";
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
import { CODEBASE_SYNC_POLL_INTERVAL_MS } from "@/lib/constants";
import { computeKanbanProgress } from "@/lib/kanban-utils";
import { requireUserServer } from "@/lib/session";

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

const loadCodebase = createServerFn({ method: "GET" })
	.validator((id: string) => id)
	.handler(async ({ data: id }) => {
		const user = await requireUserServer();
		const { db } = await import("@/db");
		const { codebases, codebaseAnalyses } = await import("@/db/schema");
		const { codebaseSnapshots } = await import("@/db/schema");
		const { projects } = await import("@/db/schema");
		const { and, desc, eq, isNull } = await import("drizzle-orm");
		const [codebase] = await db
			.select({ id: codebases.id, name: codebases.name })
			.from(codebases)
			.where(and(eq(codebases.id, id), eq(codebases.userId, user.id)))
			.limit(1);
		if (!codebase) throw new Error("NOT_FOUND");
		const featureProjects = await db
			.select({ id: projects.id, name: projects.name })
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
		let analysis: AnalysisResponse | null = null;
		if (feature) {
			const [row] = await db
				.select()
				.from(codebaseAnalyses)
				.where(
					and(
						eq(codebaseAnalyses.projectId, feature.id),
						eq(codebaseAnalyses.status, "ready"),
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
		// Stored snapshot independent of any sync session: an expired
		// session must never block the workspace when files exist in DB.
		const [storedSnapshot] = await db
			.select({
				id: codebaseSnapshots.id,
				fileCount: codebaseSnapshots.fileCount,
			})
			.from(codebaseSnapshots)
			.where(eq(codebaseSnapshots.codebaseId, id))
			.orderBy(desc(codebaseSnapshots.createdAt))
			.limit(1);
		const hasStoredSnapshot = Boolean(
			storedSnapshot && (storedSnapshot.fileCount ?? 0) > 0,
		);
		return { codebase, feature, analysis, hasStoredSnapshot };
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

function CodebaseDetailPending() {
	return (
		<main
			className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10 sm:px-6 sm:py-14"
			aria-busy="true"
		>
			<header className="border-b border-graphite pb-6">
				<div className="h-3 w-44 animate-pulse rounded bg-graphite" />
				<div className="mt-3 h-10 w-64 animate-pulse rounded bg-graphite" />
				<div className="mt-3 h-4 max-w-2xl animate-pulse rounded bg-graphite" />
			</header>
			<div className="h-12 animate-pulse rounded-xl border border-graphite bg-charcoal" />
			<div className="h-64 animate-pulse rounded-xl border border-graphite bg-charcoal" />
			<p className="text-sm text-fog">Memuat detail codebase...</p>
		</main>
	);
}

function CodebaseDetailPage() {
	const {
		codebase,
		feature,
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
	const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
	const [screen, setScreen] = useState<1 | 2 | 3>(1);
	const [error, setError] = useState<string | null>(null);
	const [isStarting, setIsStarting] = useState(false);
	const [isWorking, setIsWorking] = useState(false);
	const inFlight = useRef(false);
	const analysisAttemptedFor = useRef<string | null>(null);

	const triggerAnalysis = useCallback(
		async (snapshotId: string) => {
			if (!feature?.id) return;
			setIsWorking(true);
			setError(null);
			try {
				const response = await fetch(
					`/api/v1/projects/${encodeURIComponent(feature.id)}/codebase/analysis`,
					{
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ snapshotId }),
					},
				);
				const body: unknown = await response.json().catch(() => null);
				if (
					!response.ok ||
					typeof body !== "object" ||
					body === null ||
					!("id" in body) ||
					typeof body.id !== "string"
				) {
					setError("Analisis codebase gagal. Coba analisis ulang.");
					return;
				}
				const parsed = safeParseAnalysisResponse(body);
				if (!parsed) {
					setError("Hasil analisis tidak valid.");
					return;
				}
				setAnalysis(parsed);
				if (parsed.output) setScreen(3);
			} catch {
				setError("Server tidak dapat dihubungi.");
			} finally {
				setIsWorking(false);
			}
		},
		[feature?.id],
	);

	const readStatus = useCallback(async () => {
		if (inFlight.current) return;
		inFlight.current = true;
		try {
			const queryParams = new URLSearchParams();
			if (status?.sessionId) queryParams.set("sessionId", status.sessionId);
			if (feature?.id) queryParams.set("projectId", feature.id);
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
			setStatus(parsed.data);
			const hasUsableSnapshot = Boolean(
				parsed.data.snapshotId &&
					SNAPSHOT_CONTEXT_STATUSES.includes(parsed.data.status),
			);
			const matchingInitialAnalysis =
				hasUsableSnapshot &&
				initialAnalysis?.output &&
				parsed.data.snapshotId === initialAnalysis.snapshotId
					? initialAnalysis
					: null;
			setAnalysis((current) =>
				!hasUsableSnapshot ||
				(current &&
					parsed.data.snapshotId &&
					current.snapshotId !== parsed.data.snapshotId)
					? null
					: (current ?? matchingInitialAnalysis),
			);
			if (
				feature?.id &&
				parsed.data.snapshotId &&
				SNAPSHOT_CONTEXT_STATUSES.includes(parsed.data.status) &&
				!parsed.data.analysisId &&
				analysisAttemptedFor.current !== parsed.data.snapshotId
			) {
				analysisAttemptedFor.current = parsed.data.snapshotId;
				void triggerAnalysis(parsed.data.snapshotId);
			}
			setScreen((current) => {
				if (matchingInitialAnalysis) return 3;
				if (hasUsableSnapshot) return current === 1 ? 2 : current;
				if (current === 1 && parsed.data.status !== "waiting_for_cli") return 2;
				return current;
			});
		} catch {
			setError("Server tidak dapat dihubungi. Coba lagi.");
		} finally {
			inFlight.current = false;
		}
	}, [
		codebase.id,
		feature?.id,
		status?.sessionId,
		triggerAnalysis,
		initialAnalysis,
	]);

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
			setScreen(1);
		} catch {
			setError("Server tidak dapat dihubungi.");
		} finally {
			setIsStarting(false);
		}
	};

	const snapshotReady =
		Boolean(
			status?.snapshotId && SNAPSHOT_CONTEXT_STATUSES.includes(status.status),
		) || hasStoredSnapshot;
	const [activeFeature, setActiveFeature] = useState<{
		id: string;
		name: string;
	} | null>(null);
	const resolvedFeature = feature ?? activeFeature;
	const effectiveFeatureId = resolvedFeature?.id ?? null;
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

	const kanban = useKanbanTasks({
		projectId: effectiveFeatureId ?? "",
		enabled: snapshotReady && Boolean(effectiveFeatureId),
	});
	const kanbanProgress = useMemo(() => {
		if (!kanban.data?.columns) return null;
		return computeKanbanProgress(kanban.data.columns);
	}, [kanban.data]);

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
		const list: CodebaseArtifactRef[] = [
			{
				id: `feature-${resolvedFeature.id}`,
				fileName: `feature-${featureSlug}.json`,
				fileSizeBytes: null,
				badge: "FITUR",
				description: `Spesifikasi fitur ${resolvedFeature.name}`,
			},
		];
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
		if (kanbanProgress && kanbanProgress.total > 0) {
			list.push({
				id: `tasks-${resolvedFeature.id}`,
				fileName: `tasks-${featureSlug}.json`,
				fileSizeBytes: null,
				badge: "KANBAN LIVE",
				description: "Task tree dan papan Kanban live",
			});
		}
		return list;
	}, [resolvedFeature, featureSlug, kanbanProgress, prdContent, acContent]);
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
				const mapped: AdaptiveQuestion[] = rawQuestions
					.slice(0, 3)
					.flatMap((item, index): AdaptiveQuestion[] => {
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
							.slice(0, 4)
							.map((option, optionIndex) => ({
								id: `${id}-opt${optionIndex + 1}`,
								label: option.trim(),
								recommended: optionIndex === 0,
							}));
						if (record.type !== "text" && options.length === 0) return [];
						return [{ id, title, options }];
					});
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
			if (effectiveFeatureId) return effectiveFeatureId;
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
				});
				return created.projectId;
			} catch {
				setError("Server tidak dapat dihubungi.");
				return null;
			} finally {
				setIsWorking(false);
			}
		},
		[snapshotReady, isWorking, effectiveFeatureId, codebase.id, codebase.name],
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

	const handleConfirmGenerate = useCallback(async () => {
		if (!effectiveFeatureId || isConfirming) return;
		setIsConfirming(true);
		try {
			const answersList = Object.entries(chatAnswers)
				.map(([questionId, answer]) => ({
					questionId,
					answer: answer.trim(),
				}))
				.filter((entry) => entry.answer.length > 0);
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
								prompt: lastFeaturePrompt || resolvedFeature?.name || "",
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
			const specMessage = buildFeatureMessage(
				resolvedFeature?.name ?? codebase.name,
				chatAnswers,
			);
			setChatMessages((current) => [
				...current,
				{
					id: `assistant-${Date.now()}`,
					role: "assistant" as const,
					content: `Spesifikasi ${resolvedFeature?.name ?? "fitur"} tersusun dari jawaban Anda: ${specMessage}. FileCard spesifikasi tersedia di bawah dan preview dokumen tampil di kanvas kanan.`,
				},
			]);
			await loadPrd();
			await loadAc();
			await kanban.refetch();
		} finally {
			setIsConfirming(false);
		}
	}, [
		effectiveFeatureId,
		isConfirming,
		chatAnswers,
		lastFeaturePrompt,
		resolvedFeature?.name,
		codebase.name,
		loadPrd,
		loadAc,
		kanban,
	]);

	if (snapshotReady) {
		const kanbanColumns = kanban.data?.columns ?? null;
		return (
			<main
				data-testid="codebase-workspace-page"
				className="flex h-dvh flex-col overflow-hidden bg-onyx text-snow"
			>
				<header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-graphite bg-charcoal px-4">
					<div className="flex min-w-0 items-center gap-2">
						<span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-snow text-xs font-extrabold text-onyx">
							V
						</span>
						<span className="shrink-0 text-[13px] font-semibold">
							VibeEverything
						</span>
						<span aria-hidden="true" className="shrink-0 text-slate">
							/
						</span>
						<span className="flex min-w-0 items-center gap-1.5 rounded-md border border-graphite bg-obsidian px-2 py-1 font-mono text-xs text-mist">
							<span
								aria-hidden="true"
								className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald"
							/>
							<span className="truncate">{codebase.name}</span>
						</span>
					</div>
					<span
						data-testid="codebase-sync-badge"
						className="shrink-0 rounded-md border border-graphite bg-obsidian px-2.5 py-1 font-mono text-[11px] text-fog"
					>
						{typeof (status?.fileCount ?? manifestFileCount) === "number" &&
						(status?.fileCount ?? manifestFileCount ?? 0) > 0
							? `${status?.fileCount ?? manifestFileCount} file tersinkron`
							: "Menunggu snapshot"}
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
						canvasOpen={true}
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
								codebaseName={codebase.name}
								featureName={resolvedFeature?.name ?? codebase.name}
								contextFiles={contextFiles}
								kanbanProgress={kanbanProgress}
								messages={chatMessages}
								questions={aiQuestions}
								answers={chatAnswers}
								questionsLoading={questionsLoading}
								questionsError={questionsError}
								artifacts={artifacts}
								activeArtifactId={activeArtifactId}
								projectIdForHandoff={effectiveFeatureId}
								isSending={isWorking}
								isConfirming={isConfirming}
								onOpenArtifact={(artifact) => {
									setActiveArtifactId(artifact.id);
									if (
										resolvedFeature &&
										artifact.id === `tasks-${resolvedFeature.id}`
									) {
										setCanvasView("kanban");
									}
								}}
								onSubmitAnswer={handleSubmitAnswer}
								onSendMessage={(message) => void handleSendMessage(message)}
								onConfirmGenerate={() => void handleConfirmGenerate()}
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
								onClose={() => setActiveArtifactId(null)}
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
										<CodebaseMarkdown content={prdContent} />
									) : null
								) : isAcArtifactActive ? (
									acContent ? (
										<CodebaseMarkdown content={acContent} />
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
											className="flex flex-col gap-4"
										>
											{kanbanColumns &&
											(kanbanColumns.pending.length > 0 ||
												kanbanColumns.in_progress.length > 0 ||
												kanbanColumns.completed.length > 0) ? (
												(
													[
														["pending", "To Do", kanbanColumns.pending],
														[
															"in_progress",
															"In Progress",
															kanbanColumns.in_progress,
														],
														["completed", "Done", kanbanColumns.completed],
													] as const
												).map(([key, label, cards]) => (
													<div key={key} className="flex flex-col gap-2">
														<p className="font-mono text-[11px] font-semibold uppercase text-indigo">
															{label} ({cards.length})
														</p>
														{cards.length === 0 ? (
															<p className="text-[11px] italic text-slate">
																Tidak ada task pada status ini.
															</p>
														) : (
															cards.map((card) => (
																<label
																	key={card.id}
																	className="flex cursor-default items-start gap-2.5 rounded-lg border border-graphite bg-charcoal p-2.5"
																>
																	<input
																		type="checkbox"
																		checked={card.status === "completed"}
																		disabled
																		readOnly
																		aria-label={card.name}
																		className="mt-0.5 h-4 w-4 shrink-0 rounded border border-graphite align-middle"
																	/>
																	<span
																		className={`min-w-0 flex-1 text-xs leading-5 ${
																			card.status === "completed"
																				? "text-slate line-through"
																				: "text-mist"
																		}`}
																	>
																		{card.name}
																	</span>
																</label>
															))
														)}
													</div>
												))
											) : (
												<p className="text-xs text-fog">
													{kanban.isLoading
														? "Memuat task..."
														: "Belum ada task pada project ini."}
												</p>
											)}
										</div>
									)
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
			{screen === 1 && (
				<ScreenConnect
					projectName={codebase.name}
					payload={payload}
					isStarting={isStarting}
					onAgentStarted={() => setScreen(2)}
				/>
			)}
			{screen === 2 && (
				<SyncStatus
					projectId={codebase.id}
					projectName={codebase.name}
					status={status}
					statusPath={`/api/codebases/${encodeURIComponent(codebase.id)}/status`}
					onStatus={setStatus}
					onRetrySync={() => void startSession("retry")}
					onRetryAnalysis={
						feature && status?.snapshotId
							? () => {
									const snapshotId = status.snapshotId;
									if (snapshotId) void triggerAnalysis(snapshotId);
								}
							: undefined
					}
				/>
			)}
		</main>
	);
}

function safeParseAnalysisResponse(input: object): AnalysisResponse | null {
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
