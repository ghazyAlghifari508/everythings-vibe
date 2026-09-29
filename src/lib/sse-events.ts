/**
 * Typed SSE contract for AI generation streams (PRD/AC/Task).
 *
 * Every server generator emits the same `data:` JSON shapes; every client
 * consumer parses them through parseStreamEvent. Unknown or malformed frames
 * yield null so consumers skip them instead of throwing mid-stream.
 */
import { z } from "zod";

const sseStartedEventSchema = z
	.object({ type: z.literal("started"), model: z.string().optional() })
	.catchall(z.unknown());

const sseQuoteEventSchema = z
	.object({ type: z.literal("quote") })
	.catchall(z.unknown());

const sseThinkingEventSchema = z.object({
	type: z.literal("thinking"),
	content: z.string(),
});

const sseThinkingResetEventSchema = z.object({
	type: z.literal("thinking_reset"),
});

const sseDeltaEventSchema = z.object({
	type: z.literal("delta"),
	content: z.string(),
});

const sseDoneEventSchema = z
	.object({
		type: z.literal("done"),
		content: z.string().optional(),
		summaryMessage: z.string().optional(),
		projectId: z.string().optional(),
		conversationId: z.string().optional(),
		taskTree: z.unknown().optional(),
	})
	.catchall(z.unknown());

const sseErrorEventSchema = z
	.object({ type: z.literal("error"), error: z.string().optional() })
	.catchall(z.unknown());

export const streamEventSchema = z.discriminatedUnion("type", [
	sseStartedEventSchema,
	sseQuoteEventSchema,
	sseThinkingEventSchema,
	sseThinkingResetEventSchema,
	sseDeltaEventSchema,
	sseDoneEventSchema,
	sseErrorEventSchema,
]);

export type StreamEvent = z.infer<typeof streamEventSchema>;

/**
 * Parse one raw SSE `data:` payload into a typed StreamEvent.
 * Returns null for malformed JSON or unknown event types — the caller skips.
 */
export function parseStreamEvent(raw: string): StreamEvent | null {
	try {
		const parsed: unknown = JSON.parse(raw);
		const result = streamEventSchema.safeParse(parsed);
		return result.success ? result.data : null;
	} catch {
		return null;
	}
}
