import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import {
	AlertCircle,
	ArrowLeft,
	Download,
	Loader2,
	Monitor,
	Smartphone,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { StudioCanvas } from "@/components/design/studio-canvas";
import { StudioComposer } from "@/components/design/studio-composer";
import type {
	StudioFrameRow,
	StudioJobRow,
	StudioProjectRow,
	StudioRevisionRow,
} from "@/db/schema";
import { requireUserServer } from "@/lib/session";
import { exportProjectAsZip } from "@/lib/studio-export";

export interface StudioDetailLoaderData {
	project: StudioProjectRow;
	frames: StudioFrameRow[];
	activeJob: StudioJobRow | null;
	logoUrl: string | null;
	revisions: StudioRevisionRow[];
	latest: StudioRevisionRow | null;
}

const loadStudioDetail = createServerFn({ method: "GET" })
	.validator((id: string) => id)
	.handler(async ({ data: id }) => {
		const user = await requireUserServer();
		const { getStudioProjectDetail } = await import(
			"@/lib/services/studio-service"
		);
		const detail = await getStudioProjectDetail(id, user.id);
		return {
			project: detail.project,
			frames: detail.frames,
			activeJob: detail.activeJob,
			logoUrl: detail.logoUrl,
			revisions: detail.revisions,
			latest: detail.latest,
		};
	});

export const Route = createFileRoute("/design/studio/$id")({
	head: () => ({
		meta: [{ title: "Studio Canvas | VibeDesign" }],
	}),
	loader: async ({ params }) => {
		try {
			return await loadStudioDetail({ data: params.id });
		} catch (e) {
			if (e instanceof Error && e.message === "Unauthorized") {
				throw redirect({ to: "/login" });
			}
			throw e;
		}
	},
	component: StudioDetailPage,
	errorComponent: () => (
		<main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
			<p className="rounded-xl border border-graphite bg-charcoal p-8 text-center text-sm text-mist">
				Studio tidak ditemukan atau gagal dimuat.
			</p>
		</main>
	),
});

function StudioDetailPage() {
	const initialData = Route.useLoaderData();
	if (!initialData?.project) throw new Error("NOT_FOUND");

	const [project, setProject] = useState(initialData.project);
	const [frames, setFrames] = useState<StudioFrameRow[]>(initialData.frames);
	const [activeJob, setActiveJob] = useState<StudioJobRow | null>(
		initialData.activeJob,
	);
	const [selectedFrameId, setSelectedFrameId] = useState<string | null>(null);
	const [composerLoading, setComposerLoading] = useState(false);
	const [exportingZip, setExportingZip] = useState(false);
	const [error, setError] = useState("");

	const selectedFrame = useMemo(
		() => frames.find((f) => f.id === selectedFrameId) ?? null,
		[frames, selectedFrameId],
	);

	const isProcessing = useMemo(() => {
		if (
			activeJob &&
			(activeJob.status === "queued" ||
				activeJob.status === "planning" ||
				activeJob.status === "generating")
		) {
			return true;
		}
		return frames.some(
			(f) => f.status === "queued" || f.status === "generating",
		);
	}, [activeJob, frames]);

	const readyFramesCount = useMemo(
		() => frames.filter((f) => f.status === "ready").length,
		[frames],
	);

	// Poll authoritative status while jobs or frames are actively processing
	const syncProjectStatus = useCallback(async () => {
		try {
			const res = await fetch(
				`/api/studio/project?id=${encodeURIComponent(project.id)}`,
			);
			if (!res.ok) return;
			const data = (await res.json()) as {
				project: StudioProjectRow;
				frames: StudioFrameRow[];
				activeJob: StudioJobRow | null;
			};
			if (data.project) setProject(data.project);
			if (data.frames) setFrames(data.frames);
			if (data.activeJob !== undefined) setActiveJob(data.activeJob);
		} catch {
			// Network hiccup during polling
		}
	}, [project.id]);

	useEffect(() => {
		if (!isProcessing) return;
		const timer = setInterval(() => {
			void syncProjectStatus();
		}, 1500);
		return () => clearInterval(timer);
	}, [isProcessing, syncProjectStatus]);

	async function handleComposerSubmit(promptText: string) {
		setComposerLoading(true);
		setError("");
		try {
			if (selectedFrameId) {
				const res = await fetch("/api/studio/frame", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						action: "revise",
						projectId: project.id,
						frameId: selectedFrameId,
						prompt: promptText,
					}),
				});
				if (!res.ok) {
					const data = (await res.json().catch(() => null)) as {
						error?: string;
					} | null;
					setError(data?.error ?? "Gagal merevisi layar.");
					return;
				}
			} else {
				// Add frame or project-wide revision
				const res = await fetch("/api/studio/frame", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						action: "add",
						projectId: project.id,
						name: `Layar ${frames.length + 1}`,
						prompt: promptText,
						viewport: project.designMode,
					}),
				});
				if (!res.ok) {
					const data = (await res.json().catch(() => null)) as {
						error?: string;
					} | null;
					setError(data?.error ?? "Gagal menambahkan layar.");
					return;
				}
			}
			await syncProjectStatus();
		} catch {
			setError("Jaringan bermasalah. Coba lagi.");
		} finally {
			setComposerLoading(false);
		}
	}

	async function handleRetryFrame(frameId: string) {
		try {
			setFrames((prev) =>
				prev.map((f) =>
					f.id === frameId ? { ...f, status: "generating" } : f,
				),
			);
			await fetch("/api/studio/frame", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					action: "retry",
					projectId: project.id,
					frameId,
				}),
			});
			await syncProjectStatus();
		} catch {
			// Retry trigger error handled by sync
		}
	}

	async function handleRetryPlanning() {
		try {
			const res = await fetch("/api/studio/frame", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					action: "retry-planning",
					projectId: project.id,
				}),
			});
			if (!res.ok) {
				const data = (await res.json().catch(() => null)) as {
					error?: string;
				} | null;
				setError(data?.error ?? "Gagal mencoba lagi perencanaan.");
				return;
			}
			await syncProjectStatus();
		} catch {
			setError("Jaringan bermasalah. Coba lagi.");
		}
	}

	async function handleDownloadAllZip() {
		if (frames.length === 0 || exportingZip) return;
		setExportingZip(true);
		try {
			await exportProjectAsZip(project.title, frames);
		} catch {
			setError("Gagal menyiapkan bundel ZIP unduhan.");
		} finally {
			setExportingZip(false);
		}
	}

	return (
		<main className="flex h-[calc(100vh-3.5rem)] w-full flex-col overflow-hidden bg-[#0a0a0c] text-snow relative">
			{/* Top Workspace Header */}
			<header className="z-20 flex h-14 w-full shrink-0 items-center justify-between border-b border-graphite bg-[#121215] px-4">
				<div className="flex items-center gap-3">
					<Link
						to="/design/studio"
						className="inline-flex items-center gap-1.5 rounded-lg border border-graphite/60 bg-onyx px-2.5 py-1 text-xs font-semibold text-fog hover:bg-charcoal hover:text-snow transition-colors"
					>
						<ArrowLeft size={14} aria-hidden />
						<span className="hidden sm:inline">Studio</span>
					</Link>
					<div className="flex items-center gap-2">
						<h1 className="text-sm font-semibold tracking-tight text-snow sm:text-base">
							{project.title}
						</h1>
						<div className="flex items-center gap-1.5">
							<span className="font-mono text-[10px] uppercase tracking-wider rounded border border-graphite bg-onyx px-1.5 py-0.5 text-fog inline-flex items-center gap-1">
								{project.designMode === "mobile" ? (
									<Smartphone size={10} />
								) : (
									<Monitor size={10} />
								)}
								<span>
									{project.designMode === "mobile" ? "Mobile" : "Web"}
								</span>
							</span>
							{project.designMd && (
								<span className="font-mono text-[10px] rounded border border-graphite bg-onyx px-1.5 py-0.5 text-mist">
									DESIGN.md
								</span>
							)}
							{project.logoAssetId && (
								<span className="font-mono text-[10px] rounded border border-graphite bg-onyx px-1.5 py-0.5 text-mist">
									Logo
								</span>
							)}
						</div>
					</div>
				</div>

				{/* Center: Generation Status Badge */}
				<div className="hidden md:flex items-center gap-2">
					{isProcessing ? (
						<div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs text-indigo-300 animate-pulse">
							<Loader2 size={12} className="animate-spin" />
							<span>
								{activeJob?.status === "planning"
									? "Merencanakan layar..."
									: `Menggenerate ${readyFramesCount}/${frames.length} layar...`}
							</span>
						</div>
					) : (
						<div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-400">
							<span className="size-1.5 rounded-full bg-emerald-400" />
							<span>{frames.length} Layar Siap</span>
						</div>
					)}
				</div>

				{/* Right: Actions */}
				<div className="flex items-center gap-2">
					<button
						type="button"
						onClick={() => void handleDownloadAllZip()}
						disabled={exportingZip || frames.length === 0}
						className="inline-flex items-center gap-1.5 rounded-full border border-graphite bg-charcoal px-3 py-1.5 text-xs font-semibold text-snow hover:bg-onyx transition-colors disabled:opacity-40"
					>
						{exportingZip ? (
							<Loader2 size={13} className="animate-spin" />
						) : (
							<Download size={13} />
						)}
						<span className="hidden sm:inline">Download ZIP</span>
					</button>
				</div>
			</header>

			{/* Main Fullscreen Canvas Workspace */}
			<div className="relative flex-1 w-full overflow-hidden">
				<StudioCanvas
					project={project}
					frames={frames}
					activeJob={activeJob}
					selectedFrameId={selectedFrameId}
					onSelectFrame={setSelectedFrameId}
					onRetryFrame={handleRetryFrame}
					onRetryPlanning={handleRetryPlanning}
					className="size-full"
				/>

				{/* Floating AI Prompt Composer */}
				<StudioComposer
					selectedFrameName={selectedFrame?.name ?? null}
					onClearSelectedFrame={() => setSelectedFrameId(null)}
					onSubmit={handleComposerSubmit}
					loading={composerLoading}
				/>
			</div>

			{/* Error Toast if any */}
			{error && (
				<div
					role="alert"
					className="fixed bottom-24 left-1/2 z-40 -translate-x-1/2 flex items-center gap-2 rounded-xl border border-red-500/40 bg-red-500/20 px-4 py-2.5 text-xs text-red-300 shadow-xl backdrop-blur-md"
				>
					<AlertCircle size={15} />
					<span>{error}</span>
					<button
						type="button"
						onClick={() => setError("")}
						className="ml-2 text-red-400 hover:text-snow"
					>
						Tutup
					</button>
				</div>
			)}
		</main>
	);
}
