import { useRouter } from "@tanstack/react-router";
import {
	startTransition,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { useChatStore, useUIStore } from "@/store";
import { extractSections } from "./chat-revision";
import {
	handleStreamCatch,
	handleStreamDoneEvent,
	handleStreamErrorEvent,
	handleStreamHttpError,
	handleStreamPostCompletion,
} from "./chat-stream-handlers";
import { executeChatStreamRequest } from "./chat-stream-runner";
import { useChatResumeModal } from "./use-chat-resume-modal";
import { useChatSectionProgress } from "./use-chat-section-progress";
import { useChatSend } from "./use-chat-send";
import { useChatStreamBuffer } from "./use-chat-stream-buffer";

export interface UseChatStreamOptions {
	projectId?: string;
	conversationId?: string;
	currentPrdContent?: string;
	selectedVersionNum?: number;
	onProjectCreated?: (projectId: string) => void;
	onPrdRevised?: (content: string) => void;
	onRestoreInput?: (restoredMessage: string) => void;
}

export function useChatStream({
	projectId,
	conversationId: initialConversationId,
	currentPrdContent = "",
	selectedVersionNum,
	onProjectCreated,
	onPrdRevised,
	onRestoreInput,
}: UseChatStreamOptions) {
	const [conversationId, setConversationId] = useState(initialConversationId);
	const [streamingContent, setStreamingContent] = useState("");
	const [thinkingText, setThinkingText] = useState("");
	const [isRevising, setIsRevising] = useState(false);
	const [activeChatMode, setActiveChatMode] = useState<string>("chat");

	const isSubmittingRef = useRef(false);
	const abortControllerRef = useRef<AbortController | null>(null);
	const streamingContentRef = useRef("");
	const thinkingTextRef = useRef(thinkingText);
	thinkingTextRef.current = thinkingText;

	const router = useRouter();
	const showToast = useUIStore((s) => s.showToast);
	const messages = useChatStore((s) => s.messages);
	const isStreaming = useChatStore((s) => s.isStreaming);
	const isGeneratingPRD = useChatStore((s) => s.isGeneratingPRD);
	const addMessage = useChatStore((s) => s.addMessage);
	const setStreaming = useChatStore((s) => s.setStreaming);
	const setGeneratingPRD = useChatStore((s) => s.setGeneratingPRD);
	const setStreamingPRDContent = useChatStore((s) => s.setStreamingPRDContent);
	const setCreditsExhausted = useChatStore((s) => s.setCreditsExhausted);

	const resumeModal = useChatResumeModal();

	const {
		completedSections,
		setCompletedSections,
		currentSection,
		updateProgressFromContent,
		markAllSectionsCompleted,
	} = useChatSectionProgress(currentPrdContent, isGeneratingPRD);

	const buffer = useChatStreamBuffer({
		chatMode: activeChatMode,
		currentPrdContent,
		updateProgressFromContent,
		setStreamingPRDContent,
		setStreamingContent,
		streamingContentRef,
	});

	useEffect(() => {
		if (!isStreaming) isSubmittingRef.current = false;
	}, [isStreaming]);

	const previousProjectIdRef = useRef(projectId);
	useEffect(() => {
		if (
			previousProjectIdRef.current &&
			projectId &&
			previousProjectIdRef.current !== projectId
		) {
			if (abortControllerRef.current) {
				abortControllerRef.current.abort();
				abortControllerRef.current = null;
			}
		}
		previousProjectIdRef.current = projectId;
	}, [projectId]);

	const handleCancel = useCallback(() => {
		abortControllerRef.current?.abort();
		abortControllerRef.current = null;
		setStreaming(false);
		setGeneratingPRD(false);
		setStreamingPRDContent("");
		isSubmittingRef.current = false;
	}, [setStreaming, setGeneratingPRD, setStreamingPRDContent]);

	const streamApiCall = useCallback(
		async (
			body: Record<string, unknown>,
			chatMode: string,
			originalMessage: string,
			existingPartialContent = "",
		) => {
			setActiveChatMode(chatMode);
			const abortController = new AbortController();
			abortControllerRef.current = abortController;

			try {
				let errorHandled = false;
				let streamResultFullContent = "";

				const streamResult = await executeChatStreamRequest({
					body,
					signal: abortController.signal,
					onHttpError: (status, err) => {
						handleStreamHttpError({
							status,
							err,
							body,
							originalMessage,
							setStreaming,
							setGeneratingPRD,
							setCreditsExhausted,
							showToast,
						});
						isSubmittingRef.current = false;
					},
					onThinking: (chunk) => setThinkingText((prev) => prev + chunk),
					onThinkingReset: () => setThinkingText(""),
					onDelta: (chunk) => {
						if (thinkingTextRef.current) setThinkingText("");
						streamResultFullContent += chunk;
						buffer.pendingContentRef.current =
							(buffer.pendingContentRef.current || existingPartialContent) +
							chunk;
						buffer.scheduleFlush();
					},
					onDone: (parsed) => {
						buffer.cancelFlush();
						buffer.flushContent();
						buffer.pendingContentRef.current = "";
						if (parsed.conversationId) setConversationId(parsed.conversationId);
						const finalContentHere = existingPartialContent
							? existingPartialContent + streamResultFullContent
							: streamResultFullContent;
						markAllSectionsCompleted(finalContentHere);

						if (chatMode === "revise") {
							const freshContent =
								(typeof parsed.content === "string" && parsed.content) ||
								currentPrdContent;
							if (freshContent) {
								const allSecs = extractSections(freshContent);
								if (allSecs.length > 0) setCompletedSections(allSecs);
							}
						}

						handleStreamDoneEvent({
							parsed,
							chatMode,
							projectId,
							streamingNaturalLanguage:
								streamingContentRef.current || streamingContent,
							onProjectCreated,
							onPrdRevised,
							addMessage,
							setGeneratingPRD,
							setStreamingPRDContent,
							setIsRevising,
							invalidateRouter: () =>
								startTransition(() => {
									router.invalidate();
								}),
						});
					},
					onError: (parsed) => {
						errorHandled = true;
						buffer.cancelFlush();
						buffer.pendingContentRef.current = "";
						const currentDisplayContent = existingPartialContent
							? existingPartialContent + streamResultFullContent
							: streamResultFullContent;

						handleStreamErrorEvent({
							parsed,
							chatMode,
							currentDisplayContent,
							originalMessage,
							triggerResumeModal: resumeModal.triggerResumeModal,
							showToast,
							addMessage,
							onRestoreInput,
							setGeneratingPRD,
						});
					},
				});

				if (!streamResult || errorHandled) return;

				buffer.cancelFlush();
				buffer.flushContent();
				buffer.pendingContentRef.current = "";

				handleStreamPostCompletion({
					gotDoneEvent: streamResult.gotDoneEvent,
					gotErrorEvent: streamResult.gotErrorEvent,
					chatMode,
					fullContent: streamResult.fullContent,
					existingPartialContent,
					addMessage,
					setGeneratingPRD,
					setStreamingPRDContent,
					showToast,
					invalidateRouter: () =>
						startTransition(() => {
							router.invalidate();
						}),
				});
			} catch (err: unknown) {
				handleStreamCatch({
					err,
					chatMode,
					currentDisplayContent: existingPartialContent
						? existingPartialContent + buffer.pendingContentRef.current
						: buffer.pendingContentRef.current,
					originalMessage,
					showToast,
					triggerResumeModal: resumeModal.triggerResumeModal,
					setGeneratingPRD,
					setStreamingPRDContent,
				});
			} finally {
				buffer.resetBuffer();
				setStreaming(false);
				setStreamingContent("");
				if (chatMode !== "generate" && chatMode !== "resume") {
					setGeneratingPRD(false);
					setStreamingPRDContent("");
				}
				isSubmittingRef.current = false;
				abortControllerRef.current = null;
			}
		},
		[
			addMessage,
			buffer,
			currentPrdContent,
			markAllSectionsCompleted,
			onProjectCreated,
			onPrdRevised,
			onRestoreInput,
			projectId,
			resumeModal.triggerResumeModal,
			router,
			setCompletedSections,
			setCreditsExhausted,
			setGeneratingPRD,
			setStreaming,
			setStreamingPRDContent,
			showToast,
			streamingContent,
		],
	);

	const handleResumePRD = useCallback(async () => {
		const origMsg = resumeModal.originalMessageStore;
		const partial = resumeModal.partialContentStore;
		resumeModal.clearResumeModal();

		if (isSubmittingRef.current || !partial) return;
		isSubmittingRef.current = true;
		setStreaming(true);
		setGeneratingPRD(true);

		const body: Record<string, unknown> = {
			message: origMsg,
			mode: "resume",
			partialContent: partial,
			preferences: {},
		};
		if (conversationId) body.conversationId = conversationId;
		if (projectId) body.projectId = projectId;

		await streamApiCall(body, "resume", origMsg, partial);
	}, [
		conversationId,
		projectId,
		resumeModal,
		setGeneratingPRD,
		setStreaming,
		streamApiCall,
	]);

	const { handleSend, handleSendWithMessage } = useChatSend({
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
	});

	return {
		conversationId,
		streamingContent,
		thinkingText,
		isRevising,
		currentSection,
		isSubmittingRef,
		showResumeModal: resumeModal.showResumeModal,
		setShowResumeModal: resumeModal.setShowResumeModal,
		resumeErrorMsg: resumeModal.resumeErrorMsg,
		handleResumePRD,
		handleCancel,
		handleSend,
		handleSendWithMessage,
		messages,
		isStreaming,
		isGeneratingPRD,
		completedSections,
	};
}
