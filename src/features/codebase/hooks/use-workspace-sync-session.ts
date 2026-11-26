import { useCallback, useEffect, useRef, useState } from "react";
import { requestAnalysisCreditPreflight } from "../services/analysis-credit-requests";
import { isFinishedResyncReplay } from "../services/resync-replay";
import type { SyncPromptPayload, SyncStatusResponse } from "../services/sync";
import {
	isResyncSessionVerified,
	syncPromptPayloadSchema,
} from "../services/sync";
import {
	restoredSyncSessionSchema,
	syncSessionErrorSchema,
} from "../services/sync-session-contract";
import { CODEBASE_SYNC_REQUEST_TIMEOUT_MS } from "../types/codebase-constants";
import {
	type CodebaseSessionStartAction,
	getCodebaseSessionRequestBody,
} from "../utils/workspace-contracts";

type SessionOrigin = "screen" | "modal";
interface SessionState {
	codebaseId: string;
	payload: SyncPromptPayload | null;
	activeSessionId: string | null;
	isResyncModalOpen: boolean;
	isStarting: boolean;
	sessionError: string | null;
}
function emptySession(codebaseId: string): SessionState {
	return {
		codebaseId,
		payload: null,
		activeSessionId: null,
		isResyncModalOpen: false,
		isStarting: false,
		sessionError: null,
	};
}

