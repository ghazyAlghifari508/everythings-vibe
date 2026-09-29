/**
 * AI streaming orchestration — simplified for combo routing.
 * 9Router handles model selection + fallback via prdfy-combo.
 */
import { type StreamOutcome, streamChat } from "@/lib/ai-client";
import { AI_STREAM_RETRY_ATTEMPTS } from "@/lib/constants";
import { COMBO_MODEL_ID } from "@/lib/model-config";

/** Returns single-element array with combo ID. No plan/model params needed. */
export function selectModels(): string[] {
	return [COMBO_MODEL_ID];
}

export async function tryStreamWithFallback(
	models: string[],
	messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
	externalSignal?: AbortSignal,
	maxTokens?: number,
	onThinking?: (text: string) => void,
	onThinkingReset?: () => void,
): Promise<{
	generator: AsyncGenerator<string, void, undefined>;
	firstChunk: string;
	abortController: AbortController;
	outcome: StreamOutcome;
}> {
	if (!Array.isArray(models) || models.length === 0) {
		throw new Error(
			"Konfigurasi model AI kosong — tidak ada model untuk dicoba.",
		);
	}
	let lastError = "";

	for (let i = 0; i < models.length; i++) {
		if (externalSignal?.aborted) break;
		const modelToTry = models[i];
		// Retry the upstream only while NO client-visible delta has been emitted
		// yet. Once firstChunk is in hand the real stream has started, so we
		// return and let the caller finish — retrying then would duplicate
		// already-sent bytes to the client.
		const attemptCeiling = 1 + AI_STREAM_RETRY_ATTEMPTS;
		for (let attempt = 0; attempt < attemptCeiling; attempt++) {
			const abortController = new AbortController();
			// Named listener removed in finally: without this, every attempt
			// leaks a closure (and its AbortController) onto externalSignal.
			const propagateAbort = () => abortController.abort();
			if (externalSignal) {
				if (externalSignal.aborted) abortController.abort();
				else externalSignal.addEventListener("abort", propagateAbort);
			}
			const outcome: StreamOutcome = {};
			// Thinking streams live: reasoning tokens reach the client during the
			// 30-80s reasoning phase instead of waiting for the first text-delta.
			// A failed attempt that already emitted thinking triggers a reset so
			// the retry streams fresh reasoning instead of appending a duplicate.
			let attemptThinking = false;
			const gen = streamChat(
				messages,
				modelToTry,
				abortController.signal,
				maxTokens,
				outcome,
				onThinking
					? (text) => {
							attemptThinking = true;
							onThinking(text);
						}
					: undefined,
			);

			try {
				const first = await gen.next();

				if (first.done || typeof first.value !== "string" || !first.value) {
					throw new Error("Respons kosong dari chunk model.");
				}

				return {
					generator: gen,
					firstChunk: first.value,
					abortController,
					outcome,
				};
			} catch (e) {
				lastError = e instanceof Error ? e.message : String(e);
				abortController.abort();
				await gen.return().catch(() => {});
				// ponytail: the caller is gone — releasing the server-side
				// generation claim matters more than exhausting retries. Skip any
				// remaining attempts the moment the external signal fires.
				if (externalSignal?.aborted) break;
				// Only loop if a retry is still available; otherwise fall through
				// to the next model (or the final throw below).
				const willRetry = attempt < attemptCeiling - 1 || i < models.length - 1;
				if (attemptThinking && willRetry) onThinkingReset?.();
				if (attempt < attemptCeiling - 1) continue;
			} finally {
				externalSignal?.removeEventListener("abort", propagateAbort);
			}
		}
	}

	if (externalSignal?.aborted) {
		throw new Error("AI stream aborted");
	}
	throw new Error(
		`Semua model AI sedang tidak tersedia. Coba lagi dalam beberapa menit. (${lastError})`,
	);
}
