// Pure frame encoding for the live sync progress stream.
//
// Kept out of the server handler so the protocol (event id, event name, frame
// shape) is testable without a database or a socket.

import type { SyncStatusResponse } from "../types/sync-schemas";

export const SYNC_PROGRESS_EVENT_NAME = "sync";

// Every field below is a real timestamp the server persisted for this attempt.
// The newest one identifies the frame, so an event id only ever moves forward
// when the backend actually recorded something new.
const SYNC_PROGRESS_TIMESTAMP_FIELDS = [
	"updatedAt",
	"createdAt",
	"snapshotCreatedAt",
	"analysisAttemptUpdatedAt",
	"analysisAttemptCreatedAt",
] as const;

export function syncProgressEventId(snapshot: SyncStatusResponse): string {
	let newest = 0;
	for (const field of SYNC_PROGRESS_TIMESTAMP_FIELDS) {
		const value = snapshot[field];
		if (!value) continue;
		const ms = Date.parse(value);
		if (Number.isFinite(ms) && ms > newest) newest = ms;
	}
	return String(newest);
}

/** The full status is the event payload: replaying it is idempotent. */
export function syncProgressFrame(snapshot: SyncStatusResponse): string {
	return `id: ${syncProgressEventId(snapshot)}\nevent: ${SYNC_PROGRESS_EVENT_NAME}\ndata: ${JSON.stringify(snapshot)}\n\n`;
}

export const SYNC_PROGRESS_HEARTBEAT_FRAME = ": ping\n\n";