export function useWorkspaceSyncSession(input: {
	codebaseId: string;
	status: SyncStatusResponse | null;
	setStatus: (status: SyncStatusResponse | null) => void;
	setError: (message: string | null) => void;
}) {
	const { codebaseId } = input;
	const [state, setState] = useState(() => emptySession(input.codebaseId));
	const current =
		state.codebaseId === input.codebaseId
			? state
			: emptySession(input.codebaseId);
	// Polls capture this object before awaiting. Starting a request replaces it
	// synchronously, before React commits, invalidating every older response.
	const statusScopeRef = useRef({
		codebaseId: input.codebaseId,
		sessionId: null as string | null,
		blocked: false,
	});
	const inFlight = useRef(false);
	const requestId = useRef<string | null>(null);
	const verifiedSessionId = useRef<string | null>(null);
	const lastRequest = useRef<{
		action: CodebaseSessionStartAction;
		origin: SessionOrigin;
		sessionId?: string;
	}>({ action: "resync", origin: "modal" });
	if (statusScopeRef.current.codebaseId !== input.codebaseId) {
		statusScopeRef.current = {
			codebaseId: input.codebaseId,
			sessionId: null,
			blocked: false,
		};
		inFlight.current = false;
		requestId.current = null;
		verifiedSessionId.current = null;
	}
	useEffect(
		() => () => {
			statusScopeRef.current = { ...statusScopeRef.current };
			inFlight.current = false;
		},
		[],
	);
	const storageKey = `prdfy:resync-request:${input.codebaseId}`;
	const update = useCallback(
		(patch: Partial<SessionState>) =>
			setState((previous) => ({
				...(previous.codebaseId === codebaseId
					? previous
					: emptySession(codebaseId)),
				...patch,
			})),
		[codebaseId],
	);
	const setActiveSessionId = useCallback(
		(sessionId: string) => {
			if (statusScopeRef.current.blocked) return;
			statusScopeRef.current.sessionId = sessionId;
			update({ activeSessionId: sessionId });
		},
		[update],
	);
	const startSession = async (
		action: CodebaseSessionStartAction = "initial",
		origin: SessionOrigin = action === "resync" ? "modal" : "screen",
		replaceSessionId = statusScopeRef.current.sessionId ?? undefined,
		canReplaceFinishedReplay = true,
	): Promise<void> => {
		if (inFlight.current) return;
		inFlight.current = true;
		lastRequest.current = { action, origin, sessionId: replaceSessionId };
		const scope = {
			codebaseId: input.codebaseId,
			sessionId: null as string | null,
			blocked: true,
		};
		statusScopeRef.current = scope;
		const isCurrent = () => statusScopeRef.current === scope;
		update({
			payload: null,
			activeSessionId: null,
			isStarting: true,
			sessionError: null,
			isResyncModalOpen: origin === "modal" || current.isResyncModalOpen,
		});
		input.setStatus(null);
		const reportFailure = (message: string) => {
			if (origin === "modal") update({ sessionError: message });
			else input.setError(message);
		};
		const controller = new AbortController();
		let timeout: ReturnType<typeof setTimeout> | undefined;
		try {
			if (action !== "resync") {
				const credit = await requestAnalysisCreditPreflight();
				if (!isCurrent()) return;
				if (!credit.canStart) {
					reportFailure("Sinkronisasi belum bisa dimulai.");
					return;
				}
			}
			if (action === "resync" && !requestId.current) {
				try {
					requestId.current = localStorage.getItem(storageKey);
				} catch {
					/* Storage is optional; the in-memory identity still deduplicates retries. */
				}
				requestId.current ??= crypto.randomUUID();
				try {
					localStorage.setItem(storageKey, requestId.current);
				} catch {
					/* The server remains authoritative when browser storage is unavailable. */
				}
			}
			timeout = setTimeout(
				() => controller.abort(),
				CODEBASE_SYNC_REQUEST_TIMEOUT_MS,
			);
			const response = await fetch(
				`/api/codebases/${encodeURIComponent(input.codebaseId)}/session`,
				{
					signal: controller.signal,
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						...getCodebaseSessionRequestBody(action),
						...(action === "resync"
							? { requestId: requestId.current }
							: action === "retry" && replaceSessionId
								? { sessionId: replaceSessionId }
								: {}),
					}),
				},
			);
			const body: unknown = await response.json().catch(() => null);
			if (!isCurrent()) return;
			const minted = syncPromptPayloadSchema.safeParse(body);
			if (
				response.ok &&
				minted.success &&
				minted.data.sessionId &&
				minted.data.projectId === input.codebaseId &&
				(!minted.data.codebaseId ||
					minted.data.codebaseId === input.codebaseId) &&
				(!minted.data.requestId || minted.data.requestId === requestId.current)
			) {
				scope.sessionId = minted.data.sessionId;
				scope.blocked = false;
				verifiedSessionId.current = minted.data.sessionId;
				update({
					payload: minted.data,
					activeSessionId: minted.data.sessionId,
				});
				return;
			}
			const restored = restoredSyncSessionSchema.safeParse(body);
			const failure = syncSessionErrorSchema.safeParse(body);
			const recoverable =
				response.status === 409 &&
				failure.success &&
				[
					"SYNC_SESSION_ACTIVE",
					"SYNC_SESSION_STALE",
					"SYNC_SNAPSHOT_UPLOADED",
					"SYNC_SESSION_EXPIRED",
					"CODEBASE_SESSION_RECOVERY_REQUIRED",
				].includes(failure.data.code ?? "");
			if (
				(response.ok || recoverable) &&
				restored.success &&
				restored.data.projectId === input.codebaseId
			) {
				const finished =
					action === "resync" &&
					canReplaceFinishedReplay &&
					(await isFinishedResyncReplay(restored.data, controller.signal));
				if (!isCurrent()) return;
				if (finished) {
					requestId.current = crypto.randomUUID();
					try {
						localStorage.setItem(storageKey, requestId.current);
					} catch {
						/* Retry identity remains in memory. */
					}
					inFlight.current = false;
					clearTimeout(timeout);
					await startSession("resync", origin, undefined, false);
					return;
				}
				scope.sessionId = restored.data.sessionId;
				scope.blocked = false;
				verifiedSessionId.current = restored.data.sessionId;
				update({ activeSessionId: restored.data.sessionId });
				input.setStatus({ ...restored.data, snapshotId: null });
				return;
			}
			if (recoverable && failure.data.sessionId) {
				scope.sessionId = failure.data.sessionId;
				scope.blocked = false;
				verifiedSessionId.current = failure.data.sessionId;
				update({ activeSessionId: failure.data.sessionId });
				return;
			}
			reportFailure(
				failure.success && failure.data.error
					? failure.data.error
					: "Sesi sync gagal dibuat. Coba lagi.",
			);
		} catch {
			if (isCurrent())
				reportFailure("Server tidak dapat dihubungi. Coba lagi.");
		} finally {
			clearTimeout(timeout);
			if (isCurrent()) {
				inFlight.current = false;
				update({ isStarting: false });
			}
		}
	};
	const openResync = () => {
		if (inFlight.current) return;
		update({ isResyncModalOpen: true });
		const status =
			input.status?.sessionId === statusScopeRef.current.sessionId
				? input.status
				: null;
		const finished = Boolean(
			status &&
				(["ready", "failed", "expired"].includes(status.status) ||
					status.analysisAttemptStatus === "failed" ||
					isResyncSessionVerified({
						status,
						activeSessionId: statusScopeRef.current.sessionId,
					})),
		);
		const promptExpired =
			current.payload && Date.parse(current.payload.expiresAt) <= Date.now();
		if (
			verifiedSessionId.current === statusScopeRef.current.sessionId &&
			verifiedSessionId.current &&
			!finished &&
			!promptExpired
		)
			return;
		if (finished) {
			requestId.current = crypto.randomUUID();
			try {
				localStorage.setItem(storageKey, requestId.current);
			} catch {
				/* Retry identity remains in memory. */
			}
		}
		void startSession("resync", "modal");
	};
	const retrySession = () =>
		void startSession(
			lastRequest.current.action,
			lastRequest.current.origin,
			lastRequest.current.sessionId,
		);
	const replacePrompt = () => void startSession("retry", "modal");
	const retrySync = () => {
		const failed =
			input.status &&
			input.status.sessionId === statusScopeRef.current.sessionId &&
			["failed", "expired"].includes(input.status.status);
		void startSession(failed ? "retry" : "resync", "modal");
	};
	return {
		...current,
		statusScopeRef,
		setActiveSessionId,
		canReadStatus: !statusScopeRef.current.blocked,
		setIsResyncModalOpen: (isResyncModalOpen: boolean) =>
			update({ isResyncModalOpen }),
		startSession,
		openResync,
		retrySession,
		replacePrompt,
		retrySync,
	};
}
