import {
	createFileRoute,
	redirect,
	useNavigate,
	useRouter,
} from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { AlertCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AttachedDesignReference } from "@/components/design/start-with-design-modal";
import { StudioCanvas } from "@/components/design/studio-canvas";
import {
	StudioComposer,
	type StudioComposerScope,
} from "@/components/design/studio-composer";
import { StudioDesignPicker } from "@/components/design/studio-design-picker";
import { StudioHeader } from "@/components/design/studio-header";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import type {
	StudioFrameRow,
	StudioJobRow,
	StudioProjectRow,
	StudioRevisionRow,
} from "@/db/schema";
import { requireUserServer } from "@/lib/session";
import { exportProjectAsZip } from "@/lib/studio-export";
import type { StudioDesignSkillId } from "@/lib/studio-generation-options";
import { STUDIO_DESIGN_PRESETS } from "@/lib/studio-presets";
import { useUIStore } from "@/store";

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
	return (
		<StudioWorkspace key={initialData.project.id} initialData={initialData} />
	);
}

function StudioWorkspace({
	initialData,
}: {
	initialData: StudioDetailLoaderData;
}) {
	const [project, setProject] = useState(initialData.project);
	const [frames, setFrames] = useState<StudioFrameRow[]>(initialData.frames);
	const [activeJob, setActiveJob] = useState<StudioJobRow | null>(
		initialData.activeJob,
	);
	const [selectedFrameId, setSelectedFrameId] = useState<string | null>(null);
	const [selectedFrameIds, setSelectedFrameIds] = useState<string[]>([]);
	const [composerLoading, setComposerLoading] = useState(false);
	const [exportingZip, setExportingZip] = useState(false);
	const [deleting, setDeleting] = useState(false);
	const [isAddFrameOpen, setIsAddFrameOpen] = useState(false);
	const [error, setError] = useState("");
	const [duplicating, setDuplicating] = useState(false);
	const navigate = useNavigate();
	const router = useRouter();
	const showToast = useUIStore((state) => state.showToast);
	const pendingRequest = useRef<{ signature: string; id: string } | null>(null);

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
		setSelectedFrameId(additive ? null : id);
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
			// 404 means the project no longer exists (deleted here or in another
			// tab). Leave the workspace instead of polling a dead id forever.
			if (res.status === 404) {
				void router.invalidate();
				return;
			}
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
	}, [project.id, router]);

	useEffect(() => {
		if (!isProcessing) return;
		const timer = setInterval(() => {
			void syncProjectStatus();
		}, 1500);
		return () => clearInterval(timer);
	}, [isProcessing, syncProjectStatus]);

	async function handleDelete() {
		if (deleting) return;
		setDeleting(true);
		setError("");
		try {
			const response = await fetch("/api/studio/project", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ action: "delete", projectId: project.id }),
			});
			if (!response.ok) {
				const body: unknown = await response.json().catch(() => null);
				throw new Error(
					typeof body === "object" &&
						body !== null &&
						"error" in body &&
						typeof body.error === "string"
						? body.error
						: "Gagal menghapus project. Coba lagi.",
				);
			}
			showToast("Project dihapus.", "success");
			await router.invalidate();
			await navigate({ to: "/design/studio" });
		} catch (failure) {
			setError(
				failure instanceof Error ? failure.message : "Gagal menghapus project.",
			);
			throw failure;
		} finally {
			setDeleting(false);
		}
	}

	async function handleComposerSubmit(
		promptText: string,
		scope: StudioComposerScope,
	): Promise<boolean> {
		setComposerLoading(true);
		setError("");
		const signature = JSON.stringify({ promptText, scope, selectedFrameIds });
		if (pendingRequest.current?.signature !== signature)
			pendingRequest.current = { signature, id: crypto.randomUUID() };
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
					requestId: pendingRequest.current.id,
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
			pendingRequest.current = null;
			return true;
		} catch {
			setError("Jaringan bermasalah. Coba lagi.");
			return false;
		} finally {
			setComposerLoading(false);
		}
	}

	// Adding a screen is an explicit project-level action, never inferred from
	// prompt wording, so an add request can never be silently turned into a
	// project-wide revision.
	async function handleAddFrame(input: { name: string; prompt: string }) {
		setComposerLoading(true);
		setError("");
		try {
			const response = await fetch("/api/studio/frame", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					action: "add",
					projectId: project.id,
					name: input.name,
					prompt: input.prompt,
				}),
			});
			if (!response.ok) {
				const data: unknown = await response.json().catch(() => null);
				throw new Error(
					typeof data === "object" &&
						data !== null &&
						"error" in data &&
						typeof data.error === "string"
						? data.error
						: "Gagal menambah halaman baru.",
				);
			}
			setIsAddFrameOpen(false);
			await syncProjectStatus();
			showToast("Halaman baru ditambahkan.", "success");
		} catch (failure) {
			setError(
				failure instanceof Error
					? failure.message
					: "Gagal menambah halaman baru.",
			);
		} finally {
			setComposerLoading(false);
		}
	}

	async function handleApplyDesignSystem(
		reference: AttachedDesignReference,
	): Promise<boolean> {
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
			const result: unknown = await response.json().catch(() => null);
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
	}

	// Skill changes persist immediately so every later revision reads the
	// stored selection. The row is never updated optimistically.
	async function handleSkillChange(skillId: StudioDesignSkillId) {
		if (isProcessing || composerLoading || project.designSkillId === skillId)
			return;
		setComposerLoading(true);
		setError("");
		try {
			const response = await fetch("/api/studio/project", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					action: "preferences",
					projectId: project.id,
					designSkillId: skillId,
				}),
			});
			if (!response.ok) {
				const data: unknown = await response.json().catch(() => null);
				throw new Error(
					typeof data === "object" &&
						data !== null &&
						"error" in data &&
						typeof data.error === "string"
						? data.error
						: "Gagal menyimpan design skill.",
				);
			}
			await syncProjectStatus();
		} catch (failure) {
			setError(
				failure instanceof Error
					? failure.message
					: "Gagal menyimpan design skill.",
			);
		} finally {
			setComposerLoading(false);
		}
	}

	const storedReferenceLabel = (() => {
		const reference = project.designReference;
		if (reference?.kind === "theme") {
			const preset = STUDIO_DESIGN_PRESETS.find(
				(entry) => entry.id === reference.id,
			);
			return preset ? `${preset.name}` : null;
		}
		if (reference?.kind === "custom") return reference.filename;
		if (project.designMd) return "Referensi desain";
		return null;
	})();

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
				deleting={deleting}
				canExport={readyFramesCount > 0}
				onDuplicate={() => void handleDuplicate()}
				onExport={() => void handleDownloadAllZip()}
				onDelete={handleDelete}
				onAddFrame={() => setIsAddFrameOpen(true)}
				designSystemControl={
					<StudioDesignPicker
						designMd={project.designMd}
						disabled={isProcessing || composerLoading}
						onApply={handleApplyDesignSystem}
					/>
				}
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
					onSubmit={handleComposerSubmit}
					loading={composerLoading}
					designSkillId={project.designSkillId}
					onDesignSkillChange={handleSkillChange}
					referenceLabel={storedReferenceLabel}
				/>
			</div>

			{/* Explicit add-screen flow, kept out of the composer */}
			<AddFrameDialog
				open={isAddFrameOpen}
				onOpenChange={setIsAddFrameOpen}
				busy={composerLoading}
				onSubmit={handleAddFrame}
			/>

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

