import { useNavigate, useRouter } from "@tanstack/react-router";
import { useCallback, useRef, useState } from "react";
import type { StudioFrameRow, StudioProjectRow } from "@/db/schema";
import type { StudioComposerSubmitResult } from "@/features/studio/components/composer/studio-composer";
import { exportProjectAsZip } from "@/features/studio/services/studio-export";
import {
	readStudioApiError,
	requestStudioFrameRetry,
} from "@/features/studio/services/studio-frame-retry-client";
import type { StudioDesignSkillId } from "@/features/studio/services/studio-generation-options";
import type { AttachedDesignReference } from "@/features/studio/types/studio";
import { useUIStore } from "@/store";

/** Reads what one composer request resolved to, so the UI explains clarify/add. */
function readComposerOutcome(body: unknown): {
	intent: string | null;
	message: string | null;
	addedCount: number;
} {
	if (typeof body !== "object" || body === null)
		return { intent: null, message: null, addedCount: 0 };
	const intent =
		"intent" in body && typeof body.intent === "string" ? body.intent : null;
	const message =
		"message" in body && typeof body.message === "string" ? body.message : null;
	const addedCount =
		"frames" in body && Array.isArray(body.frames) ? body.frames.length : 0;
	return { intent, message, addedCount };
}

export interface UseStudioWorkspaceActionsOptions {
	project: StudioProjectRow;
	frames: StudioFrameRow[];
	selectedFrameIds: string[];
	isProcessing: boolean;
	syncProjectStatus: () => Promise<void>;
	setError: (error: string) => void;
}

export function useStudioWorkspaceActions({
	project,
	frames,
	selectedFrameIds,
	isProcessing,
	syncProjectStatus,
	setError,
}: UseStudioWorkspaceActionsOptions) {
	const [composerLoading, setComposerLoading] = useState(false);
	const [preferenceSaving, setPreferenceSaving] = useState(false);
	const [exportingZip, setExportingZip] = useState(false);
	const [deleting, setDeleting] = useState(false);
	const [duplicating, setDuplicating] = useState(false);
	const [retryingFrameIds, setRetryingFrameIds] = useState<string[]>([]);
	const [frameRetryErrors, setFrameRetryErrors] = useState<
		Record<string, string>
	>({});

	const navigate = useNavigate();
	const router = useRouter();
	const showToast = useUIStore((state) => state.showToast);
	const pendingRequest = useRef<{ signature: string; id: string } | null>(null);
	// The in-flight guard is a ref: two clicks in one tick both read the rendered
	// state before React commits it, and only the ref sees the first request.
	const retryingFrames = useRef(new Set<string>());

	const clearFrameRetryError = useCallback((frameId: string) => {
		setFrameRetryErrors((previous) => {
			if (!(frameId in previous)) return previous;
			const next = { ...previous };
			delete next[frameId];
			return next;
		});
	}, []);

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
				to: "/design/$id",
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
					await readStudioApiError(
						response,
						"Gagal menghapus project. Coba lagi.",
					),
				);
			}
			showToast("Project dihapus.", "success");
			await router.invalidate();
			await navigate({ to: "/design" });
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
		async (promptText: string): Promise<StudioComposerSubmitResult> => {
			setComposerLoading(true);
			setError("");
			const signature = JSON.stringify({ promptText, selectedFrameIds });
			if (pendingRequest.current?.signature !== signature)
				pendingRequest.current = { signature, id: crypto.randomUUID() };
			try {
				const res = await fetch("/api/studio/frame", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						action: "operation",
						projectId: project.id,
						prompt: promptText,
						frameIds: selectedFrameIds,
						requestId: pendingRequest.current.id,
					}),
				});
				if (!res.ok) {
					setError(await readStudioApiError(res, "Permintaan desain ditolak."));
					return { accepted: false };
				}
				const outcome = readComposerOutcome(await res.json().catch(() => null));
				await syncProjectStatus();
				pendingRequest.current = null;
				if (outcome.intent === "clarify")
					return { accepted: false, clarify: outcome.message ?? undefined };
				if (outcome.intent === "add_screen" && outcome.addedCount > 0)
					showToast(
						outcome.addedCount === 1
							? "Halaman baru sedang dibuat."
							: `${outcome.addedCount} halaman baru sedang dibuat.`,
						"info",
					);
				return { accepted: true };
			} catch {
				setError("Jaringan bermasalah. Coba lagi.");
				return { accepted: false };
			} finally {
				setComposerLoading(false);
			}
		},
		[project.id, selectedFrameIds, setError, showToast, syncProjectStatus],
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
						await readStudioApiError(
							response,
							"Gagal menyimpan design system.",
						),
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
						await readStudioApiError(response, "Gagal menyimpan design skill."),
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
			if (retryingFrames.current.has(frameId)) return;
			retryingFrames.current.add(frameId);
			setRetryingFrameIds([...retryingFrames.current]);
			clearFrameRetryError(frameId);
			setError("");
			try {
				const result = await requestStudioFrameRetry(project.id, frameId);
				if (result.kind === "rejected") {
					// The rejection belongs to this frame, not to the whole project.
					setFrameRetryErrors((previous) => ({
						...previous,
						[frameId]: result.message,
					}));
					return;
				}
				if (result.outcome === "already-running")
					showToast("Halaman ini sedang dibuat ulang.", "info");
				else if (result.outcome === "completed")
					showToast("Halaman ini sudah siap.", "success");
				else showToast("Permintaan dikirim. Menunggu antrean.", "info");
				await syncProjectStatus();
			} finally {
				retryingFrames.current.delete(frameId);
				setRetryingFrameIds([...retryingFrames.current]);
			}
		},
		[clearFrameRetryError, project.id, setError, showToast, syncProjectStatus],
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
				setError(
					await readStudioApiError(res, "Gagal mencoba lagi perencanaan."),
				);
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
		retryingFrameIds,
		frameRetryErrors,
		handleDuplicate,
		handleDelete,
		handleComposerSubmit,
		handleApplyDesignSystem,
		handleSkillChange,
		handleRetryFrame,
		handleRetryPlanning,
		handleDownloadAllZip,
	};
}
