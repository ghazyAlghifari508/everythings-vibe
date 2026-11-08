import type {
	CodebaseSyncStatus,
	SyncStatusResponse,
} from "../types/sync-schemas";
import { syncProgressEventId } from "./sync-progress-event";

const TRANSPORT_ORDER: Record<CodebaseSyncStatus, number> = {
	waiting_for_cli: 0,
	connected: 1,
	scanning: 2,
	filtering: 3,
	uploading: 4,
	uploaded: 5,
	analyzing: 5,
	ready: 5,
	failed: 6,
	expired: 6,
};

const timestamp = (value: string | undefined) =>
	value ? Date.parse(value) : 0;

/** Reconcile full snapshots, including equal-timestamp chunk updates and retries. */
export function reconcileSyncStatus(
	current: SyncStatusResponse | null,
	incoming: SyncStatusResponse,
): SyncStatusResponse {
	if (!current) return incoming;
	if (
		current.projectId !== incoming.projectId ||
		current.sessionId !== incoming.sessionId
	)
		return current;
	if (TRANSPORT_ORDER[incoming.status] < TRANSPORT_ORDER[current.status])
		return current;
	const newerAttempt =
		incoming.analysisAttemptId !== current.analysisAttemptId &&
		timestamp(incoming.analysisAttemptCreatedAt) >
			timestamp(current.analysisAttemptCreatedAt);
	if (
		!newerAttempt &&
		Number(syncProgressEventId(incoming)) < Number(syncProgressEventId(current))
	)
		return current;
	if (current.snapshotId && !incoming.snapshotId) return current;
	if (
		current.analysisAttemptId &&
		!(
			incoming.analysisStatus === "ready" &&
			incoming.analysisId &&
			!incoming.analysisAttemptId
		)
	) {
		if (!incoming.analysisAttemptId) return current;
		if (current.analysisAttemptId !== incoming.analysisAttemptId) {
			// Attempt creation orders retries; an old failure can be written late.
			if (
				timestamp(incoming.analysisAttemptCreatedAt) <=
				timestamp(current.analysisAttemptCreatedAt)
			)
				return current;
		} else {
			if (
				timestamp(incoming.analysisAttemptUpdatedAt) <
				timestamp(current.analysisAttemptUpdatedAt)
			)
				return current;
			if (
				current.analysisAttemptStatus !== "pending" &&
				incoming.analysisAttemptStatus === "pending"
			)
				return current;
		}
	}
	if (current.status === "uploading" && incoming.status === "uploading") {
		if (
			(incoming.uploadedCount ?? 0) < (current.uploadedCount ?? 0) ||
			(incoming.manifestCount ?? 0) < (current.manifestCount ?? 0)
		)
			return current;
	}
	return JSON.stringify(current) === JSON.stringify(incoming)
		? current
		: incoming;
}
