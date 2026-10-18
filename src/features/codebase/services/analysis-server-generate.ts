// Model boundary of the codebase analysis service: the generator/message
// contracts and the default generator used when none is injected.

import { CODEBASE_ANALYSIS_MAX_TOKENS } from "@/features/codebase/types/codebase-constants";
import {
	selectModels,
	tryStreamWithFallback,
} from "@/lib/services/ai-orchestrator";

export interface AnalysisMessage {
	role: "system" | "user" | "assistant";
	content: string;
}

export type AnalysisGenerator = (
	messages: AnalysisMessage[],
) => Promise<string>;

// Default generator: the shared combo-model boundary (same as /api/chat and
// /api/ask/options). Fully collected (non-streaming) since analysis output is
// a single JSON document validated once at the end.
export async function defaultGenerate(
	messages: AnalysisMessage[],
): Promise<string> {
	const { generator, firstChunk } = await tryStreamWithFallback(
		selectModels(),
		messages,
		undefined,
		CODEBASE_ANALYSIS_MAX_TOKENS,
	);
	let fullResponse = firstChunk;
	for await (const chunk of generator) fullResponse += chunk;
	return fullResponse;
}