function AddFrameDialog({
	open,
	onOpenChange,
	busy,
	onSubmit,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	busy: boolean;
	onSubmit: (input: { name: string; prompt: string }) => Promise<void>;
}) {
	const [name, setName] = useState("");
	const [prompt, setPrompt] = useState("");
	const [localError, setLocalError] = useState("");
	const canSubmit =
		name.trim().length > 0 && prompt.trim().length >= 10 && !busy;

	useEffect(() => {
		if (open) {
			setName("");
			setPrompt("");
			setLocalError("");
		}
	}, [open]);

	async function submit() {
		if (!canSubmit) {
			setLocalError(
				"Isi nama halaman dan instruksi minimal 10 karakter sebelum melanjutkan.",
			);
			return;
		}
		setLocalError("");
		await onSubmit({ name: name.trim(), prompt: prompt.trim() });
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>Tambah halaman baru</DialogTitle>
					<DialogDescription>
						AI membuat satu layar baru dan menyambungkannya ke project ini tanpa
						mengubah layar lain.
					</DialogDescription>
				</DialogHeader>
				<div className="flex flex-col gap-3">
					<label className="flex flex-col gap-1.5">
						<span className="text-xs text-fog">Nama halaman</span>
						<input
							type="text"
							value={name}
							onChange={(event) => setName(event.target.value)}
							placeholder="Contoh: Pengaturan Akun"
							className="min-h-11 rounded-lg border border-graphite bg-charcoal px-3 text-sm text-snow placeholder:text-fog focus:border-fog/40 focus:outline-none"
						/>
					</label>
					<label className="flex flex-col gap-1.5">
						<span className="text-xs text-fog">Instruksi halaman</span>
						<textarea
							value={prompt}
							onChange={(event) => setPrompt(event.target.value)}
							rows={4}
							placeholder="Jelaskan isi dan tujuan halaman ini..."
							className="resize-y rounded-lg border border-graphite bg-charcoal px-3 py-2 text-sm text-snow placeholder:text-fog focus:border-fog/40 focus:outline-none"
						/>
					</label>
					{localError ? (
						<p role="alert" className="text-sm text-crimson">
							{localError}
						</p>
					) : null}
				</div>
				<DialogFooter>
					<Button
						type="button"
						variant="secondary"
						onClick={() => onOpenChange(false)}
						disabled={busy}
					>
						Batal
					</Button>
					<Button
						type="button"
						onClick={() => void submit()}
						disabled={!canSubmit}
					>
						{busy ? "Menambahkan..." : "Tambah halaman"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
