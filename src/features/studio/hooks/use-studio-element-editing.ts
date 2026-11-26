import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import {
	readStudioChatStorage,
	writeStudioChatStorage,
} from "../services/studio-chat-storage";
import { mutateStudioElement } from "../services/studio-element-client";
import { readStudioApiError } from "../services/studio-frame-retry-client";
import {
	STUDIO_ELEMENT_TIMEOUT_MS,
	type StudioElementEdit,
	type StudioElementPreview,
	type StudioElementTarget,
	studioElementPreviewSchema,
} from "../types/studio-element";

const revisionsSchema = z.object({
	revisions: z.array(studioElementPreviewSchema),
});
const pendingSchema = z.object({ signature: z.string(), id: z.uuid() });
type ElementNotice = {
	row: StudioElementPreview;
	kind: "text" | "delete" | "ai";
};

function withRevision(rows: StudioElementPreview[], row: StudioElementPreview) {
	return [...rows.filter((item) => item.id !== row.id), row];
}
export interface StudioElementEditing {
	target: StudioElementTarget | null;
	pending: StudioElementPreview | null;
	undo: StudioElementPreview | null;
	notice?: ElementNotice | null;
	busy: boolean;
	error: string;
	selectTarget: (next: StudioElementTarget) => void;
	clearTarget: () => void;
	submit: (
		prompt: string,
		options?: { target?: StudioElementTarget; edit?: StudioElementEdit },
	) => Promise<{ accepted: boolean }>;
	transition: (
		row: StudioElementPreview,
		action: "apply" | "cancel" | "undo",
	) => Promise<void>;
	refresh: (signal?: AbortSignal) => Promise<void>;
}

