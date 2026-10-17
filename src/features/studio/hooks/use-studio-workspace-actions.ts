import { useNavigate, useRouter } from "@tanstack/react-router";
import { useCallback, useRef, useState } from "react";
import type { StudioFrameRow, StudioProjectRow } from "@/db/schema";
import type { StudioComposerScope } from "@/features/studio/components/composer/studio-composer";
import type { AttachedDesignReference } from "@/features/studio/types/studio";
import { exportProjectAsZip } from "@/lib/studio-export";
import type { StudioDesignSkillId } from "@/lib/studio-generation-options";
import { useUIStore } from "@/store";

/** Reads the API's own error message, falling back to a caller-owned sentence. */
export async function readApiError(
	response: Response,
	fallback: string,
): Promise<string> {
	const body: unknown = await response.json().catch(() => null);
	return typeof body === "object" &&
		body !== null &&
		"error" in body &&
		typeof body.error === "string"
		? body.error
		: fallback;
}

export interface UseStudioWorkspaceActionsOptions {
	project: StudioProjectRow;
	frames: StudioFrameRow[];
	selectedFrameIds: string[];
	isProcessing: boolean;
	syncProjectStatus: () => Promise<void>;
	setError: (error: string) => void;
	setIsAddFrameOpen: (open: boolean) => void;
}

export function useStudioWorkspaceActions({
	project,
	frames,
	selectedFrameIds,
	isProcessing,
	syncProjectStatus,
	setError,
	setIsAddFrameOpen,
}: UseStudioWorkspaceActionsOptions) {
	const [composerLoading, setComposerLoading] = useState(false);
	const [preferenceSaving, setPreferenceSaving] = useState(false);
	const [exportingZip, setExportingZip] = useState(false);
	const [deleting, setDeleting] = useState(false);
	const [duplicating, setDuplicating] = useState(false);

	const navigate = useNavigate();
	const router = useRouter();
	const showToast = useUIStore((state) => state.showToast);
	const pendingRequest = useRef<{ signature: string; id: string } | null>(null);

	const handleDuplicate = useCallback(async () => {
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
	}, [duplicating, navigate, project.id, setError]);

	const handleDelete = useCallback(async () => {
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
				throw new Error(
					await readApiError(response, "Gagal menghapus project. Coba lagi."),
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
	}, [deleting, navigate, project.id, router, setError, showToast]);

	const handleComposerSubmit = useCallback(
		async (
			promptText: string,
			scope: StudioComposerScope,
		): Promise<boolean> => {
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
					setError(await readApiError(res, "Permintaan desain ditolak."));
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
		},
		[project.id, selectedFrameIds, setError, syncProjectStatus],
	);

	const handleAddFrame = useCallback(
		async (input: { name: string; prompt: string }) => {
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
					throw new Error(
						await readApiError(response, "Gagal menambah halaman baru."),
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
		},
		[project.id, setError, setIsAddFrameOpen, showToast, syncProjectStatus],
	);

	const handleApplyDesignSystem = useCallback(
		async (reference: AttachedDesignReference): Promise<boolean> => {
			setPreferenceSaving(true);
			try {
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
					throw new Error(
						await readApiError(response, "Gagal menyimpan design system."),
					);
				}
				await syncProjectStatus();
				return true;
			} finally {
				setPreferenceSaving(false);
			}
		},
		[project.id, syncProjectStatus],
	);

	const handleSkillChange = useCallback(
		async (skillId: StudioDesignSkillId) => {
			if (isProcessing || preferenceSaving || project.designSkillId === skillId)
				return;
			setPreferenceSaving(true);
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
					throw new Error(
						await readApiError(response, "Gagal menyimpan design skill."),
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
				setPreferenceSaving(false);
			}
		},
		[
			isProcessing,
			preferenceSaving,
			project.designSkillId,
			project.id,
			setError,
			syncProjectStatus,
		],
	);

	const handleRetryFrame = useCallback(
		async (frameId: string) => {
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
					failure instanceof Error
						? failure.message
						: "Permintaan retry gagal.",
				);
			}
		},
		[project.id, setError, syncProjectStatus],
	);

	const handleRetryPlanning = useCallback(async () => {
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
				setError(await readApiError(res, "Gagal mencoba lagi perencanaan."));
				return;
			}
			await syncProjectStatus();
		} catch {
			setError("Jaringan bermasalah. Coba lagi.");
		}
	}, [project.id, setError, syncProjectStatus]);

	const handleDownloadAllZip = useCallback(async () => {
		if (frames.length === 0 || exportingZip) return;
		setExportingZip(true);
		try {
			await exportProjectAsZip(project.title, frames);
		} catch {
			setError("Gagal menyiapkan bundel ZIP unduhan.");
		} finally {
			setExportingZip(false);
		}
	}, [exportingZip, frames, project.title, setError]);

	return {
		composerLoading,
		preferenceSaving,
		exportingZip,
		deleting,
		duplicating,
		handleDuplicate,
		handleDelete,
		handleComposerSubmit,
		handleAddFrame,
		handleApplyDesignSystem,
		handleSkillChange,
		handleRetryFrame,
		handleRetryPlanning,
		handleDownloadAllZip,
	};
}
