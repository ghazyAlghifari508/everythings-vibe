import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import {
	readStudioChatStorage,
	writeStudioChatStorage,
} from "../services/studio-chat-storage";
import { readStudioApiError } from "../services/studio-frame-retry-client";
import {
	STUDIO_ELEMENT_TIMEOUT_MS,
	type StudioElementPreview,
	type StudioElementTarget,
	studioElementPreviewSchema,
} from "../types/studio-element";

const revisionsSchema = z.object({
	revisions: z.array(studioElementPreviewSchema),
});
const responseSchema = z.object({ revision: studioElementPreviewSchema });
const pendingSchema = z.object({ signature: z.string(), id: z.uuid() });
export function useStudioElementEditing({
	projectId,
	userId,
	frames,
	selectedFrameIds,
	setError,
	syncProjectStatus,
}: {
	projectId: string;
	userId: string;
	frames: { id: string; revision: number }[];
	selectedFrameIds: string[];
	setError: (message: string) => void;
	syncProjectStatus: () => Promise<void>;
}) {
	const [target, setTarget] = useState<StudioElementTarget | null>(null);
	const [preview, setPreview] = useState<StudioElementPreview | null>(null);
	const [undo, setUndo] = useState<StudioElementPreview | null>(null);
	const [busy, setBusy] = useState(false);
	const [error, setLocalError] = useState("");
	const working = useRef(false);
	const sequence = useRef(0);
	const currentProject = useRef(projectId);
	currentProject.current = projectId;
	const refresh = useCallback(
		async (signal?: AbortSignal) => {
			const request = ++sequence.current;
			try {
				const response = await fetch(
					`/api/studio/frame?projectId=${encodeURIComponent(projectId)}&elementRevisions=1`,
					{ signal },
				);
				if (!response.ok)
					throw new Error(
						await readStudioApiError(
							response,
							"Riwayat revisi elemen belum dapat dimuat.",
						),
					);
				const parsed = revisionsSchema.parse(await response.json());
				if (
					signal?.aborted ||
					currentProject.current !== projectId ||
					request !== sequence.current
				)
					return;
				const pending = parsed.revisions.filter(
					(row) => row.status === "preview" || row.status === "generating",
				);
				setPreview(pending.at(-1) ?? null);
				setUndo(
					parsed.revisions.filter((row) => row.status === "applied").at(-1) ??
						null,
				);
			} catch (failure) {
				if (
					!signal?.aborted &&
					currentProject.current === projectId &&
					request === sequence.current
				)
					setLocalError(
						failure instanceof Error
							? failure.message
							: "Riwayat revisi elemen belum dapat dimuat.",
					);
			}
		},
		[projectId],
	);
	useEffect(() => {
		setTarget(null);
		setPreview(null);
		setUndo(null);
		setLocalError("");
		const controller = new AbortController();
		void refresh(controller.signal);
		return () => controller.abort();
	}, [refresh]);
	useEffect(() => {
		if (!target) return;
		const frame = frames.find((row) => row.id === target.frameId);
		if (
			!frame ||
			frame.revision !== target.baseRevision ||
			!selectedFrameIds.includes(target.frameId)
		) {
			setTarget(null);
			if (!frame || frame.revision !== target.baseRevision)
				setError(
					"Versi layar berubah. Pilih ulang elemen yang ingin direvisi.",
				);
		}
	}, [frames, selectedFrameIds, target, setError]);
	const selectTarget = useCallback(
		(next: StudioElementTarget) => {
			if (next.projectId === projectId) setTarget(next);
		},
		[projectId],
	);
	const clearTarget = useCallback(() => setTarget(null), []);
	const submit = useCallback(
		async (prompt: string) => {
			if (!target || working.current) return { accepted: false };
			working.current = true;
			sequence.current++;
			setBusy(true);
			setLocalError("");
			setError("");
			const snapshot = structuredClone(target);
			const key = `studio-element-request:${userId}:${projectId}`;
			const signature = JSON.stringify({ prompt, target: snapshot });
			let stored: unknown = null;
			try {
				stored = JSON.parse(readStudioChatStorage(key) || "null");
			} catch {
				stored = null;
			}
			const previous = pendingSchema.safeParse(stored);
			const requestId =
				previous.success && previous.data.signature === signature
					? previous.data.id
					: crypto.randomUUID();
			writeStudioChatStorage(key, JSON.stringify({ signature, id: requestId }));
			try {
				const response = await fetch("/api/studio/frame", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						action: "element-prepare",
						request: { requestId, target: snapshot, prompt },
					}),
					signal: AbortSignal.timeout(STUDIO_ELEMENT_TIMEOUT_MS),
				});
				if (!response.ok) {
					writeStudioChatStorage(key, "");
					throw new Error(
						await readStudioApiError(
							response,
							"Revisi belum berhasil disiapkan. Pilih ulang elemen lalu coba lagi.",
						),
					);
				}
				const { revision } = responseSchema.parse(await response.json());
				if (currentProject.current !== projectId) return { accepted: false };
				if (revision.status === "preview" || revision.status === "generating")
					setPreview(revision);
				else if (revision.status === "applied") setUndo(revision);
				writeStudioChatStorage(key, "");
				await syncProjectStatus();
				return { accepted: true };
			} catch (failure) {
				if (currentProject.current === projectId)
					setLocalError(
						failure instanceof Error
							? failure.message
							: "Revisi belum berhasil disiapkan.",
					);
				return { accepted: false };
			} finally {
				working.current = false;
				setBusy(false);
			}
		},
		[target, userId, projectId, setError, syncProjectStatus],
	);
	const transition = useCallback(
		async (row: StudioElementPreview, action: "apply" | "cancel" | "undo") => {
			if (working.current) return;
			working.current = true;
			sequence.current++;
			setBusy(true);
			setLocalError("");
			try {
				const response = await fetch("/api/studio/frame", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						action: "element-transition",
						projectId,
						revisionId: row.id,
						transition: action,
					}),
				});
				if (!response.ok)
					throw new Error(
						await readStudioApiError(
							response,
							"Aksi revisi belum berhasil. Pilih ulang elemen jika versi berubah.",
						),
					);
				const { revision } = responseSchema.parse(await response.json());
				if (currentProject.current !== projectId) return;
				setPreview(null);
				if (action === "apply") {
					setUndo(revision);
					setTarget(null);
				}
				if (action === "undo") {
					setUndo(null);
					setTarget(null);
				}
				await syncProjectStatus();
				await refresh();
			} catch (failure) {
				if (currentProject.current === projectId)
					setLocalError(
						failure instanceof Error
							? failure.message
							: "Aksi revisi belum berhasil.",
					);
			} finally {
				working.current = false;
				setBusy(false);
			}
		},
		[projectId, syncProjectStatus, refresh],
	);
	return {
		target,
		preview,
		undo,
		busy,
		error,
		selectTarget,
		clearTarget,
		submit,
		transition,
		refresh,
	};
}
