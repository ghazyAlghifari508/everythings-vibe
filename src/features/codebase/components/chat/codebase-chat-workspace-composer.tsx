"use client";

import { PromptBar } from "@/components/ui/prompt-bar";
import type { CodebaseComposerMode } from "@/features/codebase/services/revision-intent";

interface CodebaseChatWorkspaceComposerProps {
	/** Name of the plan the next message targets. Null while creating. */
	composerTargetName: string | null;
	composerMode: CodebaseComposerMode;
	/** Copy describing a revision's impact on existing tasks. */
	revisionImpactNotice: string | null;
	draft: string;
	onDraftChange: (value: string) => void;
	onSend: (message: string) => void;
	isSending: boolean;
	minRows: number;
	className: string;
	placeholder: string;
}

export function CodebaseChatWorkspaceComposer({
	composerTargetName,
	composerMode,
	revisionImpactNotice,
	draft,
	onDraftChange,
	onSend,
	isSending,
	minRows,
	className,
	placeholder,
}: CodebaseChatWorkspaceComposerProps) {
	return (
		<div className="flex w-full flex-col gap-2.5">
			{composerTargetName ? (
				<p
					data-testid="codebase-composer-target"
					className="truncate text-[11px] text-fog"
				>
					{`Fitur aktif: ${composerTargetName}`}
				</p>
			) : (
				<p
					data-testid="codebase-composer-target"
					className="truncate text-[11px] text-fog"
				>
					Fitur baru
				</p>
			)}
			{composerMode === "revise" && revisionImpactNotice ? (
				<p
					data-testid="codebase-revision-impact"
					className="rounded-lg border border-graphite bg-obsidian p-2.5 text-[11px] leading-4 text-fog"
				>
					{revisionImpactNotice}
				</p>
			) : null}
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
		</div>
	);
}
