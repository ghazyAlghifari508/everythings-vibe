import { parseStreamEvent, type StreamEvent } from "@/lib/sse-events";
import { readSseStream } from "@/lib/sse-stream";

export interface ChatStreamCallbacks {
	onThinking?: (content: string) => void;
	onThinkingReset?: () => void;
	onDelta: (content: string) => void;
	onDone: (event: Extract<StreamEvent, { type: "done" }>) => void;
	onError: (event: Extract<StreamEvent, { type: "error" }>) => void;
}

export interface StreamRunResult {
	gotDoneEvent: boolean;
	gotErrorEvent: boolean;
	fullContent: string;
}

export interface ExecuteChatStreamOptions extends ChatStreamCallbacks {
	body: Record<string, unknown>;
	signal?: AbortSignal;
	onHttpError?: (
		status: number,
		data: { code?: string; error?: string },
	) => void;
}

/**
 * Consumes an SSE stream from the chat endpoint and dispatches parsed events to callbacks.
 * Isolates stream chunk reading and SSE event parsing from React component lifecycle.
 */
export async function consumeChatStream(
	body: ReadableStream<Uint8Array> | null,
	callbacks: ChatStreamCallbacks,
): Promise<StreamRunResult> {
	let fullContent = "";
	let gotDoneEvent = false;
	let gotErrorEvent = false;

	for await (const data of readSseStream(body)) {
		const parsed: StreamEvent | null = parseStreamEvent(data);
		if (!parsed) continue;

		try {
			if (parsed.type === "thinking") {
				callbacks.onThinking?.(parsed.content);
			} else if (parsed.type === "thinking_reset") {
				callbacks.onThinkingReset?.();
			} else if (parsed.type === "delta") {
				fullContent += parsed.content;
				callbacks.onDelta(parsed.content);
			} else if (parsed.type === "done") {
				gotDoneEvent = true;
				callbacks.onDone(parsed);
				break;
			} else if (parsed.type === "error") {
				gotErrorEvent = true;
				callbacks.onError(parsed);
				break;
			}
		} catch {
			console.warn(
				"SSE event dispatch failed in stream runner:",
				data.slice(0, 80),
			);
		}
	}

	return {
		gotDoneEvent,
		gotErrorEvent,
		fullContent,
	};
}

/**
 * Sends POST /api/chat and executes the SSE stream reader.
 */
export async function executeChatStreamRequest(
	options: ExecuteChatStreamOptions,
): Promise<StreamRunResult | null> {
	const response = await fetch("/api/chat", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(options.body),
		signal: options.signal,
	});

	if (!response.ok) {
		const err = (await response.json().catch(() => ({}))) as {
			code?: string;
			error?: string;
		};
		options.onHttpError?.(response.status, err);
		return null;
	}

	return consumeChatStream(response.body, options);
}
