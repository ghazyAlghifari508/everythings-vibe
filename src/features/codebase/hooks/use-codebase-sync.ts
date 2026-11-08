import { useCallback, useEffect, useRef, useState } from "react";
import { useCodebaseSyncStream } from "@/features/codebase/hooks/use-codebase-sync-stream";
import type { AnalysisResponse } from "@/features/codebase/services/analysis";
import {
	resolveWorkspaceSnapshotIdentity,
	shouldDiscardWorkspaceAnalysis,
} from "@/features/codebase/services/analysis-selection";
import {
	type SyncStatusResponse,
	syncStatusResponseSchema,
} from "@/features/codebase/services/sync";
import { shouldFetchWorkspaceAnalysis } from "@/features/codebase/services/workspace-analysis";
import { CODEBASE_SYNC_POLL_INTERVAL_MS } from "@/features/codebase/types/codebase-constants";
import { resolveWorkspaceSnapshotReady } from "../utils/workspace-contracts";
import { useWorkspaceAnalysis } from "./use-workspace-analysis";
import { useWorkspaceSyncSession } from "./use-workspace-sync-session";

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
	const [status, setStatus] = useState<SyncStatusResponse | null>(null);
	const [error, setError] = useState<string | null>(null);
	/**
	 * A failed status read, separate from the shared workspace error. The re-sync
	 * modal reports this inside its progress step; the banner outside the modal
	 * reports the shared error, so the same failure never appears twice.
	 */
	const [statusError, setStatusError] = useState<string | null>(null);
	const [isWorking, setIsWorking] = useState(false);
	const inFlight = useRef(false);
	/**
	 * The exact shared-error string this hook last wrote. A later successful
	 * read clears only that message, never a composer/analysis error it did not
	 * own.
	 */
	const statusErrorMessageRef = useRef<string | null>(null);
	const reportStatusError = useCallback((message: string) => {
		statusErrorMessageRef.current = message;
		setError(message);
		setStatusError(message);
	}, []);
	const session = useWorkspaceSyncSession({
		codebaseId,
		status,
		setStatus,
		setError,
	});
	const { activeSessionId, setActiveSessionId } = session;
	const analysisState = useWorkspaceAnalysis({
		projectId,
		currentSnapshotId,
		polledSnapshotId: status?.workspaceSnapshotId ?? currentSnapshotId,
		initialAnalysis,
		setError,
		setIsWorking,
	});
	const {
		analysis,
		setAnalysis,
		triggerAnalysis,
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
				const message = response.ok
					? "Status sync tidak valid. Coba muat ulang."
					: "Status sync tidak dapat dibaca. Coba lagi.";
				reportStatusError(message);
				return;
			}
			const activeSnapshotId = resolveWorkspaceSnapshotIdentity({
				persistedSnapshotId: currentSnapshotId,
				polledSnapshotId: parsed.data.workspaceSnapshotId ?? currentSnapshotId,
			});
			analysisIdentityRef.current = `${projectId ?? ""}:${activeSnapshotId ?? ""}`;
			const staleStatusError = statusErrorMessageRef.current;
			if (staleStatusError !== null) {
				statusErrorMessageRef.current = null;
				setError((current) => (current === staleStatusError ? null : current));
				setStatusError(null);
			}
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
					analysisStatus:
						snapshotId === parsed.data.snapshotId
							? parsed.data.analysisStatus
							: "ready",
					analysis: retained,
				})
			) {
				void readWorkspaceAnalysis(projectId, snapshotId);
			}
			// Reading status must never start billable analysis.
		} catch {
			reportStatusError("Server tidak dapat dihubungi. Coba lagi.");
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
		reportStatusError,
		status?.sessionId,
		analysisIdentityRef,
		setAnalysis,
		setActiveSessionId,
	]);
	useEffect(() => {
		void readStatus();
		const interval = setInterval(
			() => void readStatus(),
			CODEBASE_SYNC_POLL_INTERVAL_MS,
		);
		return () => clearInterval(interval);
	}, [readStatus]);

	// The live stream is used here as an immediate reconcile trigger, not as a
	// second source of truth: this surface owns its own analysis reconciliation, so
	// a real transition asks it to reconcile now instead of waiting for the next
	// poll. Polling keeps running as the reconciler, so a dropped channel cannot
	// leave the screen stale.
	const liveStatus = useCodebaseSyncStream({
		codebaseId,
		sessionId: activeSessionId,
		analysisProjectId: projectId,
	});
	const lastLiveFrameRef = useRef<string | null>(null);
	const readStatusRef = useRef(readStatus);
	readStatusRef.current = readStatus;
	useEffect(() => {
		if (!liveStatus.status) return;
		const fingerprint = JSON.stringify(liveStatus.status);
		if (lastLiveFrameRef.current === fingerprint) return;
		lastLiveFrameRef.current = fingerprint;
		void readStatusRef.current();
	}, [liveStatus.status]);
	useEffect(() => {
		if (
			status?.status === "uploaded" &&
			status.snapshotId &&
			status.snapshotId !== currentSnapshotId &&
			!status.analysisStatus &&
			!status.analysisAttemptStatus
		)
			void triggerAnalysis(status.snapshotId);
	}, [status, currentSnapshotId, triggerAnalysis]);
	const snapshotReady = resolveWorkspaceSnapshotReady({
		status,
		hasStoredSnapshot,
	});
	return {
		...analysisState,
		...session,
		isResyncDrawerOpen: session.isResyncModalOpen,
		setIsResyncDrawerOpen: session.setIsResyncModalOpen,
		status,
		error,
		statusError,
		setError,
		isWorking,
		setIsWorking,
		readStatus,
		snapshotReady,
	};
}
