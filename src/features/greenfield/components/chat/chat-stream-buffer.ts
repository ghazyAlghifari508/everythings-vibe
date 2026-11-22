import type { PrdChatMode } from "@/features/greenfield/services/prd-chat-request";
import { cleanChatBubble, livePatchPrd } from "./chat-revision";

/** Frame budget used when `requestAnimationFrame` is unavailable (SSR, tests). */
const FLUSH_FALLBACK_MS = 16;

export interface StreamBufferOptions {
	/** Mode captured when the request started; never re-read from React state. */
	mode: PrdChatMode;
	/** PRD shown when the request started; revise patches apply to this snapshot. */
	basePrdContent: string;
	/** Document prefix already received for this turn (resume). */
	initialContent?: string;
	/** False once the request lost ownership: a stale buffer never writes. */
	isCurrent: () => boolean;
	updateProgressFromContent: (content: string) => void;
	setStreamingPRDContent: (content: string) => void;
	setStreamingContent: (content: string) => void;
}

export interface StreamBuffer {
	append: (chunk: string) => void;
	/** Cancels the scheduled frame and writes everything received so far. */
	flush: () => void;
	/** Drops the scheduled frame without writing. */
	cancel: () => void;
	/** Everything received for this turn, including the resume prefix. */
	content: () => string;
	/** Natural-language text for the chat panel (revise prose, chat reply). */
	replyText: () => string;
}

/**
 * Accumulates the deltas of ONE request and routes them by the mode the request
 * started with: `generate`/`resume` write the PRD canvas, `revise` patches the
 * canvas and keeps only the prose for the chat bubble, `chat` writes the bubble.
 * Every request owns its own buffer, so a later request can never change where
 * an earlier request's pending frame lands.
 */
export function createStreamBuffer(options: StreamBufferOptions): StreamBuffer {
	const { mode, basePrdContent, isCurrent } = options;
	let content = options.initialContent ?? "";
	let dirty = false;
	let cancelScheduled: (() => void) | null = null;

	const replyText = () => {
		if (mode === "revise") return cleanChatBubble(content);
		return mode === "chat" ? content : "";
	};

	const write = () => {
		if (!dirty || !isCurrent()) return;
		dirty = false;
		if (mode === "chat") {
			options.setStreamingContent(content);
			return;
		}
		options.updateProgressFromContent(content);
		if (mode === "revise") {
			options.setStreamingPRDContent(livePatchPrd(basePrdContent, content));
			options.setStreamingContent(replyText());
			return;
		}
		options.setStreamingPRDContent(content);
	};

	const cancel = () => {
		cancelScheduled?.();
		cancelScheduled = null;
	};

	const schedule = () => {
		if (cancelScheduled) return;
		const run = () => {
			cancelScheduled = null;
			write();
		};
		if (typeof requestAnimationFrame !== "undefined") {
			const id = requestAnimationFrame(run);
			cancelScheduled = () => cancelAnimationFrame(id);
		} else {
			const id = setTimeout(run, FLUSH_FALLBACK_MS);
			cancelScheduled = () => clearTimeout(id);
		}
	};

	return {
		append: (chunk) => {
			content += chunk;
			dirty = true;
			schedule();
		},
		flush: () => {
			cancel();
			write();
		},
		cancel,
		content: () => content,
		replyText,
	};
}
