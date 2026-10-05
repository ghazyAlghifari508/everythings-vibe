"use client";

import { useEffect, useRef, useState } from "react";
import {
	isSyncStatusInFlight,
	isTerminalSyncStatus,
	type SyncStatusResponse,
	syncStatusResponseSchema,
} from "@/lib/codebase-sync";
import {
	CODEBASE_SYNC_ACTIVE_POLL_INTERVAL_MS,
	CODEBASE_SYNC_POLL_INTERVAL_MS,
	CODEBASE_SYNC_REQUEST_TIMEOUT_MS,
} from "@/lib/constants";

export interface UseCodebaseSyncStatusOptions {
	/** Codebase whose status is authoritative for this flow. */
	codebaseId: string | null;
	/** Explicit endpoint. Defaults to the codebase-scoped status route. */
	statusPath?: string;
	/**
	 * Session to pin every request to. Combined with the last observed session
	 * id so a concurrent retry (new latest session) cannot silently retarget
	 * polling at a different attempt.
	 */
	sessionId?: string | null;
	/**
	 * Project that owns the per-feature analysis record. The status endpoint only
	 * attaches `analysisStatus` when this query is present.
	 */
	analysisProjectId?: string | null;
	/**
	 * Cadence for a session that is still `waiting_for_cli`. Nothing the server
	 * reports can change until the user runs the CLI, so this may be slow.
	 */
	pollIntervalMs?: number;
	/**
	 * Cadence once an attempt is genuinely in flight (`connected` through
	 * `uploading`), where real persisted states can pass in a short window.
	 * Defaults to the active constant; only tests override it.
	 */
	activePollIntervalMs?: number;
	requestTimeoutMs?: number;
	/** False keeps the loop dormant (no codebase yet, or the caller unmounted). */
	enabled?: boolean;
	/** Persisted state recovered on refresh, used until the first poll lands. */
	initialStatus?: SyncStatusResponse | null;
}

/**
 * The one codebase-sync status reconciliation loop in the app.
 *
 * Every onboarding surface reads the same snapshot instead of running its own
 * poller: the prompt screen needs the CLI handshake, the sync screen needs the
 * transport stages, and the conclusion screen needs the persisted analysis
 * status. Two concurrent loops would race each other into showing contradictory
 * states, so ownership lives here and consumers receive the result.
 *
 * The protections below are load-bearing, not incidental:
 * - a generation guard (`seqRef`) discards responses from a superseded effect
 *   run, so switching codebase cannot paint stale state;
 * - an in-flight guard keeps one request outstanding at a time, so a slow
 *   response cannot overlap the next tick;
 * - a per-request abort timeout retires a hung request instead of stalling the
 *   loop forever;
 * - the pinned session id keeps the loop on the attempt the user is watching;
 * - the cadence is chosen from the last SERVER-REPORTED status, so the loop
 *   reconciles quickly while a real attempt is in flight and slowly while the
 *   session is still waiting for the CLI. This changes only how often the
 *   browser asks — never what it renders, which always comes from the polled
 *   status — so it cannot manufacture a stage the server never reported.
 */
