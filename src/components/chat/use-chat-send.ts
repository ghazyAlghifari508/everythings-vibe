import { useCallback } from "react";
import type { ChatMessage } from "@/store";
import { MIN_PROMPT_LENGTH } from "./chat-revision";

export interface UseChatSendOptions {
	projectId?: string;
	conversationId?: string;
	selectedVersionNum?: number;
	isStreaming: boolean;
	isSubmittingRef: React.MutableRefObject<boolean>;
	addMessage: (message: ChatMessage) => void;
	setStreaming: (isStreaming: boolean) => void;
	setGeneratingPRD: (isGenerating: boolean) => void;
	setStreamingPRDContent: (content: string) => void;
	setCompletedSections: (sections: string[]) => void;
	setIsRevising: (isRevising: boolean) => void;
	setStreamingContent: (content: string) => void;
	setThinkingText: (text: string) => void;
	streamingContentRef: React.MutableRefObject<string>;
	streamApiCall: (
		body: Record<string, unknown>,
		chatMode: string,
		originalMessage: string,
		existingPartialContent?: string,
	) => Promise<void>;
}

export function useChatSend({
	projectId,
	conversationId,
	selectedVersionNum,
	isStreaming,
	isSubmittingRef,
	addMessage,
	setStreaming,
	setGeneratingPRD,
	setStreamingPRDContent,
	setCompletedSections,
	setIsRevising,
	setStreamingContent,
	setThinkingText,
	streamingContentRef,
	streamApiCall,
}: UseChatSendOptions) {
	const handleSendWithMessage = useCallback(
		async (
			msg: string,
			chatMode: "chat" | "generate" | "revise",
			displayMessage?: string | null,
		) => {
			if (isSubmittingRef.current) return;
			isSubmittingRef.current = true;

			if (
				displayMessage !== null &&
				(chatMode === "chat" || chatMode === "revise")
			) {
				addMessage({
					id: crypto.randomUUID(),
					role: "user",
					content: displayMessage || msg,
					timestamp: Date.now(),
				});
			}

			setStreaming(true);
			setStreamingContent("");
			streamingContentRef.current = "";
			if (chatMode === "revise") setIsRevising(true);
			if (chatMode !== "revise") setStreamingPRDContent("");
			if (chatMode === "generate" || chatMode === "revise") {
				setGeneratingPRD(true);
			}
			if (chatMode === "generate") {
				setCompletedSections([]);
			}

			const body: Record<string, unknown> = {
				message: msg,
				mode: chatMode,
				preferences: {},
			};
			if (conversationId) body.conversationId = conversationId;
			if (projectId) body.projectId = projectId;
			if (selectedVersionNum && chatMode === "revise") {
				body.selectedVersionNum = selectedVersionNum;
			}

			await streamApiCall(body, chatMode, displayMessage || msg);
		},
		[
			addMessage,
			conversationId,
			isSubmittingRef,
			projectId,
			selectedVersionNum,
			setCompletedSections,
			setGeneratingPRD,
			setIsRevising,
			setStreaming,
			setStreamingContent,
			setStreamingPRDContent,
			streamApiCall,
			streamingContentRef,
		],
	);

	const handleSend = useCallback(
		async (inputMessage: string, overrideMode?: "chat" | "revise") => {
			const trimmed = inputMessage.trim();
			if (!trimmed || isStreaming || isSubmittingRef.current) return;

			const resolvedMode = overrideMode || (projectId ? "revise" : "generate");

			if (resolvedMode === "generate" && trimmed.length < MIN_PROMPT_LENGTH) {
				addMessage({
					id: crypto.randomUUID(),
					role: "assistant",
					content: `Deskripsikan produkmu lebih detail (minimal ${MIN_PROMPT_LENGTH} karakter) agar saya bisa menghasilkan PRD yang berkualitas. Contoh: *"Buatkan PRD untuk aplikasi e-commerce fashion yang mendukung payment gateway dan tracking pengiriman."*`,
					timestamp: Date.now(),
				});
				return "TOO_SHORT";
			}

			isSubmittingRef.current = true;
			if (resolvedMode === "chat" || resolvedMode === "revise") {
				addMessage({
					id: crypto.randomUUID(),
					role: "user",
					content: trimmed,
					timestamp: Date.now(),
				});
			}
			if (resolvedMode === "revise") setIsRevising(true);
			setStreaming(true);
			setStreamingContent("");
			setThinkingText("");
			streamingContentRef.current = "";
			if (resolvedMode !== "revise") setStreamingPRDContent("");

			const body: Record<string, unknown> = {
				message: trimmed,
				mode: resolvedMode,
				preferences: {},
			};

			if (conversationId) body.conversationId = conversationId;
			if (projectId) body.projectId = projectId;
			if (selectedVersionNum && resolvedMode === "revise") {
				body.selectedVersionNum = selectedVersionNum;
			}
			if (resolvedMode === "generate" || resolvedMode === "revise") {
				setGeneratingPRD(true);
			}

			await streamApiCall(body, resolvedMode, trimmed);
			return "OK";
		},
		[
			addMessage,
			conversationId,
			isStreaming,
			isSubmittingRef,
			projectId,
			selectedVersionNum,
			setGeneratingPRD,
			setIsRevising,
			setStreaming,
			setStreamingContent,
			setStreamingPRDContent,
			setThinkingText,
			streamApiCall,
			streamingContentRef,
		],
	);

	return {
		handleSend,
		handleSendWithMessage,
	};
}
