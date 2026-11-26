import { useNavigate, useRouter } from "@tanstack/react-router";
import { useCallback, useRef, useState } from "react";
import type { StudioFrameRow, StudioProjectRow } from "@/db/schema";
import { exportProjectAsZip } from "@/features/studio/services/studio-export";
import {
	readStudioApiError,
	requestStudioFrameRetry,
} from "@/features/studio/services/studio-frame-retry-client";
import { useUIStore } from "@/store";
import { useStudioComposerRequest } from "./use-studio-composer-request";

export interface UseStudioWorkspaceActionsOptions {
	project: StudioProjectRow;
	frames: StudioFrameRow[];
	selectedFrameIds: string[];
	syncProjectStatus: () => Promise<void>;
	setError: (error: string) => void;
}

export function useStudioWorkspaceActions({
	project,
	frames,
	selectedFrameIds,
	syncProjectStatus,
	setError,
}: UseStudioWorkspaceActionsOptions) {
	const { composerLoading, handleComposerSubmit } = useStudioComposerRequest({
		projectId: project.id,
		userId: project.userId,
		selectedFrameIds,
		syncProjectStatus,
		setError,
	});
	const [exportingZip, setExportingZip] = useState(false);
	const [deleting, setDeleting] = useState(false);
	const [renaming, setRenaming] = useState(false);
	const [duplicating, setDuplicating] = useState(false);
	const [retryingFrameIds, setRetryingFrameIds] = useState<string[]>([]);
	const [frameRetryErrors, setFrameRetryErrors] = useState<
		Record<string, string>
	>({});

	const navigate = useNavigate();
	const router = useRouter();
	const showToast = useUIStore((state) => state.showToast);
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

	// A rename only writes the label, so the workspace re-reads the project
	// through its existing status sync instead of a rename-specific poll. The
	// dialog owns the failure message: throwing lets it stay open with the error.
	const handleRename = useCallback(
		async (name: string) => {
			if (renaming) return;
			setRenaming(true);
			try {
				const response = await fetch("/api/studio/project", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						action: "rename",
						projectId: project.id,
						title: name,
					}),
				});
				if (!response.ok) {
					throw new Error(
						await readStudioApiError(
							response,
							"Gagal mengganti nama project. Coba lagi.",
						),
					);
				}
				await syncProjectStatus();
			} finally {
				setRenaming(false);
			}
		},
		[project.id, renaming, syncProjectStatus],
	);

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

	const handleDownloadAllZip = useCallback(async () => {
		if (frames.length === 0 || exportingZip) return;
		setExportingZip(true);
		try {
			await exportProjectAsZip(project.title, project.id, frames);
		} catch {
			setError("Gagal menyiapkan bundel ZIP unduhan.");
		} finally {
			setExportingZip(false);
		}
	}, [exportingZip, frames, project.id, project.title, setError]);

	return {
		composerLoading,
		exportingZip,
		duplicating,
		renaming,
		retryingFrameIds,
		frameRetryErrors,
		handleDuplicate,
		handleDelete,
		handleRename,
		handleComposerSubmit,
		handleRetryFrame,
		handleDownloadAllZip,
	};
}
