// Server-only SSE stream for `POST /api/chat` (PRD generate / revise / resume /
// chat). Owns the credit lifecycle of a turn: the reservation is marked running
// before the model call, released on any failure, quarantined when a durable
// version could not be charged, and settled exactly once on success.
//
// The persistence tail lives in `prd-chat-persist.server.ts`; this module only
// drives the stream, the conversation fallback, and the failure branches.

import type { CreditQuote } from "@/lib/adaptive-credit";
import { normalizeLanguage, type OutputLanguage } from "@/lib/language";
import { tryStreamWithFallback } from "@/lib/services/ai-orchestrator";
import {
	type CreditOperationResult,
	isReleasableReservation,
	markCreditOperationRunning,
	quarantineCreditOperation,
	releaseCreditOperation,
} from "@/lib/services/credit-service";
import { sanitizeErrorForClient } from "@/lib/services/error-sanitizer";
import { createSseEmitter } from "@/lib/sse-stream";
import type { Plan } from "@/types/database";
import {
	ConversationProjectOwnershipError,
	ensureConversation,
	rollbackStreamInserts,
} from "./chat-service";
import { type PrdTurnGuards, persistPrdTurn } from "./prd-chat-persist.server";
import type { PrdChatMode } from "./prd-chat-request";
import { deriveProjectNameSync } from "./prd-naming";
import { resolveProjectId } from "./prd-service";

export interface PrdChatMessage {
	role: "system" | "user" | "assistant";
	content: string;
}

/**
 * Ids the turn resolves as it runs: a generate turn creates its project and
 * conversation lazily, once the model has actually produced a first chunk.
 */
export interface PrdTurnIds {
	conversationId?: string;
	projectId?: string;
	createdConversationId?: string;
	createdProjectId?: string;
}

export interface PrdChatStreamInput {
	request: Request;
	userId: string;
	mode: PrdChatMode;
	message: string;
	displayMessage?: string;
	partialContent?: string;
	preferences: Record<string, unknown> | null;
	selectedVersionNum?: number;
	revisionBaseContent?: string | null;
	revisionBaseVersion?: number;
	projectLanguage: OutputLanguage;
	systemPrompt: string;
	conversationHistory: PrdChatMessage[];
	modelsToTry: string[];
	plan: Plan;
	creditQuote?: CreditQuote;
	reservation?: CreditOperationResult;
	codebaseSnapshotId?: string;
	codebaseAnalysisId?: string;
	codebaseSnapshotInfo?: { fileCount?: number; sourceBytes?: number };
	ids: PrdTurnIds;
}