export function useCodebaseSyncStatus({
	codebaseId,
	statusPath,
	sessionId,
	analysisProjectId,
	pollIntervalMs = CODEBASE_SYNC_POLL_INTERVAL_MS,
	activePollIntervalMs = CODEBASE_SYNC_ACTIVE_POLL_INTERVAL_MS,
	requestTimeoutMs = CODEBASE_SYNC_REQUEST_TIMEOUT_MS,
	enabled = true,
	initialStatus = null,
}: UseCodebaseSyncStatusOptions): {
	status: SyncStatusResponse | null;
	error: string | null;
} {
	const [status, setStatus] = useState<SyncStatusResponse | null>(
		initialStatus,
	);
	const [error, setError] = useState<string | null>(null);
	// The cadence is chosen from the last status the SERVER reported, never from
	// a timer or a local guess, so a faster loop can only ever occur while the
	// server has actually told us an attempt is in flight.
	const activeRef = useRef(
		initialStatus ? isSyncStatusInFlight(initialStatus.status) : false,
	);
	const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const inFlightRef = useRef(false);
	const abortRef = useRef<AbortController | null>(null);
	const seqRef = useRef(0);
	// A ref, not state, so the very next tick inside the same effect run already
	// uses the pinned id without waiting for a restart.
	const pinnedSessionRef = useRef<string | null>(
		sessionId ?? initialStatus?.sessionId ?? null,
	);
	if (sessionId) pinnedSessionRef.current = sessionId;

	// A recovered status can arrive after the first render (refresh recovery
	// resolves the codebase asynchronously), so adopt it as the seed whenever it
	// appears. Only fills an empty state: once a poll has landed, the live
	// snapshot always wins, so a late recovery read can never rewind the screen.
	useEffect(() => {
		if (!initialStatus) return;
		activeRef.current = isSyncStatusInFlight(initialStatus.status);
		setStatus((current) => (current === null ? initialStatus : current));
	}, [initialStatus]);

	useEffect(() => {
		if (!enabled || !codebaseId) return;
		seqRef.current += 1;
		const seq = seqRef.current;
		let cancelled = false;

		const nextInterval = () =>
			activeRef.current ? activePollIntervalMs : pollIntervalMs;

		const scheduleNext = (fn: () => void) => {
			if (cancelled || seq !== seqRef.current) return;
			timeoutRef.current = setTimeout(fn, nextInterval());
		};

		const fetchStatus = async () => {
			if (cancelled || seq !== seqRef.current) return;
			if (inFlightRef.current) {
				scheduleNext(() => {
					void fetchStatus();
				});
				return;
			}
			inFlightRef.current = true;
			const controller = new AbortController();
			abortRef.current = controller;
			const abortTimeout = setTimeout(
				() => controller.abort(),
				requestTimeoutMs,
			);
			let isTerminal = false;
			try {
				const activeSessionId = sessionId ?? pinnedSessionRef.current;
				const queryParams = new URLSearchParams();
				if (activeSessionId) queryParams.set("sessionId", activeSessionId);
				if (analysisProjectId) queryParams.set("projectId", analysisProjectId);
				const query = queryParams.toString() ? `?${queryParams}` : "";
				const path =
					statusPath ??
					`/api/codebases/${encodeURIComponent(codebaseId)}/status`;
				const response = await fetch(`${path}${query}`, {
					signal: controller.signal,
				});
				if (cancelled || seq !== seqRef.current) return;
				if (controller.signal.aborted) return;
				const body: unknown = await response.json().catch(() => null);
				if (cancelled || seq !== seqRef.current) return;
				if (!response.ok) {
					setError(
						typeof body === "object" &&
							body !== null &&
							"error" in body &&
							typeof body.error === "string"
							? body.error
							: "Gagal membaca status sync.",
					);
					return;
				}
				const parsed = syncStatusResponseSchema.safeParse(body);
				if (!parsed.success) {
					setError("Gagal membaca status sync.");
					return;
				}
				if (cancelled || seq !== seqRef.current) return;
				pinnedSessionRef.current = parsed.data.sessionId;
				activeRef.current = isSyncStatusInFlight(parsed.data.status);
				setStatus(parsed.data);
				setError(null);
				if (isTerminalSyncStatus(parsed.data.status)) isTerminal = true;
			} catch {
				if (cancelled || seq !== seqRef.current) return;
				if (controller.signal.aborted) return;
				setError("Gagal menghubungi server.");
			} finally {
				clearTimeout(abortTimeout);
				if (seq === seqRef.current) {
					inFlightRef.current = false;
					if (abortRef.current === controller) abortRef.current = null;
				}
				if (!cancelled && seq === seqRef.current && !isTerminal) {
					scheduleNext(() => {
						void fetchStatus();
					});
				}
			}
		};

		void fetchStatus();
		return () => {
			cancelled = true;
			abortRef.current?.abort();
			abortRef.current = null;
			inFlightRef.current = false;
			if (timeoutRef.current) {
				clearTimeout(timeoutRef.current);
				timeoutRef.current = null;
			}
		};
	}, [
		codebaseId,
		statusPath,
		sessionId,
		pollIntervalMs,
		activePollIntervalMs,
		requestTimeoutMs,
		enabled,
		analysisProjectId,
	]);

	return { status, error };
}
