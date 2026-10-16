import { useCallback, useRef } from "react";
import { cleanChatBubble, livePatchPrd } from "./chat-revision";

export interface StreamBufferOptions {
	chatMode: string;
	currentPrdContent: string;
	updateProgressFromContent: (content: string) => void;
	setStreamingPRDContent: (content: string) => void;
	setStreamingContent: (content: string) => void;
	streamingContentRef: React.MutableRefObject<string>;
}

export function useChatStreamBuffer({
	chatMode,
	currentPrdContent,
	updateProgressFromContent,
	setStreamingPRDContent,
	setStreamingContent,
	streamingContentRef,
}: StreamBufferOptions) {
	const pendingContentRef = useRef("");
	const flushCancelRef = useRef<(() => void) | null>(null);

	const flushContent = useCallback(() => {
		const displayContent = pendingContentRef.current;
		if (!displayContent) return;

		if (
			chatMode === "generate" ||
			chatMode === "revise" ||
			chatMode === "resume"
		) {
			updateProgressFromContent(displayContent);
		}

		if (chatMode === "generate" || chatMode === "resume") {
			setStreamingPRDContent(displayContent);
		} else if (chatMode === "revise") {
			const patched = livePatchPrd(currentPrdContent, displayContent);
			setStreamingPRDContent(patched);
			const cleaned = cleanChatBubble(displayContent);
			streamingContentRef.current = cleaned;
			setStreamingContent(cleaned);
		} else {
			setStreamingContent(displayContent);
		}
	}, [
		chatMode,
		currentPrdContent,
		setStreamingContent,
		setStreamingPRDContent,
		streamingContentRef,
		updateProgressFromContent,
	]);

	const scheduleFlush = useCallback(() => {
		if (flushCancelRef.current) return;
		if (typeof requestAnimationFrame !== "undefined") {
			const rafId = requestAnimationFrame(() => {
				flushCancelRef.current = null;
				flushContent();
			});
			flushCancelRef.current = () => cancelAnimationFrame(rafId);
		} else {
			const timeoutId = setTimeout(() => {
				flushCancelRef.current = null;
				flushContent();
			}, 16);
			flushCancelRef.current = () => clearTimeout(timeoutId);
		}
	}, [flushContent]);

	const cancelFlush = useCallback(() => {
		if (flushCancelRef.current) {
			flushCancelRef.current();
			flushCancelRef.current = null;
		}
	}, []);

	const resetBuffer = useCallback(() => {
		cancelFlush();
		pendingContentRef.current = "";
	}, [cancelFlush]);

	return {
		pendingContentRef,
		flushContent,
		scheduleFlush,
		cancelFlush,
		resetBuffer,
	};
}
