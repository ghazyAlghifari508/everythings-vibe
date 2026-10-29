import { CODEBASE_ANALYSIS_MAX_TOKENS } from "@/features/codebase/types/codebase-constants";
import { MAX_RESUME_CONTENT_CHARS } from "@/lib/constants";
import {
	selectModels,
	tryStreamWithFallback,
} from "@/lib/services/ai-orchestrator";
import { ANALYSIS_ALLOWANCE_POLICY } from "./analysis-credit-policy";

export async function generateRevisionWithProvider(
	messages: Array<{ role: "system" | "user"; content: string }>,
) {
	const { firstChunk, generator, outcome, abortController } =
		await tryStreamWithFallback(
			selectModels(),
			messages,
			AbortSignal.timeout(ANALYSIS_ALLOWANCE_POLICY.providerTimeoutMs),
			CODEBASE_ANALYSIS_MAX_TOKENS,
		);
	let text = firstChunk;
	try {
		if (text.length > MAX_RESUME_CONTENT_CHARS)
			throw new Error("Respons revisi terlalu panjang.");
		for await (const chunk of generator) {
			text += chunk;
			if (text.length > MAX_RESUME_CONTENT_CHARS)
				throw new Error("Respons revisi terlalu panjang.");
		}
		if (text.length > MAX_RESUME_CONTENT_CHARS)
			throw new Error("Respons revisi terlalu panjang.");
		return { text, finishReason: outcome.finishReason };
	} catch (error) {
		abortController.abort();
		throw error;
	}
}
