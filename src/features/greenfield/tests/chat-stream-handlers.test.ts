import { describe, expect, it, vi } from "vitest";
import {
	handleStreamDoneEvent,
	handleStreamErrorEvent,
	handleStreamHttpError,
	handleStreamPostCompletion,
} from "@/features/greenfield/components/chat/chat-stream-handlers";

describe("chat-stream-handlers", () => {
	it("handleStreamDoneEvent notifies project created for new project", () => {
		const onProjectCreated = vi.fn();
		const setGeneratingPRD = vi.fn();
		const setStreamingPRDContent = vi.fn();

		handleStreamDoneEvent({
			parsed: {
				type: "done",
				projectId: "proj-123",
				conversationId: "conv-1",
			},
			chatMode: "generate",
			projectId: undefined,
			streamingNaturalLanguage: "",
			currentPrdContent: "",
			onProjectCreated,
			addMessage: vi.fn(),
			setGeneratingPRD,
			setStreamingPRDContent,
			setIsRevising: vi.fn(),
			invalidateRouter: vi.fn(),
		});

		expect(setGeneratingPRD).toHaveBeenCalledWith(false);
		expect(setStreamingPRDContent).toHaveBeenCalledWith("");
		expect(onProjectCreated).toHaveBeenCalledWith("proj-123");
	});

	it("handleStreamDoneEvent updates PRD and invalidates router on generate done", () => {
		const onPrdRevised = vi.fn();
		const invalidateRouter = vi.fn();

		handleStreamDoneEvent({
			parsed: {
				type: "done",
				content: "# Final PRD",
			},
			chatMode: "generate",
			projectId: "existing-proj",
			streamingNaturalLanguage: "",
			currentPrdContent: "",
			onPrdRevised,
			addMessage: vi.fn(),
			setGeneratingPRD: vi.fn(),
			setStreamingPRDContent: vi.fn(),
			setIsRevising: vi.fn(),
			invalidateRouter,
		});

		expect(onPrdRevised).toHaveBeenCalledWith("# Final PRD");
		expect(invalidateRouter).toHaveBeenCalled();
	});

	it("handleStreamErrorEvent opens resume modal if partial content exists", () => {
		const triggerResumeModal = vi.fn();
		const showToast = vi.fn();

		handleStreamErrorEvent({
			parsed: {
				type: "error",
				error: "Stream interrupted",
			},
			chatMode: "generate",
			currentDisplayContent: "# Overview\nIncomplete...",
			originalMessage: "Create app",
			triggerResumeModal,
			showToast,
			addMessage: vi.fn(),
			setGeneratingPRD: vi.fn(),
		});

		expect(triggerResumeModal).toHaveBeenCalledWith(
			"Stream interrupted",
			"# Overview\nIncomplete...",
			"Create app",
		);
		expect(showToast).not.toHaveBeenCalled();
	});

	it("handleStreamHttpError handles NO_CREDITS with 403", () => {
		const setCreditsExhausted = vi.fn();
		const setStreaming = vi.fn();

		handleStreamHttpError({
			status: 403,
			err: { code: "NO_CREDITS", error: "No balance" },
			body: { mode: "generate", message: "Make app" },
			originalMessage: "Make app",
			setStreaming,
			setGeneratingPRD: vi.fn(),
			setCreditsExhausted,
			showToast: vi.fn(),
		});

		expect(setStreaming).toHaveBeenCalledWith(false);
		expect(setCreditsExhausted).toHaveBeenCalledWith({
			stage: "prd",
			message: "No balance",
		});
	});

	it("handleStreamPostCompletion shows fallback message if PRD stream produced empty content", () => {
		const addMessage = vi.fn();
		handleStreamPostCompletion({
			gotDoneEvent: true,
			gotErrorEvent: false,
			chatMode: "generate",
			fullContent: "   ",
			existingPartialContent: "",
			addMessage,
			setGeneratingPRD: vi.fn(),
			setStreamingPRDContent: vi.fn(),
			showToast: vi.fn(),
			invalidateRouter: vi.fn(),
		});

		expect(addMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				role: "assistant",
				content: expect.stringContaining("Gagal menyusun PRD"),
			}),
		);
	});
});
