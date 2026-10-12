import { parseStreamEvent } from "./sse-events";

export interface SseConsumeResult {
	error: string | null;
}

/**
 * Real stream facts a caller may observe while a generator runs. Every handler
 * is fed by an actual SSE frame the server emitted, never by a timer or a
 * synthesized stage: `started` means the generator accepted the work,
 * `thinking` carries the model's own streamed reasoning, `delta` means document
 * bytes arrived, `done` means the artifact was durably saved server-side.
 */
export interface SseStreamHandlers {
	onStarted?: (event: { model?: string }) => void;
	onThinking?: (text: string) => void;
	onThinkingReset?: () => void;
	onDelta?: (chunk: string) => void;
	onDone?: (event: { content?: string }) => void;
}

/**
 * Consume a generator SSE stream to its terminal event. The Greenfield
 * generators (`/api/chat`, `/api/ac/generate`, `/api/task/generate`) emit
 * `{type:"done"}` strictly after the artifact is durably saved, so a stream
 * that ends without it is a truncated run and is reported as an error —
 * never as success.
 */
export async function consumeSseStream(
	response: Response,
	handlers: SseStreamHandlers = {},
): Promise<SseConsumeResult> {
	if (!response.ok) {
		const body: unknown = await response.json().catch(() => null);
		return {
			error:
				typeof body === "object" &&
				body !== null &&
				"error" in body &&
				typeof body.error === "string"
					? body.error
					: "Generator gagal. Coba lagi.",
		};
	}
	const reader = response.body?.getReader();
	if (!reader) return { error: "Generator gagal. Coba lagi." };
	const decoder = new TextDecoder();
	let buffer = "";
	let sawDone = false;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });
		const events = buffer.split("\n\n");
		buffer = events.pop() ?? "";
		for (const event of events) {
			const payload = event.trim();
			if (!payload.startsWith("data:")) continue;
			const parsed = parseStreamEvent(payload.slice(5).trim());
			if (!parsed) continue;
			if (parsed.type === "error") {
				if (typeof parsed.error === "string") return { error: parsed.error };
				continue;
			}
			if (parsed.type === "started") {
				handlers.onStarted?.(
					typeof parsed.model === "string" ? { model: parsed.model } : {},
				);
				continue;
			}
			if (parsed.type === "thinking") {
				handlers.onThinking?.(parsed.content);
				continue;
			}
			if (parsed.type === "thinking_reset") {
				handlers.onThinkingReset?.();
				continue;
			}
			if (parsed.type === "delta") {
				handlers.onDelta?.(parsed.content);
				continue;
			}
			sawDone = true;
			handlers.onDone?.(
				typeof parsed.content === "string" ? { content: parsed.content } : {},
			);
		}
	}
	if (!sawDone)
		return { error: "Generasi terputus sebelum selesai. Coba lagi." };
	return { error: null };
}
