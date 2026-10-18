import { useCallback, useEffect, useRef, useState } from "react";
import type { AnalysisResponse } from "@/features/codebase/services/analysis";
import {
	resolveWorkspaceSnapshotIdentity,
	shouldDiscardWorkspaceAnalysis,
} from "@/features/codebase/services/analysis-selection";
import {
	getPendingSyncPayloadKey,
	SNAPSHOT_CONTEXT_STATUSES,
	type SyncPromptPayload,
	type SyncStatusResponse,
	syncPromptPayloadSchema,
	syncStatusResponseSchema,
} from "@/features/codebase/services/sync";
import { shouldFetchWorkspaceAnalysis } from "@/features/codebase/services/workspace-analysis";
import { CODEBASE_SYNC_POLL_INTERVAL_MS } from "@/features/codebase/types/codebase-constants";
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
	const [isResyncDrawerOpen, setIsResyncDrawerOpen] = useState(false);
	const [status, setStatus] = useState<SyncStatusResponse | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [isStarting, setIsStarting] = useState(false);
	const [isWorking, setIsWorking] = useState(false);
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
			if (status?.sessionId) queryParams.set("sessionId", status.sessionId);
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
				setIsResyncDrawerOpen(true);
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
	useEffect(() => {
		if (
			!payload ||
			!status?.snapshotId ||
			!SNAPSHOT_CONTEXT_STATUSES.includes(status.status)
		)
			return;
		setPayload(null);
		setIsResyncDrawerOpen(false);
	}, [payload, status?.snapshotId, status?.status]);
	const startSession = async (
		action: CodebaseSessionStartAction = "initial",
	) => {
		setIsStarting(true);
		setIsResyncDrawerOpen(true);
		setError(null);
		try {
			const response = await fetch(
				`/api/codebases/${encodeURIComponent(codebaseId)}/session`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(getCodebaseSessionRequestBody(action)),
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
			setStatus(null);
			setAnalysis(null);
			analysisAttemptedFor.current = null;
		} catch {
			setError("Server tidak dapat dihubungi.");
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
		isResyncDrawerOpen,
		setIsResyncDrawerOpen,
		status,
		error,
		setError,
		isStarting,
		isWorking,
		setIsWorking,
		readStatus,
		startSession,
		snapshotReady,
	};
}
