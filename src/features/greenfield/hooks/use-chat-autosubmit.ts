import { useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { usePaymentResume } from "@/features/greenfield/hooks/use-payment-resume";
import {
	clearSetupPrompt,
	consumePendingPrdPrompt,
	getSetupPrompt,
} from "@/lib/prompt-handoff";
import { useChatStore } from "@/store";

const autoSubmittedProjectIds = new Set<string>();

export interface UseChatAutoSubmitOptions {
	projectId?: string;
	currentPrdContent?: string;
	enableAutoSubmit?: boolean;
	isReadOnly?: boolean;
	isStreaming: boolean;
	isGeneratingPRD: boolean;
	messageCount: number;
	onSubmitPrompt: (
		prompt: string,
		mode: "chat" | "generate",
		displayMessage?: string | null,
	) => Promise<void> | void;
}

export function useChatAutoSubmit({
	projectId,
	currentPrdContent = "",
	enableAutoSubmit = true,
	isReadOnly = false,
	isStreaming,
	isGeneratingPRD,
	messageCount,
	onSubmitPrompt,
}: UseChatAutoSubmitOptions) {
	const navigate = useNavigate();
	const searchStr = useLocation({ select: (l) => l.searchStr });
	const setGeneratingPRD = useChatStore((s) => s.setGeneratingPRD);
	const autoSubmitAttemptedRef = useRef(false);

	// Reset auto-submit guard when switching projects
	// biome-ignore lint/correctness/useExhaustiveDependencies: intentional reset on project switch
	useEffect(() => {
		autoSubmitAttemptedRef.current = false;
	}, [projectId]);

	// Auto-submit from /ask question flow
	useEffect(() => {
		if (
			autoSubmitAttemptedRef.current ||
			(projectId && autoSubmittedProjectIds.has(projectId)) ||
			isReadOnly ||
			!enableAutoSubmit ||
			isStreaming ||
			isGeneratingPRD ||
			Boolean(currentPrdContent) ||
			messageCount > 0
		) {
			return;
		}

		let pending = consumePendingPrdPrompt();
		if (!pending) {
			const setup = getSetupPrompt();
			if (setup) {
				pending = { prompt: setup, mode: "auto", createdAt: Date.now() };
				clearSetupPrompt();
			} else {
				return;
			}
		} else {
			clearSetupPrompt();
		}

		autoSubmitAttemptedRef.current = true;
		if (projectId) autoSubmittedProjectIds.add(projectId);

		if (pending.mode === "auto") {
			setGeneratingPRD(true);
			const autoMessage = `Generate PRD lengkap berdasarkan informasi berikut:\n\n${pending.prompt}\n\nGunakan section markers sesuai standar.`;
			const bubbleMessage = pending.displayMessage || pending.prompt;
			void onSubmitPrompt(autoMessage, "generate", bubbleMessage);
		} else {
			void onSubmitPrompt(pending.prompt, "chat");
		}
	}, [
		currentPrdContent,
		enableAutoSubmit,
		isGeneratingPRD,
		isReadOnly,
		isStreaming,
		messageCount,
		onSubmitPrompt,
		projectId,
		setGeneratingPRD,
	]);

	// Auto-resume PRD generation after payment return
	usePaymentResume({
		projectId,
		stage: "prd",
		searchStr,
		navigate,
		onResume: () => {
			setGeneratingPRD(true);
			const pending = consumePendingPrdPrompt();
			if (pending) {
				void onSubmitPrompt(
					pending.prompt,
					"generate",
					pending.displayMessage || pending.prompt,
				);
			}
		},
	});
}

export const useChatAutosubmit = useChatAutoSubmit;
