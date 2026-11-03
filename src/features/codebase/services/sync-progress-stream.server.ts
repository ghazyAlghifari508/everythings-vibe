// Live sync progress stream for `/api/codebases/$codebaseId/sync-stream`.
//
// Delivery strategy: the browser subscribes once (EventSource) and the server
// tails the persisted session state, pushing a frame only when the projection
// actually changed. Every frame carries the same authoritative snapshot the
// polling route returns plus an event id derived from persisted timestamps, so:
//   - a real transition reaches the browser without waiting for the next poll;
//   - a reconnect replays current state instead of a blank screen;
//   - a duplicated or out-of-order frame is harmless, because the payload is the
//     whole reconciled state rather than a delta to be applied.
//
// Honest limits (deliberate, not accidental):
//   - this is a change tail, not a pub/sub: a stage the CLI completes is pushed
//     as soon as the persisted row is visible, which is what makes a fast upload
//     observable as history rather than as instant success;
//   - nothing here invents, delays, or replays a stage. If the backend never
//     recorded a transition, no frame claims it.
//
// Auth is the same session cookie as the polling route, scope is pinned to one
// codebase + one session, and raw sync credentials never appear in a frame.
//
// Server-only module: it imports the database client.
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { codebases } from "@/db/schema";
import {
	CODEBASE_SYNC_STREAM_HEARTBEAT_MS,
	CODEBASE_SYNC_STREAM_INTERVAL_MS,
	CODEBASE_SYNC_STREAM_MAX_DURATION_MS,
} from "@/features/codebase/types/codebase-constants";
import { requireUser } from "@/lib/session";
import {
	SYNC_PROGRESS_HEARTBEAT_FRAME,
	syncProgressFrame,
} from "./sync-progress-event";
import { readSyncStatusSnapshot } from "./sync-status-snapshot.server";

const SSE_HEADERS = {
	"Content-Type": "text/event-stream",
	"Cache-Control": "no-cache, no-transform",
	Connection: "keep-alive",
	// Disables proxy buffering so a frame is not held back behind a buffer.
	"X-Accel-Buffering": "no",
} as const;

export async function handleCodebaseSyncStream(input: {
	request: Request;
	params: { codebaseId: string };
}): Promise<Response> {
	const { request, params } = input;

	let headers: Headers | undefined;
	try {
		const { getRequestHeaders } = await import("@tanstack/react-start/server");
		headers = getRequestHeaders();
	} catch {
		// Non-Start runtimes fall back to the request headers below.
	}
	let user: { id: string };
	try {
		user = await requireUser(headers ?? request.headers);
	} catch {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const codebaseId = params.codebaseId;
	// Cheap ownership probe: reject a foreign or deleted codebase before any
	// stream is opened, so a long-lived tail is never held for a tenant that does
	// not own it.
	const [codebase] = await db
		.select({ id: codebases.id })
		.from(codebases)
		.where(and(eq(codebases.id, codebaseId), eq(codebases.userId, user.id)))
		.limit(1);
	if (!codebase)
		return Response.json(
			{ error: "Codebase tidak ditemukan" },
			{ status: 404 },
		);

	const url = new URL(request.url);
	const sessionId = url.searchParams.get("sessionId");
	const projectId = url.searchParams.get("projectId");

	// The first read doubles as validation: an unknown session returns the same
	// documented error contract as polling instead of an empty stream.
	const initial = await readSyncStatusSnapshot({
		userId: user.id,
		codebaseId,
		sessionId,
		projectId,
	});
	if (!initial.ok)
		return Response.json(initial.body, { status: initial.status });

	let stopped = false;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let activeController: ReadableStreamDefaultController<Uint8Array> | null =
		null;
	const stop = () => {
		stopped = true;
		if (timer !== undefined) clearTimeout(timer);
		try {
			activeController?.close();
		} catch {
			// Already closed by a client abort.
		}
	};

	const encoder = new TextEncoder();
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			activeController = controller;
			const write = (chunk: string) => {
				if (stopped) return;
				try {
					controller.enqueue(encoder.encode(chunk));
				} catch {
					// Client disconnected between checks; the abort listener stops us.
				}
			};

			const startedAt = Date.now();
			let lastFingerprint = JSON.stringify(initial.snapshot);
			let lastSentAt = Date.now();
			let tickIndex = 0;

			// Reconcile immediately: a reconnect resumes from the current persisted
			// state rather than waiting for the next transition.
			write(syncProgressFrame(initial.snapshot));

			const tick = async () => {
				if (stopped) return;
				if (Date.now() - startedAt >= CODEBASE_SYNC_STREAM_MAX_DURATION_MS) {
					// Bounded retention: the client re-opens the stream instead of the
					// server holding one tail for the life of the tab.
					stop();
					return;
				}
				try {
					const result = await readSyncStatusSnapshot({
						userId: user.id,
						codebaseId,
						sessionId: initial.snapshot.sessionId,
						projectId,
						// Only the first tick settles expired credit reservations; the rest
						// read what that settled.
						reconcileCredits: tickIndex === 0,
					});
					tickIndex += 1;
					if (stopped) return;
					if (!result.ok) {
						// The session or codebase is gone: close instead of serving a
						// status that no longer exists.
						stop();
						return;
					}
					const fingerprint = JSON.stringify(result.snapshot);
					if (fingerprint !== lastFingerprint) {
						lastFingerprint = fingerprint;
						lastSentAt = Date.now();
						write(syncProgressFrame(result.snapshot));
					} else if (
						Date.now() - lastSentAt >=
						CODEBASE_SYNC_STREAM_HEARTBEAT_MS
					) {
						lastSentAt = Date.now();
						write(SYNC_PROGRESS_HEARTBEAT_FRAME);
					}
				} catch (e) {
					// A failed read is a transient transport problem: stop so the browser
					// can reconnect. It must never be reported as a sync failure.
					console.error("sync progress stream read failed:", e);
					stop();
					return;
				}
				if (!stopped)
					timer = setTimeout(tick, CODEBASE_SYNC_STREAM_INTERVAL_MS);
			};

			request.signal.addEventListener("abort", () => stop());
			timer = setTimeout(tick, CODEBASE_SYNC_STREAM_INTERVAL_MS);
		},
		cancel() {
			stop();
		},
	});

	return new Response(stream, { headers: SSE_HEADERS });
}
