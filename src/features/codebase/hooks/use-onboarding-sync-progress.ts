import { useState } from "react";
import type { SyncStatusResponse } from "../services/sync";
import { reconcileSyncStatus } from "../services/sync-status-reconciliation";
import { useCodebaseSyncStatus } from "./use-codebase-sync-status";
import { useCodebaseSyncStream } from "./use-codebase-sync-stream";

/** Stream, fallback polling, and recovery share one monotonic session snapshot. */
export function useOnboardingSyncProgress(input: {
	codebaseId: string | null;
	sessionId: string | null;
	analysisProjectId: string | null;
	initialStatus: SyncStatusResponse | null;
}) {
	const identity = `${input.codebaseId}:${input.sessionId}:${input.analysisProjectId}`;
	const [accepted, setAccepted] = useState<{
		identity: string;
		status: SyncStatusResponse | null;
	}>({ identity, status: null });
	const current = accepted.identity === identity ? accepted.status : null;
	const stream = useCodebaseSyncStream({
		...input,
		enabled: input.codebaseId !== null,
	});
	const streamDelivers = stream.connection === "live" && stream.status !== null;
	const polled = useCodebaseSyncStatus({
		...input,
		initialStatus: current ?? input.initialStatus,
		enabled: input.codebaseId !== null && !streamDelivers,
	});
	let status = current;
	for (const candidate of [input.initialStatus, polled.status, stream.status]) {
		if (
			!candidate ||
			candidate.projectId !== input.codebaseId ||
			(input.sessionId && candidate.sessionId !== input.sessionId)
		)
			continue;
		status = reconcileSyncStatus(status, candidate);
	}
	if (accepted.identity !== identity || status !== current)
		setAccepted({ identity, status });
	return {
		status,
		error: streamDelivers ? null : polled.error,
		streamNotice:
			stream.connection === "reconnecting"
				? "Koneksi pembaruan terputus. Menghubungkan kembali..."
				: null,
	};
}
