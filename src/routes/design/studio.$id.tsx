import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { AlertCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { StudioCanvas } from "@/components/design/studio-canvas";
import {
	StudioComposer,
	type StudioComposerScope,
} from "@/components/design/studio-composer";
import { StudioDesignPicker } from "@/components/design/studio-design-picker";
import { StudioHeader } from "@/components/design/studio-header";
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
	const [selectedFrameIds, setSelectedFrameIds] = useState<string[]>([]);
	const [composerLoading, setComposerLoading] = useState(false);
	const [exportingZip, setExportingZip] = useState(false);
	const [error, setError] = useState("");
	const [duplicating, setDuplicating] = useState(false);
	const navigate = useNavigate();

	async function handleDuplicate() {
		if (duplicating) return;
		setDuplicating(true);
		setError("");
		try {
			const response = await fetch("/api/studio/project", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ action: "duplicate", projectId: project.id }),
			});
			const result: unknown = await response.json();
			if (
				!response.ok ||
				typeof result !== "object" ||
				result === null ||
				!("projectId" in result) ||
				typeof result.projectId !== "string"
			) {
				throw new Error("Gagal menduplikasi project. Coba lagi.");
			}
			await navigate({
				to: "/design/studio/$id",
				params: { id: result.projectId },
			});
		} catch (failure) {
			setError(
				failure instanceof Error
					? failure.message
					: "Gagal menduplikasi project.",
			);
		} finally {
			setDuplicating(false);
		}
	}

	const selectedFrame = useMemo(
		() => frames.find((f) => f.id === selectedFrameId) ?? null,
		[frames, selectedFrameId],
	);
	const selectFrame = useCallback((id: string | null, additive = false) => {
		setSelectedFrameIds((previous) =>
			id === null
				? []
				: additive
					? previous.includes(id)
						? previous.filter((entry) => entry !== id)
						: [...previous, id]
					: [id],
		);
		setSelectedFrameId(id);
	}, []);

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

	async function handleComposerSubmit(
		promptText: string,
		scope: StudioComposerScope,
	): Promise<boolean> {
		setComposerLoading(true);
		setError("");
		try {
			const res = await fetch("/api/studio/frame", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					action: "operation",
					projectId: project.id,
					scope,
					frameIds: scope === "revise" ? selectedFrameIds : undefined,
					prompt: promptText,
					requestId: crypto.randomUUID(),
				}),
			});
			if (!res.ok) {
				const data: unknown = await res.json().catch(() => null);
				setError(
					typeof data === "object" &&
						data !== null &&
						"error" in data &&
						typeof data.error === "string"
						? data.error
						: "Permintaan desain ditolak.",
				);
				return false;
			}
			await syncProjectStatus();
			return true;
		} catch {
			setError("Jaringan bermasalah. Coba lagi.");
			return false;
		} finally {
			setComposerLoading(false);
		}
	}

	async function handleRetryFrame(frameId: string) {
		try {
			const response = await fetch("/api/studio/frame", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					action: "retry",
					projectId: project.id,
					frameId,
				}),
			});
			if (!response.ok) throw new Error("Permintaan retry gagal. Coba lagi.");
			await syncProjectStatus();
		} catch (failure) {
			setError(
				failure instanceof Error ? failure.message : "Permintaan retry gagal.",
			);
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
		<main className="relative flex h-dvh min-h-0 w-full flex-col overflow-hidden bg-charcoal text-snow">
			<StudioHeader
				title={project.title}
				duplicating={duplicating}
				exporting={exportingZip}
				canExport={readyFramesCount > 0}
				onDuplicate={() => void handleDuplicate()}
				onExport={() => void handleDownloadAllZip()}
			/>

			{/* Main Fullscreen Canvas Workspace */}
			<div className="relative flex-1 w-full overflow-hidden">
				<StudioCanvas
					project={project}
					frames={frames}
					activeJob={activeJob}
					selectedFrameId={selectedFrameId}
					selectedFrameIds={selectedFrameIds}
					onSelectFrame={selectFrame}
					onRetryFrame={handleRetryFrame}
					onRetryPlanning={handleRetryPlanning}
					className="size-full"
				/>

				{/* Floating AI Prompt Composer */}
				<StudioComposer
					selectedFrames={frames.filter((frame) =>
						selectedFrameIds.includes(frame.id),
					)}
					onRemoveFrame={(id) => {
						setSelectedFrameIds((previous) =>
							previous.filter((entry) => entry !== id),
						);
						if (selectedFrameId === id) setSelectedFrameId(null);
					}}
					designSystemControl={
						<StudioDesignPicker
							designMd={project.designMd}
							disabled={isProcessing || composerLoading}
							onApply={async (reference) => {
								const response = await fetch("/api/studio/project", {
									method: "POST",
									headers: { "Content-Type": "application/json" },
									body: JSON.stringify({
										action: "design-system",
										projectId: project.id,
										...reference,
									}),
								});
								if (!response.ok) {
									const result: unknown = await response
										.json()
										.catch(() => null);
									throw new Error(
										typeof result === "object" &&
											result !== null &&
											"error" in result &&
											typeof result.error === "string"
											? result.error
											: "Gagal menyimpan design system.",
									);
								}
								await syncProjectStatus();
								return true;
							}}
						/>
					}
					selectedFrameName={selectedFrame?.name ?? null}
					onClearSelectedFrame={() => selectFrame(null)}
					onSubmit={handleComposerSubmit}
					loading={composerLoading}
				/>
			</div>

			{/* Error Toast if any */}
			{error && (
				<div
					role="alert"
					className="absolute top-16 left-1/2 z-40 flex w-[calc(100%-24px)] max-w-xl -translate-x-1/2 items-center gap-2 rounded-xl border border-crimson bg-obsidian px-4 py-2.5 text-sm text-crimson"
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
