import {
	type StudioPrototypeMessage,
	studioPrototypeMessageSchema,
} from "../types/studio-prototype";

export interface StudioPrototypeExpectation {
	channel: string;
	screenId: string;
	/** The iframe's contentWindow; a sandboxed document's origin is "null". */
	source: unknown;
}

/**
 * Parent-side gate for every message from the prototype document. The sender
 * window, the per-document channel and the screen identity must all match, and
 * the payload must satisfy a strict schema, before any command is interpreted.
 * Anything else is dropped silently: there is no unvalidated postMessage path.
 */
export function acceptStudioPrototypeMessage(
	event: { source: unknown; origin: string; data: unknown },
	expected: StudioPrototypeExpectation,
): StudioPrototypeMessage | null {
	if (
		!expected.source ||
		event.source !== expected.source ||
		event.origin !== "null"
	)
		return null;
	const parsed = studioPrototypeMessageSchema.safeParse(event.data);
	if (!parsed.success) return null;
	if (
		parsed.data.channel !== expected.channel ||
		parsed.data.screenId !== expected.screenId
	)
		return null;
	return parsed.data;
}
