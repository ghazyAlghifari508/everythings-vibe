import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CodebaseArtifactCanvas } from "@/components/codebase/codebase-artifact-canvas";
import { CodebaseChatWorkspace } from "@/components/codebase/codebase-chat-workspace";
import { CodebaseExplorerSidebar } from "@/components/codebase/codebase-explorer-sidebar";
import type { CodebaseArtifactRef } from "@/components/codebase/codebase-file-card";
import { CodebaseKanbanBoard } from "@/components/codebase/codebase-kanban-board";
import { CodebaseWorkspaceShell } from "@/components/codebase/codebase-workspace-shell";
import { ScreenConnect } from "@/components/codebase/screen-connect";
import { SyncStatus } from "@/components/codebase/sync-status";
import { useKanbanTasks } from "@/hooks/use-kanban-polling";
import {
	type AnalysisResponse,
	safeParseCodebaseAnalysis,
} from "@/lib/codebase-analysis";
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
		return { codebase, feature, analysis };
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
	} = Route.useLoaderData();
	const navigate = useNavigate();
	const [payload, setPayload] = useState<SyncPromptPayload | null>(null);
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

	const snapshotReady = Boolean(
		status?.snapshotId && SNAPSHOT_CONTEXT_STATUSES.includes(status.status),
	);
	const [canvasOpen, setCanvasOpen] = useState(true);
	const [activeArtifactId, setActiveArtifactId] = useState<string | null>(null);
	const [canvasView, setCanvasView] = useState<"kanban" | "checklist">(
		"kanban",
	);

	const kanban = useKanbanTasks({
		projectId: feature?.id ?? "",
		enabled: snapshotReady && Boolean(feature?.id),
	});
	const kanbanProgress = useMemo(() => {
		if (!kanban.data?.columns) return null;
		return computeKanbanProgress(kanban.data.columns);
	}, [kanban.data]);

	const analysisOutput = analysis?.output ?? null;
	const explorerFiles = useMemo(() => {
		if (!analysisOutput) return [];
		const seen = new Set<string>();
		const entries: Array<{ path: string; summary?: string }> = [];
		for (const item of analysisOutput.moduleMap ?? []) {
			if (!seen.has(item.path)) {
				seen.add(item.path);
				entries.push({ path: item.path, summary: item.summary });
			}
		}
		for (const path of analysisOutput.relevantFiles ?? []) {
			if (!seen.has(path)) {
				seen.add(path);
				entries.push({ path });
			}
		}
		return entries;
	}, [analysisOutput]);
	const explorerStack = useMemo(() => {
		if (!analysisOutput) return [];
		const raw = [
			analysisOutput.framework,
			analysisOutput.language,
			analysisOutput.database,
			analysisOutput.auth,
			analysisOutput.packageManager,
			...(analysisOutput.dependencies ?? []).slice(0, 5),
		];
		return raw.filter(
			(value): value is string =>
				typeof value === "string" &&
				value.trim().length > 0 &&
				value.trim() !== "Tidak terdeteksi",
		);
	}, [analysisOutput]);
	const contextFiles = useMemo(
		() => (analysisOutput?.relevantFiles ?? []).slice(0, 2),
		[analysisOutput],
	);
	const featureSlug = useMemo(() => {
		const base = (feature?.name ?? codebase.name)
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 40);
		return base || "fitur";
	}, [feature?.name, codebase.name]);
	const artifacts = useMemo<CodebaseArtifactRef[]>(() => {
		if (!feature) return [];
		const list: CodebaseArtifactRef[] = [
			{
				id: `feature-${feature.id}`,
				fileName: `feature-${featureSlug}.json`,
				fileSizeBytes: null,
				badge: "FITUR",
				description: `Spesifikasi fitur ${feature.name}`,
			},
		];
		if (kanbanProgress && kanbanProgress.total > 0) {
			list.push({
				id: `tasks-${feature.id}`,
				fileName: `tasks-${featureSlug}.json`,
				fileSizeBytes: null,
				badge: "KANBAN LIVE",
				description: `Task tree dan papan Kanban live`,
			});
		}
		return list;
	}, [feature, featureSlug, kanbanProgress]);
	const activeArtifact =
		artifacts.find((item) => item.id === activeArtifactId) ?? null;
	const isTasksArtifactActive =
		Boolean(activeArtifact) &&
		feature != null &&
		activeArtifact?.id === `tasks-${feature.id}`;

	const ensureFeatureAndGo = async (message: string) => {
		const trimmed = message.trim();
		if (!snapshotReady || trimmed.length < 3 || isWorking) return;
		if (feature?.id) {
			await navigate({ to: "/ask/$id", params: { id: feature.id } });
			return;
		}
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
				return;
			}
			await navigate({ to: "/ask/$id", params: { id: body.projectId } });
		} catch {
			setError("Server tidak dapat dihubungi.");
		} finally {
			setIsWorking(false);
		}
	};

	const handleSubmitAnswers = (answers: Record<string, string>) => {
		const message = Object.values(answers)
			.map((value) => value.trim())
			.filter((value) => value.length > 0)
			.join(" ");
		void ensureFeatureAndGo(
			message.length >= 3
				? `Rencanakan fitur ${feature?.name ?? codebase.name}: ${message}`
				: `Rencanakan fitur ${feature?.name ?? codebase.name}`,
		);
	};

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
					<button
						type="button"
						onClick={() => setCanvasOpen((current) => !current)}
						aria-expanded={canvasOpen}
						className="inline-flex min-h-9 shrink-0 items-center rounded-md border border-graphite bg-obsidian px-3 text-xs font-medium text-mist transition hover:border-steel hover:text-snow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
					>
						{canvasOpen ? "Tutup Preview" : "Buka Preview"}
					</button>
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
								fileCount={status?.fileCount}
								files={explorerFiles}
								stack={explorerStack}
							/>
						}
						chatPane={
							<CodebaseChatWorkspace
								codebaseName={codebase.name}
								featureName={feature?.name ?? codebase.name}
								contextFiles={contextFiles}
								kanbanProgress={kanbanProgress}
								questions={[
									{
										id: "storage",
										title:
											"Bagaimana mekanisme penyimpanan data fitur yang Anda inginkan?",
										options: [
											{
												id: "local",
												label: "Penyimpanan lokal di browser tanpa akun login.",
											},
											{
												id: "database",
												label:
													"Database PostgreSQL terautentikasi berelasi user_id.",
												recommended: true,
											},
										],
										customPlaceholder:
											"Atau ketik preferensi penyimpanan sendiri...",
									},
									{
										id: "feedback",
										title: "Bagaimana feedback UI saat aksi utama berhasil?",
										options: [
											{
												id: "toast",
												label:
													"Toast notification interaktif dengan tombol Undo.",
												recommended: true,
											},
											{
												id: "inline",
												label: "Indikator inline berubah tanpa popup banner.",
											},
										],
									},
								]}
								artifacts={artifacts}
								activeArtifactId={activeArtifactId}
								projectIdForHandoff={feature?.id ?? null}
								isSending={isWorking}
								onOpenArtifact={(artifact) => {
									setActiveArtifactId(artifact.id);
									if (feature && artifact.id === `tasks-${feature.id}`) {
										setCanvasView("kanban");
									}
									setCanvasOpen(true);
								}}
								onSubmitAnswers={handleSubmitAnswers}
								onSendMessage={(message) => void ensureFeatureAndGo(message)}
							/>
						}
						canvasPane={
							<CodebaseArtifactCanvas
								fileName={activeArtifact?.fileName ?? "Preview artefak"}
								badge={activeArtifact?.badge ?? "PRATINJAU"}
								onClose={() => setCanvasOpen(false)}
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
								{!activeArtifact || !feature ? (
									<div className="flex h-full flex-col items-start justify-center gap-3 p-2">
										<p className="text-sm font-semibold text-snow">
											Belum ada artefak terpilih
										</p>
										<p className="max-w-sm text-xs leading-5 text-fog">
											Pilih FileCard di kolom chat untuk preview, atau lanjutkan
											ke tahap berikut setelah fitur dibuat.
										</p>
										{feature ? (
											<div className="flex flex-wrap gap-2">
												<button
													type="button"
													onClick={() =>
														void navigate({
															to: "/ask/$id",
															params: { id: feature.id },
														})
													}
													className="inline-flex min-h-11 items-center rounded-md bg-snow px-3 text-xs font-semibold text-onyx hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
												>
													Buka tanya jawab
												</button>
												<button
													type="button"
													onClick={() =>
														void navigate({
															to: "/kanban/$id",
															params: { id: feature.id },
														})
													}
													className="inline-flex min-h-11 items-center rounded-md border border-graphite bg-charcoal px-3 text-xs font-medium text-snow hover:border-steel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
												>
													Buka board penuh
												</button>
											</div>
										) : null}
									</div>
								) : isTasksArtifactActive ? (
									canvasView === "kanban" ? (
										<CodebaseKanbanBoard
											projectId={feature.id}
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
												{feature.name}
											</p>
											<p className="mt-1 font-mono text-[11px] text-fog">
												Project: {feature.id}
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
										<div className="flex flex-wrap gap-2">
											<button
												type="button"
												onClick={() =>
													void navigate({
														to: "/ask/$id",
														params: { id: feature.id },
													})
												}
												className="inline-flex min-h-11 items-center rounded-md bg-snow px-3 text-xs font-semibold text-onyx hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
											>
												Buka tanya jawab
											</button>
											<button
												type="button"
												onClick={() =>
													void navigate({
														to: "/kanban/$id",
														params: { id: feature.id },
													})
												}
												className="inline-flex min-h-11 items-center rounded-md border border-graphite bg-charcoal px-3 text-xs font-medium text-snow hover:border-steel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
											>
												Buka board penuh
											</button>
										</div>
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
