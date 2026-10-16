import { savePendingPrdPrompt } from "@/lib/prompt-handoff";
import type { StreamEvent } from "@/lib/sse-events";
import type { ChatMessage } from "@/store";

export interface StreamDoneContext {
	parsed: Extract<StreamEvent, { type: "done" }>;
	chatMode: string;
	projectId?: string;
	streamingNaturalLanguage: string;
	onProjectCreated?: (projectId: string) => void;
	onPrdRevised?: (content: string) => void;
	addMessage: (message: ChatMessage) => void;
	setGeneratingPRD: (isGenerating: boolean) => void;
	setStreamingPRDContent: (content: string) => void;
	setIsRevising: (isRevising: boolean) => void;
	invalidateRouter: () => void;
}

export function handleStreamDoneEvent({
	parsed,
	chatMode,
	projectId,
	streamingNaturalLanguage,
	onProjectCreated,
	onPrdRevised,
	addMessage,
	setGeneratingPRD,
	setStreamingPRDContent,
	setIsRevising,
	invalidateRouter,
}: StreamDoneContext) {
	if (parsed.projectId && onProjectCreated && !projectId) {
		setGeneratingPRD(false);
		setStreamingPRDContent("");
		onProjectCreated(parsed.projectId);
		return;
	}

	if (chatMode === "generate") {
		setGeneratingPRD(false);
		setStreamingPRDContent("");
		if (typeof parsed.content === "string" && parsed.content) {
			onPrdRevised?.(parsed.content);
		}
		invalidateRouter();
		return;
	}

	if (chatMode === "revise") {
		setGeneratingPRD(false);
		setIsRevising(false);

		const finalReply = parsed.summaryMessage || streamingNaturalLanguage;
		if (finalReply) {
			addMessage({
				id: crypto.randomUUID(),
				role: "assistant",
				content: finalReply,
				timestamp: Date.now(),
			});
		}
		if (typeof parsed.content === "string" && parsed.content) {
			onPrdRevised?.(parsed.content);
		}
	}
}

export interface StreamPostContext {
	gotDoneEvent: boolean;
	gotErrorEvent: boolean;
	chatMode: string;
	fullContent: string;
	existingPartialContent: string;
	addMessage: (message: ChatMessage) => void;
	setGeneratingPRD: (isGenerating: boolean) => void;
	setStreamingPRDContent: (content: string) => void;
	showToast: (message: string, type: "info" | "error" | "success") => void;
	invalidateRouter: () => void;
}

export function handleStreamPostCompletion({
	gotDoneEvent,
	gotErrorEvent,
	chatMode,
	fullContent,
	existingPartialContent,
	addMessage,
	setGeneratingPRD,
	setStreamingPRDContent,
	showToast,
	invalidateRouter,
}: StreamPostContext) {
	if (
		!gotDoneEvent &&
		!gotErrorEvent &&
		(chatMode === "generate" || chatMode === "revise" || chatMode === "resume")
	) {
		invalidateRouter();
		if (fullContent.trim().length === 0) {
			showToast(
				"Koneksi terputus. PRD mungkin sudah tersimpan sebagian - coba refresh halaman.",
				"info",
			);
		}
		setGeneratingPRD(false);
		setStreamingPRDContent("");
	}

	if (
		chatMode === "generate" ||
		chatMode === "resume" ||
		chatMode === "revise"
	) {
		const finalDisplayContent = existingPartialContent
			? existingPartialContent + fullContent
			: fullContent;

		if (finalDisplayContent.trim()) {
			if (chatMode === "resume") {
				setGeneratingPRD(false);
				invalidateRouter();
			}
		} else {
			addMessage({
				id: crypto.randomUUID(),
				role: "assistant",
				content:
					"Gagal menyusun PRD. AI tidak menghasilkan konten. Silakan coba lagi.",
				timestamp: Date.now(),
			});
			setGeneratingPRD(false);
		}
	} else {
		addMessage({
			id: crypto.randomUUID(),
			role: "assistant",
			content: fullContent,
			timestamp: Date.now(),
		});
	}
}

