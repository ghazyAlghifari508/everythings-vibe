"use client";

import { useEffect, useRef, useState } from "react";
import {
	type SyncStatusResponse,
	syncStatusResponseSchema,
} from "@/features/codebase/services/sync";
import { syncProgressEventId } from "@/features/codebase/services/sync-progress-event";
import { CODEBASE_SYNC_STREAM_MAX_RECONNECT_ATTEMPTS } from "@/features/codebase/types/codebase-constants";

/**
 * Live sync progress channel.
 *
 * The browser subscribes once per attempt instead of waiting for the next poll,
 * so a real `waiting → connected → uploading → uploaded` sequence reaches the UI
 * as it happens. This hook owns delivery only: every state it paints comes from a
 * server frame, and it never derives, interpolates, or delays a stage.
 *
 * Degradation is explicit rather than silent:
 * - `idle`          no attempt to watch yet;
 * - `connecting`    first subscription in flight;
 * - `live`          frames are arriving;
 * - `reconnecting`  the channel dropped and the browser is re-opening it;
 * - `unavailable`   the channel cannot be used (unsupported after repeated
 *                   failures), so the caller falls back to status polling.
 *
 * A dropped channel is a transport fact, never a sync failure: `unavailable` only
 * means "use the other delivery mechanism".
 */
export type SyncStreamConnection =
	| "idle"
	| "connecting"
	| "live"
	| "reconnecting"
	| "unavailable";

export interface UseCodebaseSyncStreamOptions {
	codebaseId: string | null;
	/** Session to watch. A frame from another session is dropped. */
	sessionId?: string | null;
	/** Project that owns the analysis record the frame reports. */
	analysisProjectId?: string | null;
	enabled?: boolean;
}

export interface UseCodebaseSyncStreamResult {
	/** Latest frame, or null when no frame has arrived yet. */
	status: SyncStatusResponse | null;
	connection: SyncStreamConnection;
}

function buildStreamUrl(input: {
	codebaseId: string;
	sessionId: string | null;
	analysisProjectId: string | null;
}): string {
	const query = new URLSearchParams();
	if (input.sessionId) query.set("sessionId", input.sessionId);
	if (input.analysisProjectId) query.set("projectId", input.analysisProjectId);
	const suffix = query.toString() ? `?${query}` : "";
	return `/api/codebases/${encodeURIComponent(input.codebaseId)}/sync-stream${suffix}`;
}

export function useCodebaseSyncStream({
	codebaseId,
	sessionId,
	analysisProjectId,
	enabled = true,
}: UseCodebaseSyncStreamOptions): UseCodebaseSyncStreamResult {
	const [status, setStatus] = useState<SyncStatusResponse | null>(null);
	const [connection, setConnection] = useState<SyncStreamConnection>("idle");
	// Frames are tagged with the attempt they belong to, and the tag is compared
	// in a ref so a late frame from a superseded session cannot paint the new one.
	const pinnedSessionRef = useRef<string | null>(sessionId ?? null);
	pinnedSessionRef.current = sessionId ?? null;

	// The session id is the trigger even though the effect reads it through the
	// ref: a new attempt must tear the subscription down and reopen it for the new
	// identity, otherwise the old stream keeps painting the old attempt.
	// biome-ignore lint/correctness/useExhaustiveDependencies: sessionId is the attempt identity and must restart the subscription
	useEffect(() => {
		if (!enabled || !codebaseId) {
			setStatus(null);
			setConnection("idle");
			return;
		}
		if (typeof EventSource === "undefined") {
			// No streaming runtime (server render, older browser): the caller's
			// polling loop stays in charge.
			setStatus(null);
			setConnection("unavailable");
			return;
		}

		let cancelled = false;
		let source: EventSource | null = null;
		let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
		let failures = 0;
		let hasReceivedFrame = false;
		let hasBeenLive = false;
		// Event identity for this attempt. The server tags every frame with the
		// newest persisted timestamp, which only moves forward; a frame older than
		// the last accepted one is out of order (a race across a reconnect) and is
		// dropped instead of rewinding the screen. Frames without an id fall back
		// to the same derivation, so the guard never depends on transport detail.
		let lastEventId: number | null = null;
		let lastPayload: string | null = null;

		// A new attempt is a reset, not a migration.
		setStatus(null);
		setConnection("connecting");

		const connect = () => {
			if (cancelled) return;
			source?.close();
			const stream = new EventSource(
				buildStreamUrl({
					codebaseId,
					sessionId: pinnedSessionRef.current,
					analysisProjectId: analysisProjectId ?? null,
				}),
			);
			source = stream;

			stream.addEventListener("sync", (event) => {
				if (cancelled) return;
				let payload: unknown;
				try {
					payload = JSON.parse((event as MessageEvent<string>).data);
				} catch {
					return;
				}
				const parsed = syncStatusResponseSchema.safeParse(payload);
				if (!parsed.success) return;
				// Late frame from a previous attempt: drop it instead of repainting.
				const expected = pinnedSessionRef.current;
				if (
					parsed.data.projectId !== codebaseId ||
					(expected && parsed.data.sessionId !== expected)
				)
					return;
				// Event identity, in priority order: the transport id the server wrote,
				// then the payload's own newest persisted timestamp. A strictly older
				// frame is a delayed delivery, not a new state.
				const rawEventId = (event as MessageEvent<string>).lastEventId;
				const incomingEventId =
					rawEventId && rawEventId.length > 0
						? Number(rawEventId)
						: Number(syncProgressEventId(parsed.data));
				if (
					Number.isFinite(incomingEventId) &&
					lastEventId !== null &&
					incomingEventId < lastEventId
				)
					return;
				if (Number.isFinite(incomingEventId)) lastEventId = incomingEventId;
				// An identical payload is a duplicate delivery of the state already
				// painted; skipping it keeps one render per real transition. A changed
				// payload with the same id (upload counts move without a session
				// timestamp) is still a real update and must not be lost.
				const serialized = JSON.stringify(parsed.data);
				if (serialized === lastPayload) return;
				lastPayload = serialized;
				failures = 0;
				hasReceivedFrame = true;
				hasBeenLive = true;
				pinnedSessionRef.current = parsed.data.sessionId;
				setStatus(parsed.data);
				setConnection("live");
			});

			stream.onopen = () => {
				if (cancelled) return;
				failures = 0;
				setConnection("live");
			};

			stream.onerror = () => {
				if (cancelled) return;
				stream.close();
				source = null;
				failures += 1;
				if (failures > CODEBASE_SYNC_STREAM_MAX_RECONNECT_ATTEMPTS) {
					// Fall back to polling, which owns its own error and retry handling.
					setStatus(null);
					setConnection("unavailable");
					return;
				}
				setConnection(
					hasBeenLive || hasReceivedFrame ? "reconnecting" : "connecting",
				);
				const backoffMs = Math.min(1000 * 2 ** (failures - 1), 4000);
				reconnectTimer = setTimeout(connect, backoffMs);
			};
		};

		connect();

		return () => {
			cancelled = true;
			if (reconnectTimer) clearTimeout(reconnectTimer);
			source?.close();
		};
	}, [codebaseId, sessionId, analysisProjectId, enabled]);

	return { status, connection };
}
