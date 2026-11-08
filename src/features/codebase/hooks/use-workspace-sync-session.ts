import { useRef, useState } from "react";
import { requestAnalysisCreditPreflight } from "../services/analysis-credit-requests";
import type { SyncPromptPayload, SyncStatusResponse } from "../services/sync";
import { syncPromptPayloadSchema } from "../services/sync";
import {
	restoredSyncSessionSchema,
	syncSessionErrorSchema,
} from "../services/sync-session-contract";
import {
	type CodebaseSessionStartAction,
	getCodebaseSessionRequestBody,
} from "../utils/workspace-contracts";

/**
 * Which surface owns a session-request failure. The workspace modal shows its
 * own approved error; the onboarding screen keeps the shared banner. Never
 * both, because one operation has one primary error presentation.
 */
type SessionOrigin = "screen" | "modal";

export function useWorkspaceSyncSession(input: {
	codebaseId: string;
	status: SyncStatusResponse | null;
	setStatus: (status: SyncStatusResponse | null) => void;
	setError: (message: string | null) => void;
}) {
	const [payload, setPayload] = useState<SyncPromptPayload | null>(null);
	const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
	const [isResyncModalOpen, setIsResyncModalOpen] = useState(false);
	const [isStarting, setIsStarting] = useState(false);
	const [sessionError, setSessionError] = useState<string | null>(null);
	const inFlight = useRef(false);
	const requestId = useRef<string | null>(null);
	const lastRequest = useRef<{
		action: CodebaseSessionStartAction;
		origin: SessionOrigin;
	}>({ action: "resync", origin: "modal" });
	const storageKey = `prdfy:resync-request:${input.codebaseId}`;

	const startSession = async (
		action: CodebaseSessionStartAction = "initial",
		origin: SessionOrigin = action === "resync" ? "modal" : "screen",
	) => {
		if (inFlight.current) return;
		inFlight.current = true;
		lastRequest.current = { action, origin };
		setIsStarting(true);
		if (origin === "modal") setIsResyncModalOpen(true);
		setSessionError(null);
		if (action !== "initial") {
			// A new attempt must never paint the previous attempt's credential or
			// progress under itself. The workspace's stored snapshot is untouched.
			setPayload(null);
			input.setStatus(null);
		}
		const reportFailure = (message: string) => {
			if (origin === "modal") setSessionError(message);
			else input.setError(message);
		};
		try {
			// Re-sync starts under the same codebase without a browser-side credit
			// approval; the server remains the authority before analysis.
			if (action !== "resync") {
				const credit = await requestAnalysisCreditPreflight();
				if (!credit.canStart) {
					if (origin === "modal")
						reportFailure("Sinkronisasi belum bisa dimulai.");
					return;
				}
			}
			if (action === "resync" && !requestId.current) {
				requestId.current =
					localStorage.getItem(storageKey) || crypto.randomUUID();
				localStorage.setItem(storageKey, requestId.current);
			}
			const response = await fetch(
				`/api/codebases/${encodeURIComponent(input.codebaseId)}/session`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						...getCodebaseSessionRequestBody(action),
						...(action === "resync"
							? { requestId: requestId.current }
							: action === "retry" &&
									(activeSessionId ?? input.status?.sessionId)
								? { sessionId: activeSessionId ?? input.status?.sessionId }
								: {}),
					}),
				},
			);
			const body: unknown = await response.json().catch(() => null);
			const minted = syncPromptPayloadSchema.safeParse(body);
			if (response.ok && minted.success) {
				setPayload(minted.data);
				setActiveSessionId(minted.data.sessionId ?? null);
				input.setStatus(null);
				return;
			}
			const restored = restoredSyncSessionSchema.safeParse(body);
			if (response.ok && restored.success) {
				setActiveSessionId(restored.data.sessionId);
				setPayload((current) =>
					current?.sessionId === restored.data.sessionId ? current : null,
				);
				input.setStatus({ ...restored.data, snapshotId: null });
				return;
			}
			const failure = syncSessionErrorSchema.safeParse(body);
			if (
				response.status === 409 &&
				failure.success &&
				failure.data.sessionId &&
				[
					"SYNC_SESSION_ACTIVE",
					"SYNC_SESSION_STALE",
					"SYNC_SNAPSHOT_UPLOADED",
					"SYNC_SESSION_EXPIRED",
					"CODEBASE_SESSION_RECOVERY_REQUIRED",
				].includes(failure.data.code ?? "")
			) {
				setActiveSessionId(failure.data.sessionId);
				setPayload((current) =>
					current?.sessionId === failure.data.sessionId ? current : null,
				);
				input.setStatus(null);
				return;
			}
			reportFailure(
				failure.success && failure.data.error
					? failure.data.error
					: "Sesi sync gagal dibuat. Coba lagi.",
			);
		} catch (error) {
			reportFailure(
				error instanceof Error
					? error.message
					: "Server tidak dapat dihubungi.",
			);
		} finally {
			inFlight.current = false;
			setIsStarting(false);
		}
	};

	/**
	 * Opening "Perbarui repository" restores the attempt that is genuinely on
	 * screen. A new session is requested only when the previous attempt finished
	 * (or no attempt exists yet), and that case gets a new request identity — a
	 * replay would stay on the finished attempt and hand back no prompt.
	 */
	const openResync = () => {
		setIsResyncModalOpen(true);
		const finished =
			input.status !== null &&
			(["ready", "failed", "expired"].includes(input.status.status) ||
				input.status.analysisStatus === "ready");
		const live =
			(payload !== null &&
				!["failed", "expired"].includes(input.status?.status ?? "")) ||
			(input.status !== null && !finished);
		if (live) return;
		if (finished) {
			requestId.current = crypto.randomUUID();
			localStorage.setItem(storageKey, requestId.current);
		}
		void startSession("resync", "modal");
	};

	/** Repeats the exact request that failed, on the surface that made it. */
	const retrySession = () =>
		void startSession(lastRequest.current.action, lastRequest.current.origin);

	/** Replaces a lost one-time prompt for the attempt currently on screen. */
	const replacePrompt = () => void startSession("retry", "modal");

	/** Failed/expired attempts are replaced explicitly; anything else resyncs. */
	const retrySync = () => {
		const failed =
			input.status !== null &&
			["failed", "expired"].includes(input.status.status);
		void startSession(failed ? "retry" : "resync", "modal");
	};

	return {
		payload,
		activeSessionId,
		setActiveSessionId,
		isResyncModalOpen,
		setIsResyncModalOpen,
		isStarting,
		sessionError,
		startSession,
		openResync,
		retrySession,
		replacePrompt,
		retrySync,
	};
}