export interface HttpErrorContext {
	status: number;
	err: { code?: string; error?: string };
	body: Record<string, unknown>;
	originalMessage: string;
	setStreaming: (isStreaming: boolean) => void;
	setGeneratingPRD: (isGenerating: boolean) => void;
	setCreditsExhausted: (
		value: { stage: "prd"; message: string } | null,
	) => void;
	showToast: (message: string, type: "error" | "info" | "success") => void;
}

export function handleStreamHttpError({
	status,
	err,
	body,
	originalMessage,
	setStreaming,
	setGeneratingPRD,
	setCreditsExhausted,
	showToast,
}: HttpErrorContext) {
	setStreaming(false);
	setGeneratingPRD(false);

	if (status === 403 && err.code === "NO_CREDITS") {
		if (body.mode === "generate") {
			savePendingPrdPrompt(body.message as string, "auto", originalMessage);
		}
		setCreditsExhausted({
			stage: "prd",
			message: err.error || "Kredit habis",
		});
	} else if (status === 429) {
		setCreditsExhausted({
			stage: "prd",
			message: err.error || "Terlalu banyak request. Coba lagi nanti.",
		});
	} else if (status === 403) {
		showToast(err.error || "Akses ditolak", "error");
	} else {
		showToast(err.error || "Terjadi kesalahan", "error");
	}
}

export interface StreamErrorEventContext {
	parsed: Extract<StreamEvent, { type: "error" }>;
	chatMode: string;
	currentDisplayContent: string;
	originalMessage: string;
	triggerResumeModal: (
		errorMsg: string,
		partial: string,
		original: string,
	) => void;
	showToast: (message: string, type: "error" | "info" | "success") => void;
	addMessage: (message: ChatMessage) => void;
	onRestoreInput?: (msg: string) => void;
	setGeneratingPRD: (isGenerating: boolean) => void;
}

export function handleStreamErrorEvent({
	parsed,
	chatMode,
	currentDisplayContent,
	originalMessage,
	triggerResumeModal,
	showToast,
	addMessage,
	onRestoreInput,
	setGeneratingPRD,
}: StreamErrorEventContext) {
	const errorMsg =
		parsed.error ||
		(chatMode === "generate" || chatMode === "revise" || chatMode === "resume"
			? "Gagal menyusun PRD. Silakan coba lagi."
			: "Gagal memproses pesan. Silakan coba lagi.");

	if (
		(chatMode === "generate" || chatMode === "resume") &&
		currentDisplayContent.length > 0
	) {
		setGeneratingPRD(false);
		triggerResumeModal(errorMsg, currentDisplayContent, originalMessage);
		return;
	}

	showToast(errorMsg, "error");
	if (chatMode === "revise" || chatMode === "chat") {
		addMessage({
			id: crypto.randomUUID(),
			role: "assistant",
			content: `❌ **Pengiriman Gagal**\n\n${errorMsg}\n\n*Pesan kamu telah dikembalikan ke kotak input. Silakan coba kirim ulang.*`,
			timestamp: Date.now(),
		});
		onRestoreInput?.(originalMessage);
	} else {
		setGeneratingPRD(false);
	}
}

export interface StreamCatchContext {
	err: unknown;
	chatMode: string;
	currentDisplayContent: string;
	originalMessage: string;
	showToast: (message: string, type: "error" | "info" | "success") => void;
	triggerResumeModal: (
		errorMsg: string,
		partial: string,
		original: string,
	) => void;
	setGeneratingPRD: (isGenerating: boolean) => void;
	setStreamingPRDContent: (content: string) => void;
}

export function handleStreamCatch({
	err,
	chatMode,
	currentDisplayContent,
	originalMessage,
	showToast,
	triggerResumeModal,
	setGeneratingPRD,
	setStreamingPRDContent,
}: StreamCatchContext) {
	const isAbort = err instanceof Error && err.name === "AbortError";
	if (isAbort) {
		showToast("Proses dihentikan.", "info");
	} else {
		console.error("Chat streaming error:", err);
		showToast("Terjadi kesalahan koneksi.", "error");
	}

	if (chatMode === "generate" || chatMode === "resume") {
		setGeneratingPRD(false);
		setStreamingPRDContent("");
		if (!isAbort && currentDisplayContent.trim().length > 0) {
			triggerResumeModal(
				"Koneksi terputus saat menyusun PRD.",
				currentDisplayContent,
				originalMessage,
			);
		}
	}
}
