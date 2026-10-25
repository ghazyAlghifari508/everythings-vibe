"use client";

import { PromptBar } from "@/components/ui/prompt-bar";

interface CodebaseChatWorkspaceComposerProps {
	draft: string;
	onDraftChange: (value: string) => void;
	onSend: (message: string) => void;
	isSending: boolean;
	minRows: number;
	className: string;
	placeholder: string;
}

export function CodebaseChatWorkspaceComposer({
	draft,
	onDraftChange,
	onSend,
	isSending,
	minRows,
	className,
	placeholder,
}: CodebaseChatWorkspaceComposerProps) {
	return (
		<PromptBar
			id="codebase-chat-composer"
			value={draft}
			onValueChange={onDraftChange}
			onSend={onSend}
			// The composer stays editable while a request is in flight so the
			// user can prepare the next message; only the submit action closes.
			// Duplicate submissions are blocked by the shared busy guard in
			// `handleSend` and by PromptBar's `canSend`, which Enter also uses.
			isSending={isSending}
			minCharsToSend={3}
			minRows={minRows}
			maxRows={6}
			className={className}
			placeholder={placeholder}
			ariaLabel={placeholder}
			submitAppearance="icon"
		/>
	);
}
