"use client";

import { useState } from "react";
import {
	buildExportPlanCommand,
	buildPlanHandoffPrompt,
} from "../components/chat/codebase-chat-workspace-handoff";

export function useWorkspaceChatControls({
	projectIdForHandoff,
	codebaseName,
	composerAvailable,
	isSending,
	isRunWorking,
	answersReadOnly,
	onSendMessage,
	onSubmitAnswer,
}: {
	projectIdForHandoff?: string | null;
	codebaseName?: string;
	composerAvailable?: boolean;
	isSending?: boolean;
	isRunWorking?: boolean;
	answersReadOnly?: boolean;
	onSendMessage?:
		| ((message: string) => void)
		| ((message: string) => boolean | Promise<boolean>);
	onSubmitAnswer?: (questionId: string, answer: string) => void;
}) {
	const [draft, setDraft] = useState("");
	const [copiedCmd, setCopiedCmd] = useState(false);
	const [copiedExport, setCopiedExport] = useState(false);
	const [editingQuestionId, setEditingQuestionId] = useState<string | null>(
		null,
	);

	const exportCmd = projectIdForHandoff
		? buildExportPlanCommand(projectIdForHandoff)
		: null;
	const handoffPrompt = projectIdForHandoff
		? buildPlanHandoffPrompt(projectIdForHandoff, codebaseName ?? null)
		: null;

	const handleCopyCmd = async () => {
		if (!handoffPrompt) return;
		try {
			if (!navigator.clipboard?.writeText) return;
			await navigator.clipboard.writeText(handoffPrompt);
			setCopiedCmd(true);
			setTimeout(() => setCopiedCmd(false), 2000);
		} catch {
			return;
		}
	};

	const handleCopy = async (
		text: string,
		setState: (value: boolean) => void,
	) => {
		try {
			if (!navigator.clipboard?.writeText) return;
			await navigator.clipboard.writeText(text);
			setState(true);
			setTimeout(() => setState(false), 2000);
		} catch {
			return;
		}
	};

	const handleSend = (text?: string) => {
		const message = (text ?? draft).trim();
		if (!composerAvailable || message.length < 3 || isSending || isRunWorking)
			return;
		const accepted = onSendMessage?.(message);
		if (accepted instanceof Promise) {
			void accepted.then((success) => {
				if (success) setDraft("");
			});
		} else if (accepted !== false) setDraft("");
	};

	const handlePrefillDraft = (text: string) => {
		setDraft(text);
		const composerEl = document.getElementById(
			"codebase-chat-composer",
		) as HTMLTextAreaElement | null;
		if (composerEl) {
			composerEl.focus();
			const len = text.length;
			composerEl.setSelectionRange?.(len, len);
		}
	};

	const handleEditQuestion = (questionId: string) => {
		if (!answersReadOnly) setEditingQuestionId(questionId);
	};

	const handleCancelEditQuestion = () => setEditingQuestionId(null);

	const handleSubmitAnswerControlled = (questionId: string, answer: string) => {
		if (answersReadOnly) return;
		setEditingQuestionId(null);
		onSubmitAnswer?.(questionId, answer);
	};

	return {
		draft,
		setDraft,
		copiedCmd,
		copiedExport,
		setCopiedExport,
		editingQuestionId,
		exportCmd,
		handoffPrompt,
		handleCopyCmd,
		handleCopy,
		handleSend,
		handlePrefillDraft,
		handleEditQuestion,
		handleCancelEditQuestion,
		handleSubmitAnswer: handleSubmitAnswerControlled,
	};
}
