import { useCallback, useEffect, useRef, useState } from "react";
import type { AnalysisResponse } from "@/features/codebase/services/analysis";
import {
	resolveWorkspaceSnapshotIdentity,
	shouldDiscardWorkspaceAnalysis,
} from "@/features/codebase/services/analysis-selection";
import {
	getPendingSyncPayloadKey,
	type SyncPromptPayload,
	type SyncStatusResponse,
	syncPromptPayloadSchema,
	syncStatusResponseSchema,
} from "@/features/codebase/services/sync";
import { shouldFetchWorkspaceAnalysis } from "@/features/codebase/services/workspace-analysis";
import { CODEBASE_SYNC_POLL_INTERVAL_MS } from "@/features/codebase/types/codebase-constants";
import type { AnalysisCreditStatus } from "../services/analysis-credit-policy";
import {
	type CodebaseSessionStartAction,
	getCodebaseSessionRequestBody,
	resolveWorkspaceSnapshotReady,
} from "../utils/workspace-contracts";
import { useWorkspaceAnalysis } from "./use-workspace-analysis";

export function useCodebaseSync({
	codebaseId,
	projectId,
	currentSnapshotId,
	initialAnalysis,
	hasStoredSnapshot,
}: {
	codebaseId: string;
	projectId: string | null;
	currentSnapshotId: string | null;
	initialAnalysis: AnalysisResponse | null;
	hasStoredSnapshot: boolean;
}) {
	const [payload, setPayload] = useState<SyncPromptPayload | null>(null);
	const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
	const [isResyncModalOpen, setIsResyncModalOpen] = useState(false);
	const [status, setStatus] = useState<SyncStatusResponse | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [isStarting, setIsStarting] = useState(false);
	const [isWorking, setIsWorking] = useState(false);
	const [creditPreflight, setCreditPreflight] =
		useState<AnalysisCreditStatus | null>(null);
	const inFlight = useRef(false);
	const analysisState = useWorkspaceAnalysis({
		projectId,
		currentSnapshotId,
		polledSnapshotId: status?.snapshotId ?? null,
		initialAnalysis,
		setError,
		setIsWorking,
	});
	const {
		analysis,
		setAnalysis,
		analysisAttemptedFor,
		analysisIdentityRef,
		readWorkspaceAnalysis,
	} = analysisState;
	const readStatus = useCallback(async () => {
		if (inFlight.current) return;
		inFlight.current = true;
		try {
			const queryParams = new URLSearchParams();
			const sessionToQuery = activeSessionId ?? status?.sessionId;
			if (sessionToQuery) queryParams.set("sessionId", sessionToQuery);
			if (projectId) queryParams.set("projectId", projectId);
			const query = queryParams.toString() ? `?${queryParams}` : "";
			const response = await fetch(
				`/api/codebases/${encodeURIComponent(codebaseId)}/status${query}`,
			);
			const parsed = syncStatusResponseSchema.safeParse(
				await response.json().catch(() => null),
			);
			if (!response.ok || !parsed.success) {
				setError(
					response.ok
						? "Status sync tidak valid. Coba muat ulang."
						: "Status sync tidak dapat dibaca. Coba lagi.",
				);
				return;
			}
			const activeSnapshotId = resolveWorkspaceSnapshotIdentity({
				persistedSnapshotId: currentSnapshotId,
				polledSnapshotId: parsed.data.snapshotId ?? null,
			});
			analysisIdentityRef.current = `${projectId ?? ""}:${activeSnapshotId ?? ""}`;
			setStatus(parsed.data);
			if (!activeSessionId && parsed.data.sessionId) {
				setActiveSessionId(parsed.data.sessionId);
			}
			const snapshotId = activeSnapshotId;
			if (!snapshotId) return;
			const retained = analysis ?? initialAnalysis;
			if (
				shouldDiscardWorkspaceAnalysis({
					analysis: retained,
					projectId: projectId ?? "",
					activeSnapshotId: snapshotId,
				})
			)
				setAnalysis(null);
			if (
				projectId &&
				shouldFetchWorkspaceAnalysis({
					projectId,
					snapshotId,
					analysisStatus: parsed.data.analysisStatus,
					analysis: retained,
				})
			) {
				void readWorkspaceAnalysis(projectId, snapshotId);
			}
			// Reading status must never start billable analysis.
		} catch {
			setError("Server tidak dapat dihubungi. Coba lagi.");
		} finally {
			inFlight.current = false;
		}
	}, [
		activeSessionId,
		analysis,
		codebaseId,
		currentSnapshotId,
		initialAnalysis,
		projectId,
		readWorkspaceAnalysis,
		status?.sessionId,
		analysisIdentityRef,
		setAnalysis,
	]);
	useEffect(() => {
		try {
			const raw = sessionStorage.getItem(getPendingSyncPayloadKey(codebaseId));
			if (!raw) return;
			const parsed = syncPromptPayloadSchema.safeParse(JSON.parse(raw));
			if (parsed.success && parsed.data.projectId === codebaseId) {
				setPayload(parsed.data);
				if (parsed.data.sessionId) {
					setActiveSessionId(parsed.data.sessionId);
				}
				setIsResyncModalOpen(true);
			}
			sessionStorage.removeItem(getPendingSyncPayloadKey(codebaseId));
		} catch {
			setError("Instruksi sync tidak dapat dibaca dari browser.");
		}
	}, [codebaseId]);
	useEffect(() => {
		void readStatus();
		const interval = setInterval(
			() => void readStatus(),
			CODEBASE_SYNC_POLL_INTERVAL_MS,
		);
		return () => clearInterval(interval);
	}, [readStatus]);
	const startSession = async (
		action: CodebaseSessionStartAction = "initial",
	) => {
		setIsStarting(true);
		setIsResyncModalOpen(true);
		setError(null);
		try {
			const { requestPreSyncPreflight, preSyncAcceptance } = await import(
				"../services/analysis-credit-requests"
			);
			const status = await requestPreSyncPreflight().catch((error: unknown) => {
				setError(
					error instanceof Error
						? error.message
						: "Kebutuhan kredit belum dapat diperiksa.",
				);
				return null;
			});
			if (!status) return;
			setCreditPreflight(status);
			const acceptance = preSyncAcceptance(status);
			const response = await fetch(
				`/api/codebases/${encodeURIComponent(codebaseId)}/session`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						...getCodebaseSessionRequestBody(action),
						...acceptance,
					}),
				},
			);
			const parsed = syncPromptPayloadSchema.safeParse(
				await response.json().catch(() => null),
			);
			if (!response.ok || !parsed.success) {
				setError("Sesi sync gagal dibuat. Coba lagi.");
				return;
			}
			setPayload(parsed.data);
			if (parsed.data.sessionId) {
				setActiveSessionId(parsed.data.sessionId);
			}
			setStatus(null);
			setAnalysis(null);
			analysisAttemptedFor.current = null;
		} catch (error) {
			setError(
				error instanceof Error
					? error.message
					: "Server tidak dapat dihubungi.",
			);
		} finally {
			setIsStarting(false);
		}
	};
	const snapshotReady = resolveWorkspaceSnapshotReady({
		status,
		hasStoredSnapshot,
	});
	return {
		...analysisState,
		payload,
		activeSessionId,
		isResyncModalOpen,
		setIsResyncModalOpen,
		isResyncDrawerOpen: isResyncModalOpen,
		setIsResyncDrawerOpen: setIsResyncModalOpen,
		status,
		error,
		setError,
		isStarting,
		isWorking,
		setIsWorking,
		readStatus,
		startSession,
		creditPreflight,
		snapshotReady,
	};
}
