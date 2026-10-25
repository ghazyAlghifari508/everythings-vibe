import { z } from "zod";
import { readSseStream } from "@/lib/sse-stream";
import type { WorkspaceGenerationStage } from "../types/durable-generation";

export interface WorkspaceGenerationLiveEvent {
	type: string;
	stage: WorkspaceGenerationStage;
	phase?: "thinking" | "generating" | "done" | "error";
	summaryMessage?: string;
	error?: string;
	[key: string]: unknown;
}

export type GenerationEventListener = (
	event: WorkspaceGenerationLiveEvent,
) => void;

const sseChunkSchema = z.object({
	type: z.string(),
	error: z.string().optional(),
	summaryMessage: z.string().optional(),
	text: z.string().optional(),
	content: z.string().optional(),
});

/**
 * Drains an SSE stream from greenfield generation routes (PRD, AC, Task).
 * Forwards genuine streaming events to optional listener while ensuring
 * raw internal model private reasoning tokens are not leaked.
 */
export async function drainGenerationSseStream(
	body: ReadableStream<Uint8Array> | null | undefined,
	stage: WorkspaceGenerationStage,
	signal?: AbortSignal,
	onEvent?: GenerationEventListener,
): Promise<{ ok: boolean; donePayload?: unknown; error?: string }> {
	if (!body) return { ok: true };
	let streamError: string | null = null;
	let donePayload: unknown = null;

	for await (const raw of readSseStream(body)) {
		if (signal?.aborted) {
			const abortErr = new Error("Generation operation aborted by worker");
			abortErr.name = "AbortError";
			throw abortErr;
		}

		const trimmed = raw.trim();
		if (!trimmed) continue;

		let rawParsed: unknown;
		try {
			rawParsed = JSON.parse(trimmed);
		} catch (parseErr) {
			console.error(
				"[drainGenerationSseStream] Invalid SSE chunk:",
				trimmed,
				parseErr,
			);
			throw new Error("Invalid SSE stream chunk: malformed JSON payload");
		}

		const parseResult = sseChunkSchema.safeParse(rawParsed);
		if (!parseResult.success) continue;
		const parsed = parseResult.data;

		if (parsed.type === "error") {
			const errMessage = parsed.error || "Generasi AI gagal di tengah jalan.";
			streamError = errMessage;
			onEvent?.({
				type: "error",
				stage,
				phase: "error",
				error: errMessage,
			});
		} else if (parsed.type === "done") {
			donePayload = rawParsed;
			onEvent?.({
				type: "done",
				stage,
				phase: "done",
				summaryMessage: parsed.summaryMessage,
			});
		} else if (parsed.type === "started") {
			onEvent?.({
				type: "started",
				stage,
				phase: "generating",
			});
		} else if (parsed.type === "thinking" || parsed.type === "thinking_reset") {
			// Safe activity event: emit high-level activity phase without leaking raw private reasoning
			onEvent?.({
				type: "activity",
				stage,
				phase: "thinking",
			});
		} else if (parsed.type === "delta") {
			onEvent?.({
				type: "delta",
				stage,
				phase: "generating",
			});
		}
	}

	if (streamError) {
		throw new Error(streamError);
	}
	return { ok: true, donePayload };
}
