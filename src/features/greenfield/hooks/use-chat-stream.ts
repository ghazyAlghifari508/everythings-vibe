import { useRouter } from "@tanstack/react-router";
import {
	startTransition,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { extractSections } from "@/features/greenfield/components/chat/chat-revision";
import { createStreamBuffer } from "@/features/greenfield/components/chat/chat-stream-buffer";
import {
	handleStreamCatch,
	handleStreamDoneEvent,
	handleStreamErrorEvent,
	handleStreamHttpError,
	handleStreamPostCompletion,
} from "@/features/greenfield/components/chat/chat-stream-handlers";
import { executeChatStreamRequest } from "@/features/greenfield/components/chat/chat-stream-runner";
import { useGenerationNavigationGuard } from "@/features/greenfield/hooks/use-generation-navigation-guard";
import type { PrdChatMode } from "@/features/greenfield/services/prd-chat-request";
import { useChatStore, useUIStore } from "@/store";
import { useChatResumeModal } from "./use-chat-resume-modal";
import { useChatSectionProgress } from "./use-chat-section-progress";
import { useChatSend } from "./use-chat-send";

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

	const isSubmittingRef = useRef(false);
	const abortControllerRef = useRef<AbortController | null>(null);
	const activeRequestRef = useRef<number | null>(null);
	const requestSeqRef = useRef(0);
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

	useGenerationNavigationGuard(isStreaming);

	useEffect(() => {
		if (!isStreaming) isSubmittingRef.current = false;
	}, [isStreaming]);

	const previousProjectIdRef = useRef(projectId);
	useEffect(() => {
		const previousProjectId = previousProjectIdRef.current;
		previousProjectIdRef.current = projectId;
		if (!previousProjectId || !projectId || previousProjectId === projectId) {
			return;
		}
		if (activeRequestRef.current === null) return;
		// The in-flight request belongs to the previous project: revoke its
		// ownership first so late events cannot write into this project.
		activeRequestRef.current = null;
		abortControllerRef.current?.abort();
		abortControllerRef.current = null;
		isSubmittingRef.current = false;
		setStreaming(false);
		setGeneratingPRD(false);
		setStreamingPRDContent("");
		setStreamingContent("");
		setThinkingText("");
		setIsRevising(false);
	}, [projectId, setGeneratingPRD, setStreaming, setStreamingPRDContent]);

	const handleCancel = useCallback(() => {
		// Retain ownership until the aborted request has finished its cleanup.
		abortControllerRef.current?.abort();
	}, []);

	const streamApiCall = useCallback(
		async (
			body: Record<string, unknown>,
			chatMode: PrdChatMode,
			originalMessage: string,
			existingPartialContent = "",
		) => {
			const requestId = ++requestSeqRef.current;
			activeRequestRef.current = requestId;
			const isCurrent = () => activeRequestRef.current === requestId;
			const abortController = new AbortController();
			abortControllerRef.current = abortController;

			const buffer = createStreamBuffer({
				mode: chatMode,
				basePrdContent: currentPrdContent,
				initialContent: existingPartialContent,
				isCurrent,
				updateProgressFromContent,
				setStreamingPRDContent,
				setStreamingContent: (text) => {
					streamingContentRef.current = text;
					setStreamingContent(text);
				},
			});
			const invalidateRouter = () =>
				startTransition(() => {
					router.invalidate();
				});

			try {
				let errorHandled = false;

				const streamResult = await executeChatStreamRequest({
					body,
					signal: abortController.signal,
					onHttpError: (status, err) => {
						if (!isCurrent()) return;
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
					},
					onThinking: (chunk) => {
						if (isCurrent()) setThinkingText((prev) => prev + chunk);
					},
					onThinkingReset: () => {
						if (isCurrent()) setThinkingText("");
					},
					onDelta: (chunk) => {
						if (!isCurrent()) return;
						if (thinkingTextRef.current) setThinkingText("");
						buffer.append(chunk);
					},
					onDone: (parsed) => {
						if (!isCurrent()) return;
						buffer.flush();
						if (parsed.conversationId) setConversationId(parsed.conversationId);
						if (chatMode !== "chat") markAllSectionsCompleted(buffer.content());

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
							streamingNaturalLanguage: buffer.replyText(),
							onProjectCreated,
							onPrdRevised,
							addMessage,
							setGeneratingPRD,
							setStreamingPRDContent,
							setIsRevising,
							invalidateRouter,
						});
					},
					onError: (parsed) => {
						if (!isCurrent()) return;
						errorHandled = true;
						buffer.flush();
						handleStreamErrorEvent({
							parsed,
							chatMode,
							currentDisplayContent: buffer.content(),
							originalMessage,
							triggerResumeModal: resumeModal.triggerResumeModal,
							showToast,
							addMessage,
							onRestoreInput,
							setGeneratingPRD,
						});
					},
				});

				if (!streamResult || errorHandled || !isCurrent()) return;

				buffer.flush();
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
					invalidateRouter,
				});
			} catch (err: unknown) {
				if (!isCurrent()) return;
				buffer.cancel();
				handleStreamCatch({
					err,
					chatMode,
					currentDisplayContent: buffer.content(),
					originalMessage,
					showToast,
					triggerResumeModal: resumeModal.triggerResumeModal,
					setGeneratingPRD,
					setStreamingPRDContent,
				});
			} finally {
				buffer.cancel();
				// A superseded request (project switch) was already reset by its
				// replacement; touching the shared flags here would clobber it.
				if (isCurrent()) {
					activeRequestRef.current = null;
					abortControllerRef.current = null;
					setStreaming(false);
					setStreamingContent("");
					setIsRevising(false);
					if (chatMode !== "generate" && chatMode !== "resume") {
						setGeneratingPRD(false);
						setStreamingPRDContent("");
					}
					isSubmittingRef.current = false;
				}
			}
		},
		[
			addMessage,
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
			updateProgressFromContent,
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
