import { parseStreamEvent, type StreamEvent } from "@/lib/sse-events";
import { readSseStream } from "@/lib/sse-stream";

export interface AcStreamHandlers {
	onThinking: (content: string) => void;
	onThinkingReset: () => void;
	onDelta: (content: string) => void;
	onDone: () => void;
	onError: (message: string | undefined) => void;
}

/**
 * Consumes the AC generation SSE stream. Unknown or malformed frames are
 * skipped so the stream stays live; a final frame without a trailing newline
 * is never dropped because the shared parser flushes its buffer.
 *
 * Returns whether a terminal (done/error) event was observed, so the caller
 * can distinguish a truncated stream from a completed one.
 */
export async function consumeAcStream(
	body: ReadableStream<Uint8Array> | null,
	handlers: AcStreamHandlers,
): Promise<boolean> {
	let receivedTerminalEvent = false;
	for await (const data of readSseStream(body)) {
		const event: StreamEvent | null = parseStreamEvent(data);
		if (!event) continue;
		if (event.type === "thinking") {
			handlers.onThinking(event.content);
		} else if (event.type === "thinking_reset") {
			handlers.onThinkingReset();
		} else if (event.type === "delta") {
			handlers.onDelta(event.content);
		} else if (event.type === "done") {
			receivedTerminalEvent = true;
			handlers.onDone();
			break;
		} else if (event.type === "error") {
			receivedTerminalEvent = true;
			handlers.onError(event.error);
			break;
		}
	}
	return receivedTerminalEvent;
}
