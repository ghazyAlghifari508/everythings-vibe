"use client";

import { memo, useCallback, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/store";
import type { Plan } from "@/types/database";
import { ChatInputArea } from "./chat-input-area";
import { ChatMessageList } from "./chat-message-list";
import { CreditExhaustedModal } from "./credit-exhausted-modal";
import { ResumeErrorModal } from "./resume-error-modal";
import { useChatAutoSubmit } from "./use-chat-autosubmit";
import { useChatDraft } from "./use-chat-draft";
import { useChatStream } from "./use-chat-stream";

export interface ChatPanelProps {
	projectId?: string;
	conversationId?: string;
	className?: string;
	onProjectCreated?: (projectId: string) => void;
	onPrdRevised?: (content: string) => void;
	enableAutoSubmit?: boolean;
	inputDisabled?: boolean;
	isReadOnly?: boolean;
	currentPrdContent?: string;
	selectedVersionNum?: number;
	userPlan?: Plan;
}

export const ChatPanel = memo(function ChatPanel({
	projectId,
	conversationId,
	className,
	onProjectCreated,
	onPrdRevised,
	enableAutoSubmit = true,
	inputDisabled = false,
	isReadOnly = false,
	currentPrdContent = "",
	selectedVersionNum,
	userPlan: initialUserPlan = "free",
}: ChatPanelProps) {
	const inputRef = useRef<HTMLTextAreaElement>(null);
	const scrollRef = useRef<HTMLDivElement>(null);

	const creditsExhausted = useChatStore((s) => s.creditsExhausted);
	const setCreditsExhausted = useChatStore((s) => s.setCreditsExhausted);

	const { input, setInput, clearDraft } = useChatDraft(projectId);

	const stream = useChatStream({
		projectId,
		conversationId,
		currentPrdContent,
		selectedVersionNum,
		onProjectCreated,
		onPrdRevised,
		onRestoreInput: (restored) => setInput(restored),
	});

	useChatAutoSubmit({
		projectId,
		currentPrdContent,
		enableAutoSubmit,
		isReadOnly,
		isStreaming: stream.isStreaming,
		isGeneratingPRD: stream.isGeneratingPRD,
		messageCount: stream.messages.length,
		onSubmitPrompt: stream.handleSendWithMessage,
	});

	const scrollToBottom = useCallback(() => {
		if (scrollRef.current) {
			scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
		}
	}, []);

	// biome-ignore lint/correctness/useExhaustiveDependencies: scroll triggered by message / streaming state
	useEffect(() => {
		scrollToBottom();
	}, [
		stream.messages,
		stream.streamingContent,
		stream.currentSection,
		stream.thinkingText,
		scrollToBottom,
	]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: intentional focus trigger on project switch
	useEffect(() => {
		inputRef.current?.focus();
	}, [projectId]);

	const handleSend = useCallback(async () => {
		const res = await stream.handleSend(input);
		if (res === "OK") {
			clearDraft();
		}
	}, [clearDraft, input, stream]);

	const isEffectivelyDisabled = !projectId && inputDisabled;

	return (
		<div
			className={cn("flex h-full flex-col border-l border-graphite", className)}
			style={{ background: "var(--bg-elevated)" }}
		>
			<ChatMessageList
				messages={stream.messages}
				isStreaming={stream.isStreaming}
				streamingContent={stream.streamingContent}
				thinkingText={stream.thinkingText}
				currentSection={stream.currentSection}
				completedSections={stream.completedSections}
				isGeneratingPRD={stream.isGeneratingPRD}
				isRevising={stream.isRevising}
				scrollRef={scrollRef}
			/>

			<ChatInputArea
				input={input}
				setInput={setInput}
				onSend={handleSend}
				onCancel={stream.handleCancel}
				isStreaming={stream.isStreaming}
				isReadOnly={isReadOnly}
				isEffectivelyDisabled={isEffectivelyDisabled}
				isSubmitting={stream.isSubmittingRef.current}
				projectId={projectId}
				inputRef={inputRef}
			/>

			<CreditExhaustedModal
				isOpen={Boolean(creditsExhausted)}
				onClose={() => setCreditsExhausted(null)}
				errorMessage={creditsExhausted?.message || ""}
				projectId={projectId || ""}
				stage={creditsExhausted?.stage || "prd"}
				currentPlan={initialUserPlan}
			/>

			<ResumeErrorModal
				isOpen={stream.showResumeModal}
				onClose={() => stream.setShowResumeModal(false)}
				onResume={stream.handleResumePRD}
				errorMessage={stream.resumeErrorMsg}
			/>
		</div>
	);
});
