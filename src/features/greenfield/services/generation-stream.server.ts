// Shared SSE stream scaffold for the AC and Task generation endpoints.
//
// Owns the parts that must be identical in every generation stream: the guarded
// emitter, the one-shot credit release/quarantine/settle flags, the
// claim-before-generate check, and the `started`/`quote` frames. The stage's own
// success and failure tails are injected as hooks, so their persistence and
// error wording stay with the stage that owns them.

import type { CreditQuote } from "@/lib/adaptive-credit";
import {
	type CreditOperationResult,
	isReleasableReservation,
	markCreditOperationRunning,
	quarantineCreditOperation,
	releaseCreditOperation,
} from "@/lib/services/credit-service";
import { createSseEmitter, type SseEmitter } from "@/lib/sse-stream";

export interface GenerationGuards {
	/** Release the reservation; never a running one (a concurrent request owns it). */
	release(reason: string): Promise<void>;
	/** Park the reservation for manual reconciliation, without releasing it. */
	quarantine(reason: string): Promise<void>;
	/** Mark the charge settled: nothing may release or quarantine it afterwards. */
	settle(): void;
	/** Release, drop the project generation lock, emit the error, and close. */
	fail(message: string): Promise<void>;
	/** Drop the project generation lock if this stream still owns it. */
	resetLock(): Promise<void>;
	/** Emit done and close (a no-op once the stream already finished or failed). */
	done(payload: Record<string, unknown>): void;
	/** Close the stream, ignoring an already-closed controller. */
	close(): void;
}

export interface GenerationRun {
	guards: GenerationGuards;
	sse: SseEmitter;
	signal: AbortSignal;
}

export interface GenerationStreamInput {
	request: Request;
	signal?: AbortSignal;
	userId: string;
	reservation: CreditOperationResult;
	quote: CreditQuote;
	modelsToTry: string[];
	/** Emitted when the reservation is no longer ours to run. */
	conflictMessage: string;
	resetLock: () => Promise<void>;
	releaseLogLabel: string;
	quarantineLogLabel: string;
	/** Stage success tail: generate, validate, persist, settle, emit done. */
	complete(run: GenerationRun): Promise<void>;
	/** Stage failure tail: log as the stage sees fit, then emit a sanitized error. */
	onStreamError(error: unknown, guards: GenerationGuards): Promise<void>;
}

export function createGenerationStream(
	input: GenerationStreamInput,
): ReadableStream<Uint8Array> {
	const { request, userId, reservation, quote, modelsToTry } = input;

	return new ReadableStream<Uint8Array>({
		async start(controller) {
			const sse = createSseEmitter(controller);
			let eventDone = false;
			let eventErrored = false;
			let isSettled = false;
			let isReleased = false;
			let isQuarantined = false;

			const safeRelease = async (reason: string) => {
				if (isSettled || isReleased || !reservation) return;
				isReleased = true;
				// A running operation is owned by a concurrent request sharing
				// this key: never cancel it here.
				if (!isReleasableReservation(reservation.state)) return;
				try {
					await releaseCreditOperation({
						userId,
						operationId: reservation.id,
						reason,
					});
				} catch (e) {
					console.error(
						`Failed to release ${input.releaseLogLabel} credit reservation:`,
						e,
					);
				}
			};

			const safeQuarantine = async (reason: string) => {
				if (isSettled || isReleased || isQuarantined || !reservation) return;
				isQuarantined = true;
				try {
					await quarantineCreditOperation({
						userId,
						operationId: reservation.id,
						reason,
					});
				} catch (e) {
					console.error(
						`Failed to quarantine ${input.quarantineLogLabel} credit operation:`,
						e,
					);
				}
			};

			const guards: GenerationGuards = {
				release: safeRelease,
				quarantine: safeQuarantine,
				settle: () => {
					isSettled = true;
				},
				fail: async (message) => {
					if (eventDone || eventErrored) return;
					eventErrored = true;
					await safeRelease(message);
					// The error event below must always reach the client; only the
					// lock reset is ownership-gated.
					await input.resetLock();
					sse.send({ type: "error", error: message });
					sse.close();
				},
				resetLock: input.resetLock,
				done: (payload) => {
					if (eventDone || eventErrored) return;
					eventDone = true;
					sse.send(payload);
					sse.close();
				},
				close: sse.close,
			};

			try {
				await markCreditOperationRunning({
					userId,
					operationId: reservation.id,
				});
			} catch (err) {
				// The reservation is not ours to run (a concurrent request owns
				// it, or it died): do not generate against it and do not release
				// it either.
				console.error("markCreditOperationRunning error:", err);
				eventErrored = true;
				await input.resetLock();
				sse.send({ type: "error", error: input.conflictMessage });
				sse.close();
				return;
			}

			try {
				sse.send({ type: "started", model: modelsToTry[0], quote });
				sse.send({ type: "quote", quote });

				await input.complete({
					guards,
					sse,
					signal: input.signal ?? request.signal,
				});
			} catch (error) {
				await input.onStreamError(error, guards);
			}
		},
	});
}