export function useStudioElementEditing({
	projectId,
	userId,
	frames,
	selectedFrameIds,
	setError,
	syncProjectStatus,
	publishCommitted,
}: {
	projectId: string;
	userId: string;
	frames: { id: string; revision: number }[];
	selectedFrameIds: string[];
	setError: (message: string) => void;
	syncProjectStatus: () => Promise<void>;
	publishCommitted?: (
		projectId: string,
		frameId: string,
		revision: number,
		html: string,
	) => void;
}): StudioElementEditing {
	const [target, setTarget] = useState<StudioElementTarget | null>(null);
	const [pending, setPending] = useState<StudioElementPreview | null>(null);
	const [history, setHistory] = useState<StudioElementPreview[]>([]);
	const [notice, setNotice] = useState<ElementNotice | null>(null);
	let undo: StudioElementPreview | null = null;
	for (let i = history.length - 1; i >= 0; i--) {
		const row = history[i];
		if (row.status !== "applied" || row.appliedRevision === null) continue;
		const frame = frames.find(({ id }) => id === row.frameId);
		if (frame && frame.revision <= row.appliedRevision) {
			undo = row;
			break;
		}
	}
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
					{
						signal: signal
							? AbortSignal.any([
									signal,
									AbortSignal.timeout(STUDIO_ELEMENT_TIMEOUT_MS),
								])
							: AbortSignal.timeout(STUDIO_ELEMENT_TIMEOUT_MS),
					},
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
				// An empty history is a valid result. A successful retry clears an
				// earlier failure instead of leaving a stale error on screen.
				setPending(
					parsed.revisions
						.filter(
							(row) => row.status === "preview" || row.status === "generating",
						)
						.at(-1) ?? null,
				);
				setHistory(parsed.revisions);
				setLocalError("");
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
		setPending(null);
		setHistory([]);
		setNotice(null);
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
		async (
			prompt: string,
			options?: { target?: StudioElementTarget; edit?: StudioElementEdit },
		) => {
			const chosen = options?.target ?? target;
			if (!chosen || working.current) return { accepted: false };
			working.current = true;
			sequence.current++;
			setNotice(null);
			setBusy(true);
			setLocalError("");
			setError("");
			const snapshot = structuredClone(chosen);
			const key = `studio-element-request:${userId}:${projectId}`;
			const signature = JSON.stringify({
				prompt,
				target: snapshot,
				edit: options?.edit ?? null,
			});
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
				const revision = await mutateStudioElement(
					{
						action: "element-prepare",
						request: {
							requestId,
							target: snapshot,
							prompt,
							edit: options?.edit,
						},
					},
					() => writeStudioChatStorage(key, ""),
				);
				if (currentProject.current !== projectId) return { accepted: false };
				writeStudioChatStorage(key, "");
				if (!revision) return { accepted: true };
				if (
					revision.target.projectId !== projectId ||
					revision.frameId !== snapshot.frameId ||
					revision.baseRevision !== snapshot.baseRevision ||
					revision.baseHash !== snapshot.baseHash
				)
					throw new Error("Respons revisi tidak cocok. Pilih ulang elemennya.");
				if (
					revision.status === "applied" &&
					revision.appliedRevision !== null &&
					revision.after !== null
				) {
					publishCommitted?.(
						projectId,
						revision.frameId,
						revision.appliedRevision,
						revision.after,
					);
					setHistory((rows) => withRevision(rows, revision));
					setPending((row) => (row?.id === revision.id ? null : row));
					setNotice({
						row: revision,
						kind:
							options?.edit?.kind === "text"
								? "text"
								: options?.edit?.kind === "remove"
									? "delete"
									: "ai",
					});
					setTarget((previous) =>
						previous?.frameId === revision.frameId ? null : previous,
					);
				} else if (
					revision.status === "generating" ||
					revision.status === "preview"
				) {
					setPending(revision);
				} else {
					throw new Error(
						"Revisi elemen tidak diterapkan. Pilih ulang elemen lalu coba lagi.",
					);
				}
				await syncProjectStatus();
				return { accepted: true };
			} catch (failure) {
				if (currentProject.current === projectId) {
					// A dropped response can follow a successful commit; read, never replay the edit.
					await syncProjectStatus();
					await refresh();
				}
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
		[
			target,
			userId,
			projectId,
			setError,
			syncProjectStatus,
			publishCommitted,
			refresh,
		],
	);
	const transition = useCallback(
		async (row: StudioElementPreview, action: "apply" | "cancel" | "undo") => {
			if (working.current) return;
			working.current = true;
			sequence.current++;
			setNotice(null);
			setBusy(true);
			setLocalError("");
			try {
				const revision = await mutateStudioElement({
					action: "element-transition",
					projectId,
					revisionId: row.id,
					transition: action,
				});
				if (currentProject.current !== projectId) return;
				if (
					!revision ||
					revision.id !== row.id ||
					revision.frameId !== row.frameId ||
					revision.target.projectId !== projectId
				)
					throw new Error("Respons riwayat revisi tidak cocok.");
				setPending((previous) =>
					previous?.id === revision.id ? null : previous,
				);
				if (
					action === "apply" &&
					revision.status === "applied" &&
					revision.appliedRevision !== null &&
					revision.after !== null
				) {
					publishCommitted?.(
						projectId,
						revision.frameId,
						revision.appliedRevision,
						revision.after,
					);
					setHistory((rows) => withRevision(rows, revision));
					setNotice({ row: revision, kind: "ai" });
				}
				if (action === "undo" && revision.status === "undone") {
					if (
						revision.undoRevision !== null &&
						revision.undoRevision !== undefined
					)
						publishCommitted?.(
							projectId,
							revision.frameId,
							revision.undoRevision,
							revision.before,
						);
					setHistory((rows) => withRevision(rows, revision));
				}
				if (action !== "cancel") setTarget(null);
				await syncProjectStatus();
				await refresh();
			} catch (failure) {
				if (currentProject.current === projectId) {
					await syncProjectStatus();
					await refresh();
				}
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
		[projectId, syncProjectStatus, refresh, publishCommitted],
	);
	return {
		target,
		pending,
		undo,
		notice,
		busy,
		error,
		selectTarget,
		clearTarget,
		submit,
		transition,
		refresh,
	};
}