export function createPrdChatStream(
	input: PrdChatStreamInput,
): ReadableStream<Uint8Array> {
	const { request, ids, mode, userId, reservation, creditQuote } = input;

	return new ReadableStream({
		async start(controller) {
			const sse = createSseEmitter(controller);
			let fullResponse = "";
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
					console.error("Failed to release credit operation:", e);
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
					console.error("Failed to quarantine credit operation:", e);
				}
			};

			const guards: PrdTurnGuards = {
				fail: async (message) => {
					if (eventDone || eventErrored) return;
					eventErrored = true;
					await safeRelease(message);
					sse.send({ type: "error", error: message });
					sse.close();
				},
				quarantine: safeQuarantine,
				settled: () => {
					isSettled = true;
				},
			};

			const safeDone = (extras: Record<string, unknown>) => {
				if (eventDone) return;
				eventDone = true;
				const isEn = normalizeLanguage(input.projectLanguage) === "en";
				sse.send({
					type: "done",
					summaryMessage: isEn
						? "Finished generating PRD."
						: "Selesai menyusun PRD.",
					...extras,
				});
				sse.close();
			};

			if (mode === "generate" && reservation) {
				try {
					await markCreditOperationRunning({
						userId,
						operationId: reservation.id,
					});
				} catch (err) {
					// The reservation is not ours to run (a concurrent request
					// owns it, or it died): do not generate against it and do
					// not release it either.
					console.error("markCreditOperationRunning error:", err);
					eventErrored = true;
					sse.send({
						type: "error",
						error: "PRD sedang digenerate. Tunggu hingga selesai.",
					});
					sse.close();
					return;
				}
			}
			sse.send({
				type: "started",
				model: input.modelsToTry[0],
				quote: creditQuote,
			});
			if (creditQuote) sse.send({ type: "quote", quote: creditQuote });

			const fullMessages: PrdChatMessage[] =
				mode === "resume" && input.partialContent
					? [
							{ role: "system", content: input.systemPrompt },
							...input.conversationHistory,
							{ role: "user", content: input.message },
							{ role: "assistant", content: input.partialContent },
							{
								role: "user",
								content:
									"Koneksi terputus. Lanjutkan penulisan dokumen tepat dari bagian terakhir teks di atas tanpa mengulang kalimat sebelumnya.",
							},
						]
					: [
							{ role: "system", content: input.systemPrompt },
							...input.conversationHistory,
							{ role: "user", content: input.message },
						];

			try {
				const { generator, firstChunk, outcome } = await tryStreamWithFallback(
					input.modelsToTry,
					fullMessages,
					request.signal,
					undefined,
					sse.thinking,
					sse.thinkingReset,
				);

				if (!ids.conversationId) {
					try {
						const result = await ensureConversation(
							userId,
							ids.projectId,
							deriveProjectNameSync(input.message),
							input.preferences,
						);
						ids.conversationId = result.conversationId;
						ids.projectId = result.projectId;
						ids.createdConversationId = result.createdConversationId;
						ids.createdProjectId = result.createdProjectId;
					} catch (error) {
						if (error instanceof ConversationProjectOwnershipError) {
							await safeRelease("conversation ownership mismatch");
							await guards.fail("Project not found or unauthorized");
							return;
						}
						throw error;
					}
				}

				fullResponse += firstChunk;
				sse.delta(firstChunk);

				for await (const chunk of generator) {
					fullResponse += chunk;
					sse.delta(chunk);
				}

				const persisted = await persistPrdTurn({
					guards,
					userId,
					plan: input.plan,
					mode,
					message: input.message,
					displayMessage: input.displayMessage,
					selectedVersionNum: input.selectedVersionNum,
					revisionBaseContent: input.revisionBaseContent,
					revisionBaseVersion: input.revisionBaseVersion,
					partialContent: input.partialContent,
					projectLanguage: input.projectLanguage,
					conversationId: ids.conversationId,
					projectId: ids.projectId,
					fullResponse,
					finishReason: outcome.finishReason,
					reservation,
					modelsToTry: input.modelsToTry,
					codebaseSnapshotId: input.codebaseSnapshotId,
					codebaseAnalysisId: input.codebaseAnalysisId,
					codebaseSnapshotInfo: input.codebaseSnapshotInfo,
				});
				if (persisted.stopped) return;

				const resolvedProject = await resolveProjectId(
					ids.projectId,
					ids.conversationId,
				);
				const donePayload: Record<string, unknown> = {
					conversationId: ids.conversationId,
					projectId: resolvedProject || undefined,
					summaryMessage: persisted.assistantReply,
				};
				if (mode === "revise" && persisted.finalPrdToSave)
					donePayload.content = persisted.finalPrdToSave;
				safeDone(donePayload);
			} catch (error) {
				await safeRelease(
					error instanceof Error ? error.message : "stream error",
				);
				const errMsg = error instanceof Error ? error.message : String(error);
				const errName = error instanceof Error ? error.name : "";
				const isClientAbort =
					errName === "AbortError" ||
					/aborted|Invalid state: The stream closed|Controller is already closed|ReadableStream/i.test(
						errMsg,
					);

				// ponytail: a client disconnect mid-stream (refresh, tab close,
				// network blip) is normal and is NOT a reason to delete the
				// just-created project + conversation. Roll back only on a real
				// generation error that produced no content yet: a project with
				// a partial PRD is recoverable, a deleted project loses the
				// user's entry entirely.
				if (isClientAbort && fullResponse.length > 0) {
					console.warn(
						"Chat stream: client disconnected mid-generation; kept project + conversation.",
					);
				} else if (isClientAbort) {
					console.warn(
						"Chat stream: client disconnected before content; kept project for retry.",
					);
				} else if (fullResponse.length === 0) {
					try {
						await rollbackStreamInserts(
							userId,
							ids.createdConversationId,
							ids.createdProjectId,
						);
					} catch (rollbackError) {
						console.error(
							"Failed to roll back chat stream inserts:",
							rollbackError,
						);
					}
					await guards.fail(sanitizeErrorForClient(error));
				} else {
					console.error(
						"Chat stream errored after content; kept partial state:",
						errMsg,
					);
					await guards.fail(sanitizeErrorForClient(error));
				}
			} finally {
				if (!eventDone && !eventErrored) sse.close();
			}
		},
	});
}
