import { useRef, useState } from "react";
import type { AnalysisCreditStatus } from "../services/analysis-credit-policy";
import { analysisCreditStatusSchema } from "../services/analysis-credit-policy";
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
	const [creditPreflight, setCreditPreflight] =
		useState<AnalysisCreditStatus | null>(null);
	const inFlight = useRef(false);
	const requestId = useRef<string | null>(null);
	const storageKey = `prdfy:resync-request:${input.codebaseId}`;
	const startSession = async (
		action: CodebaseSessionStartAction = "initial",
	) => {
		if (inFlight.current) return;
		inFlight.current = true;
		setIsStarting(true);
		setIsResyncModalOpen(true);
		input.setError(null);
		try {
			const credit = await requestAnalysisCreditPreflight();
			setCreditPreflight(credit);
			if (!credit.canStart && action !== "resync") return;
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
							: action === "retry" && activeSessionId
								? { sessionId: activeSessionId }
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
			const blocked = analysisCreditStatusSchema.safeParse(body);
			if (blocked.success) {
				setCreditPreflight(blocked.data);
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
			input.setError(
				failure.success && failure.data.error
					? failure.data.error
					: "Sesi sync gagal dibuat. Coba lagi.",
			);
		} catch (error) {
			input.setError(
				error instanceof Error
					? error.message
					: "Server tidak dapat dihubungi.",
			);
		} finally {
			inFlight.current = false;
			setIsStarting(false);
		}
	};
	const openResync = () => {
		setIsResyncModalOpen(true);
		if (
			payload &&
			input.status &&
			input.status.sessionId === payload.sessionId &&
			input.status.analysisStatus !== "ready" &&
			!["failed", "expired"].includes(input.status.status)
		)
			return;
		if (
			requestId.current &&
			input.status?.sessionId === activeSessionId &&
			(input.status?.analysisStatus === "ready" ||
				input.status?.status === "ready" ||
				input.status?.status === "failed")
		) {
			requestId.current = crypto.randomUUID();
			localStorage.setItem(storageKey, requestId.current);
			setPayload(null);
		}
		void startSession("resync");
	};
	return {
		payload,
		activeSessionId,
		setActiveSessionId,
		isResyncModalOpen,
		setIsResyncModalOpen,
		isStarting,
		creditPreflight,
		startSession,
		openResync,
	};
}
