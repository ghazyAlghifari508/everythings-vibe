export interface SseEvent {
	data: string;
}

/**
 * Incrementally parses an SSE byte stream into `data:` payload strings.
 * Flushes the trailing buffer (with flush=true) when the reader closes so a
 * final event without a trailing newline is never dropped, and normalizes
 * `\r` line endings.
 */
export function createSseLineParser() {
	const decoder = new TextDecoder();
	let buffer = "";

	return {
		feed(chunk: Uint8Array, flush = false): string[] {
			buffer += decoder.decode(chunk, { stream: !flush });
			if (flush) buffer += decoder.decode();
			const parts = buffer.split(/\r?\n/);
			buffer = flush ? "" : (parts.pop() ?? "");
			return parts
				.filter((line) => line.startsWith("data: "))
				.map((line) => line.slice(6));
		},
		end(): string[] {
			return this.feed(new Uint8Array(), true);
		},
	};
}

/**
 * Reads a fetch `ReadableStream` of SSE frames and yields every `data:`
 * payload string, including a final frame that lacks a trailing newline.
 */
export async function* readSseStream(
	body: ReadableStream<Uint8Array> | null | undefined,
): AsyncGenerator<string, void> {
	if (!body) return;
	const reader = body.getReader();
	const parser = createSseLineParser();
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			for (const data of parser.feed(value)) yield data;
		}
		for (const data of parser.end()) yield data;
	} finally {
		reader.releaseLock();
	}
}

/**
 * Server-side writer for the generation streams (PRD chat, AC, Task).
 *
 * A client that disconnects mid-stream (refresh, tab close, network blip)
 * closes the controller under the generator, so every enqueue is guarded: a
 * failed write must never surface as a stream error, because the server-side
 * work after it (credit settlement, persistence) still has to complete.
 */
export interface SseEmitter {
	/** Emit one typed event frame. */
	send(payload: Record<string, unknown>): void;
	/** Emit a content delta. */
	delta(content: string): void;
	/** Emit a reasoning/progress fragment. */
	thinking(content: string): void;
	/** Tell the client the previous thinking fragments are superseded. */
	thinkingReset(): void;
	/** Close the stream, ignoring an already-closed controller. */
	close(): void;
}

export function createSseEmitter(
	controller: ReadableStreamDefaultController<Uint8Array>,
): SseEmitter {
	const encoder = new TextEncoder();
	const write = (frame: Record<string, unknown>) => {
		try {
			controller.enqueue(encoder.encode(`data: ${JSON.stringify(frame)}\n\n`));
		} catch {}
	};
	return {
		send: write,
		delta: (content) => write({ type: "delta", content }),
		thinking: (content) => write({ type: "thinking", content }),
		thinkingReset: () => write({ type: "thinking_reset" }),
		close: () => {
			try {
				controller.close();
			} catch {}
		},
	};
}

/** Standard SSE response wrapper; every generation stream uses these headers. */
export function sseResponse(stream: ReadableStream<Uint8Array>): Response {
	return new Response(stream, {
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
			Connection: "keep-alive",
		},
	});
}
