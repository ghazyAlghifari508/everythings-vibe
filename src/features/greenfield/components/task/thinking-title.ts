/**
 * Honest generating-status title for the Task page (no-hardcode.md Rule 7).
 *
 * The ONLY real signal during task generation is the model's streamed
 * reasoning (SSE `thinking` events). This helper turns that raw stream into
 * a single-line title: the newest non-empty line, tail-truncated. When no
 * thinking has arrived (non-reasoning models stay silent until done), the
 * caller shows ONE neutral static label — never a fabricated step sequence.
 */

export const IDLE_GENERATING_TITLE = "AI sedang menyusun task tree";

const THINKING_TITLE_MAX_CHARS = 80;

export function thinkingTitleText(thinking: string): string {
	const lastLine = thinking
		.split("\n")
		.map((line) => line.replace(/\s+/g, " ").trim())
		.filter(Boolean)
		.pop();
	if (!lastLine) return IDLE_GENERATING_TITLE;
	return lastLine.length > THINKING_TITLE_MAX_CHARS
		? `…${lastLine.slice(-THINKING_TITLE_MAX_CHARS)}`
		: lastLine;
}
